'use strict';
// Pruebas unitarias de los componentes de seguridad (sin servidor HTTP).

const { entero, rutaFoto, monedaChilena } = require('../../src/utils/validar');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verificarPassword } = require('../../src/services/password');
const { cargarConfig } = require('../../src/config/env');
const { detectarTipo } = require('../../src/middleware/subidas');
const { tokensIguales } = require('../../src/middleware/csrf');
const { validar, esquemaItem } = require('../../src/utils/formularios');

describe('entero() — validacion de identificadores', () => {
  test.each([['1', 1], ['42', 42], ['2147483647', 2147483647], [7, 7]])('acepta %p', (v, esperado) => {
    expect(entero(v)).toBe(esperado);
  });
  test.each([['0'], ['-1'], ['1.5'], ['1e2'], ['0x10'], [' 5'], ['5 '], ['abc'], [''], ['2147483648'], ['1 OR 1=1'], [null], [undefined], [{}], [['1']]])(
    'rechaza %p', (v) => { expect(entero(v)).toBeNull(); }
  );
});

describe('rutaFoto() — rutas de imagen', () => {
  test('acepta nombres seguros', () => {
    expect(rutaFoto(1, 'item1.jpg')).toBe('/imagenes/cod1/item1.jpg');
    expect(rutaFoto(2, 'resto2.PNG')).toBe('/imagenes/cod2/resto2.PNG');
  });
  test.each([['../../etc/passwd'], ['a/b.jpg'], ['..jpg'], ['x.php'], ['x.jpg.php'], [''], [null], ['a b.jpg'], ['a..b.jpg']])(
    'rechaza %p', (f) => { expect(rutaFoto(1, f)).toBeNull(); }
  );
});

describe('monedaChilena()', () => {
  test.each([[0, '$ 0'], [999, '$ 999'], [1000, '$ 1.000'], [12500, '$ 12.500'], [1234567, '$ 1.234.567'], ['3500', '$ 3.500'], [null, '$ 0']])(
    '%p -> %s', (n, s) => { expect(monedaChilena(n)).toBe(s); }
  );
});

describe('escape de salida en el frontend (ASVS V1.2)', () => {
  // El backend entrega JSON y el frontend arma el DOM con textContent/createElement: ningun sumidero de HTML.
  const dir = path.join(__dirname, '..', '..', 'frontend', 'public', 'js', 'app');
  test.each(fs.readdirSync(dir).filter((f) => f.endsWith('.js')))('%s no usa innerHTML, outerHTML, insertAdjacentHTML, document.write ni eval', (f) => {
    const codigo = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codigo).not.toMatch(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
  });
});

describe('hash de contrasenas (scrypt)', () => {
  test('genera sales distintas y verifica correctamente', async () => {
    const a = await hashPassword('Clave-Segura-123');
    const b = await hashPassword('Clave-Segura-123');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verificarPassword('Clave-Segura-123', a)).toBe(true);
    expect(await verificarPassword('clave-segura-123', a)).toBe(false);
    expect(await verificarPassword('', a)).toBe(false);
  });
  test('un hash malformado o en texto plano nunca valida', async () => {
    expect(await verificarPassword('admin01', 'admin01')).toBe(false);
    expect(await verificarPassword('x', 'scrypt$1$2')).toBe(false);
    expect(await verificarPassword('x', '')).toBe(false);
  });
});

describe('comparacion de tokens CSRF', () => {
  test('solo iguales exactos', () => {
    expect(tokensIguales('abc', 'abc')).toBe(true);
    expect(tokensIguales('abc', 'abd')).toBe(false);
    expect(tokensIguales('abc', 'abcd')).toBe(false);
    expect(tokensIguales('abc', undefined)).toBe(false);
    expect(tokensIguales(undefined, undefined)).toBe(false);
  });
});

