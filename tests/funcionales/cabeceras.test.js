'use strict';
// ASVS v5 V3 (cabeceras y CSP), V7.2 (cookie de sesion), V13 (configuracion) | ISO 27001 A.8.9 / A.8.24
// Backend (API JSON): sus cabeceras se prueban con Supertest. Frontend (nginx): sus paginas se revisan como archivos
// (sin codigo en linea, SRI correcto) y sus cabeceras HTTP las comprueba Playwright contra el contenedor real.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { crearEntorno } = require('../ayuda');

const PUBLICO = path.join(__dirname, '..', '..', 'frontend', 'public');
const PAGINAS = ['carta.html', 'carrito.html', 'error.html', 'admin/panel.html', 'admin/lista.html', 'admin/formulario.html'];
const leer = (rel) => fs.readFileSync(path.join(PUBLICO, rel), 'utf8');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await env.pool.end(); });

describe('Cabeceras HTTP de seguridad del backend', () => {
  let res;
  beforeAll(async () => { res = await request(env.app).get('/api/restaurantes/1'); });

  test('CSP de API: no permite cargar nada (default-src none) ni ser enmarcada', () => {
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  test('X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy y CORP', () => {
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toContain('geolocation=()');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  test('no se revela la tecnologia (sin X-Powered-By) y las respuestas de la API no se cachean', () => {
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('sin CORS: la API no autoriza otros origenes', async () => {
    const r = await request(env.app).get('/api/restaurantes/1').set('Origin', 'https://malo.example');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });

  test('sin HTTPS no se envia Strict-Transport-Security (solo aplica en conexiones seguras)', () => {
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('Cookie de sesion', () => {
  test('PNKSESSID es HttpOnly y SameSite=Strict', async () => {
    const res = await request(env.app).get('/api/sesion');
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('PNKSESSID='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
  });

  test('en produccion la cookie ademas lleva el atributo Secure y HSTS cuando llega por HTTPS', async () => {
    const prod = crearEntorno({
      APP_ENV: 'prod', SESSION_SECRET: 'x'.repeat(40),
      TRUST_PROXY: '1', FORCE_HTTPS: '1', PUBLIC_HOST: 'carta.ejemplo.cl',
    });
    try {
      const res = await request(prod.app).get('/api/sesion').set('X-Forwarded-Proto', 'https');
      expect(res.status).toBe(200);
      const cookie = res.headers['set-cookie'].find((c) => c.startsWith('PNKSESSID='));
      expect(cookie).toMatch(/Secure/i);
      expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    } finally {
      await prod.pool.end();
    }
  });
});

describe('Paginas del frontend sin codigo en linea (necesario para la CSP estricta de nginx)', () => {
  test.each(PAGINAS)('%s', (pagina) => {
    const html = leer(pagina);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  test.each(PAGINAS)('%s: toda libreria de terceros lleva SRI sha384 y el hash coincide con el archivo', (pagina) => {
    const etiquetas = leer(pagina).match(/<(?:script|link)[^>]+vendors\/[^>]+>/g) || [];
    expect(etiquetas.length).toBeGreaterThan(0);
    for (const etiqueta of etiquetas) {
      const ruta = etiqueta.match(/(?:src|href)="\/(vendors\/[^"]+)"/)[1];
      const sri = etiqueta.match(/integrity="(sha384-[^"]+)"/);
      expect(sri).not.toBeNull();
      const real = 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(PUBLICO, ruta))).digest('base64');
      expect(`${ruta} ${sri[1]}`).toBe(`${ruta} ${real}`);
    }
  });

  test('la CSP del frontend (nginx) no permite codigo en linea ni ser enmarcada', () => {
    const inc = fs.readFileSync(path.join(PUBLICO, '..', 'nginx', 'cabeceras.inc'), 'utf8');
    const csp = inc.match(/Content-Security-Policy "([^"]+)"/)[1];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
});

describe('Redireccion a HTTPS (FORCE_HTTPS)', () => {
  let prod;
  beforeAll(() => {
    prod = crearEntorno({
      APP_ENV: 'prod', SESSION_SECRET: 'x'.repeat(40),
      TRUST_PROXY: '1', FORCE_HTTPS: '1', PUBLIC_HOST: 'carta.ejemplo.cl',
    });
  });
  afterAll(async () => { await prod.pool.end(); });

  test('GET por HTTP se redirige (301) al host de la configuracion, nunca al Host del cliente', async () => {
    const res = await request(prod.app).get('/api/restaurantes/1').set('Host', 'malo.example').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://carta.ejemplo.cl/api/restaurantes/1');
  });

  test('POST por HTTP se rechaza (403) porque ya viajo en claro', async () => {
    const res = await request(prod.app).post('/api/login').set('X-Forwarded-Proto', 'http').send({ a: 1 });
    expect(res.status).toBe(403);
  });

  test.each([['/health'], ['/api/health']])('%s no se redirige (lo usan Docker y el balanceador por HTTP interno)', async (ruta) => {
    const res = await request(prod.app).get(ruta).set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(200);
  });
});