describe('deteccion del tipo de imagen por contenido', () => {
  test('reconoce JPG, PNG, GIF y WEBP', () => {
    expect(detectarTipo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('jpg');
    expect(detectarTipo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(detectarTipo(Buffer.from('GIF89a....'))).toBe('gif');
    expect(detectarTipo(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  });
  test('rechaza cualquier otra cosa', () => {
    expect(detectarTipo(Buffer.from('<?php echo 1;'))).toBeNull();
    expect(detectarTipo(Buffer.from('<svg></svg>'))).toBeNull();
    expect(detectarTipo(Buffer.alloc(0))).toBeNull();
  });
});

describe('configuracion por ambiente (ASVS V13)', () => {
  const base = { APP_ENV: 'prod', DB_PASSWORD: 'una-clave-de-bd-larga', SESSION_SECRET: 's'.repeat(40) };
  test('produccion con secretos fuertes arranca y marca la cookie como Secure', () => {
    const cfg = cargarConfig(base);
    expect(cfg.esProd).toBe(true);
    expect(cfg.cookieSegura).toBe(true);
  });
  test.each([
    ['SESSION_SECRET corto', { SESSION_SECRET: 'corto' }],
    ['SESSION_SECRET ausente', { SESSION_SECRET: '' }],
    ['DB_PASSWORD corta', { DB_PASSWORD: 'abc' }],
    ['DB_PASSWORD ausente', { DB_PASSWORD: '' }],
    ['DB_PASSWORD por defecto', { DB_PASSWORD: 'changeme' }],
    ['FORCE_HTTPS sin PUBLIC_HOST valido', { FORCE_HTTPS: '1', PUBLIC_HOST: 'host malo/../' }],
    ['DB_SSL=1 sin certificado de la CA', { DB_SSL: '1', DB_SSL_CA: '' }],
    ['DB_SSL con valor invalido', { DB_SSL: 'si' }],
  ])('produccion se niega a arrancar con %s', (_n, cambio) => {
    expect(() => cargarConfig({ ...base, ...cambio })).toThrow(/Configuracion invalida/);
  });
  test('dev y qa no exigen secretos y no usan cookie Secure', () => {
    expect(cargarConfig({ APP_ENV: 'dev' }).cookieSegura).toBe(false);
    expect(cargarConfig({ APP_ENV: 'qa' }).esQa).toBe(true);
  });
  test('conexion a la BD con TLS: verifica siempre el certificado y usa la CA indicada (RDS)', () => {
    const { opcionesSsl } = require('../../src/config/db');
    expect(opcionesSsl(cargarConfig(base))).toBe(false);
    const cfg = cargarConfig({ ...base, DB_SSL: '1', DB_SSL_CA: '/certs/rds-ca.pem' });
    const leidas = [];
    const ssl = opcionesSsl(cfg, (ruta) => { leidas.push(ruta); return 'CA-PEM'; });
    expect(ssl).toEqual({ rejectUnauthorized: true, ca: 'CA-PEM' });
    expect(leidas).toEqual(['/certs/rds-ca.pem']);
  });
  test('un ambiente desconocido se rechaza', () => {
    expect(() => cargarConfig({ APP_ENV: 'staging' })).toThrow();
  });
});

describe('validacion de formularios (zod)', () => {
  const ok = { nombre: 'Plato', precio: '1500', categoria_id: '3' };
  test('un producto minimo es valido y normaliza tipos', () => {
    const { datos, errores } = validar(esquemaItem, ok);
    expect(errores).toBeUndefined();
    expect(datos).toMatchObject({ nombre: 'Plato', precio: 1500, categoria_id: 3, visible: false, destacado: false, puntuacion: 0, orden: null });
  });
  test('rechaza caracteres de control y campos fuera de rango', () => {
    expect(validar(esquemaItem, { ...ok, nombre: 'a\u0000b' }).errores).toHaveProperty('nombre');
    expect(validar(esquemaItem, { ...ok, precio: '99999999999' }).errores).toHaveProperty('precio');
    expect(validar(esquemaItem, { ...ok, puntuacion: '9' }).errores).toHaveProperty('puntuacion');
  });
});
