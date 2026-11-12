'use strict';
// RF-01 Ver la carta | RF-02 Visibilidad (API) | ASVS v5 V1 (validacion de entradas), V2.2 (SQLi) | ISO 27034 ONF
// El backend entrega JSON; el formato de moneda y el armado de la pagina los prueba Playwright en el frontend.

const request = require('supertest');
const { crearEntorno } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await env.pool.end(); });

const carta = (rid) => request(env.app).get(`/api/restaurantes/${rid}`);
const nombresDe = (body) => [
  ...body.destacados.map((d) => d.nombre),
  ...body.cartas.flatMap((c) => c.categorias.flatMap((k) => k.items.map((i) => i.nombre))),
];
const itemPorId = (body, id) =>
  body.cartas.flatMap((c) => c.categorias.flatMap((k) => k.items)).find((i) => i.id === id);

describe('RF-01 Carta publica del restaurante', () => {
  test('el restaurante 1 entrega nombre, direccion, contacto, destacados y sus cartas', async () => {
    const res = await carta(1);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const { restaurante, destacados, cartas } = res.body;
    expect(restaurante).toMatchObject({
      id: 1, nombre: 'Afríca Restobar', calle: 'Avenida Argentina', numero: '951', comuna: 'La Serena',
      fono: '22334455', email: 'mail@correo.cl',
    });
    expect(destacados.length).toBeGreaterThan(0);
    const nombres = cartas.map((c) => c.nombre);
    for (const c of ['Vinos', 'Bebidas', 'Entradas', 'Principales', 'Postres', 'Pizzas', 'Dulces', 'Helados']) {
      expect(nombres).toContain(c);
    }
  });

  test('los precios llegan como numeros enteros (el frontend los formatea como $ 12.500)', async () => {
    const res = await carta(1);
    const precios = res.body.cartas.flatMap((c) => c.categorias.flatMap((k) => k.items.map((i) => i.precio)));
    expect(precios).toEqual(expect.arrayContaining([12500, 9900, 2000]));
    for (const p of precios) expect(Number.isInteger(p)).toBe(true);
  });

  test('solo se exponen campos publicos (sin ids internos de BD ni datos de auditoria)', async () => {
    const res = await carta(1);
    expect(Object.keys(res.body.restaurante).sort()).toEqual(['calle', 'comuna', 'email', 'fono', 'foto', 'id', 'nombre', 'numero']);
    expect(res.text).not.toMatch(/eliminado_en|restaurante_id|password|hash/);
  });

  test('las fotos se entregan como rutas propias validadas (/imagenes o /uploads)', async () => {
    const res = await carta(1);
    const fotos = res.body.destacados.map((d) => d.foto).filter(Boolean);
    expect(fotos.length).toBeGreaterThan(0);
    for (const f of fotos) expect(f).toMatch(/^\/(imagenes|uploads)\/cod1\/[A-Za-z0-9._-]+$/);
  });

  test('un restaurante sin cartas visibles entrega la lista vacia (el frontend muestra "No hay información para Mostrar")', async () => {
    const res = await carta(3);
    expect(res.status).toBe(200);
    expect(res.body.cartas).toEqual([]);
  });
});

describe('RF-02 Visibilidad: solo se entrega lo visible y no eliminado', () => {
  test('un producto eliminado (id 3, "Porotos Granados") no aparece', async () => {
    const res = await carta(1);
    expect(nombresDe(res.body)).not.toContain('Porotos Granados');
    expect(res.text).not.toContain('Porotos Granados');
  });

  test('una categoria no visible ("Comida casera") no aparece', async () => {
    const res = await carta(1);
    expect(res.text).not.toContain('Comida casera');
  });

  test('un producto ocultado en la BD desaparece de la carta', async () => {
    expect(itemPorId((await carta(1)).body, 7)).toBeDefined();
    await env.pool.query('UPDATE items SET visible = false WHERE id = 7');
    try {
      expect(itemPorId((await carta(1)).body, 7)).toBeUndefined();
    } finally {
      await env.pool.query('UPDATE items SET visible = true WHERE id = 7');
    }
  });
});

describe('ASVS V1.2 / V2.2: el identificador del restaurante se valida como entero', () => {
  test.each([
    ['abc'],
    ['1%20OR%201=1'],
    ['1;DROP%20TABLE%20items'],
    ["1'"],
    ['0'],
    ['-1'],
    ['2147483648'],
    ['1e2'],
    ['0x10'],
    ['99'],
    ['%3Cscript%3Ealert(1)%3C/script%3E'],
  ])('/api/restaurantes/%s responde 404 sin revelar informacion', async (valor) => {
    const res = await carta(valor);
    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe('no_encontrado');
    expect(res.text).not.toMatch(/syntax error|pg_|postgres|stack|at .*\.js/i);
  });

  test('la tabla items sigue intacta despues de los intentos de inyeccion SQL', async () => {
    // 6 productos del volcado original + 7 de demostracion (db/migrations/004_datos_demo.sql).
    const r = await env.pool.query('SELECT count(*)::int AS n FROM items');
    expect(r.rows[0].n).toBe(13);
  });

  test('un restaurante marcado como eliminado devuelve 404', async () => {
    await env.pool.query('UPDATE restaurantes SET eliminado_en = now() WHERE id = 7');
    try {
      expect((await carta(7)).status).toBe(404);
    } finally {
      await env.pool.query('UPDATE restaurantes SET eliminado_en = NULL WHERE id = 7');
    }
  });
});

describe('XSS almacenado: la API entrega texto plano, nunca HTML interpretable', () => {
  test('un nombre con HTML viaja como dato JSON (el frontend lo pinta con textContent)', async () => {
    const original = (await env.pool.query('SELECT nombre FROM items WHERE id = 7')).rows[0].nombre;
    await env.pool.query(`UPDATE items SET nombre = '<img src=x onerror=alert(1)>' WHERE id = 7`);
    try {
      const res = await carta(1);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(itemPorId(res.body, 7).nombre).toBe('<img src=x onerror=alert(1)>');
    } finally {
      await env.pool.query('UPDATE items SET nombre = $1 WHERE id = 7', [original]);
    }
  });
});

describe('Salud del servicio', () => {
  test.each([['/health'], ['/api/health']])('GET %s responde 200 {estado: ok} sin sesion', async (ruta) => {
    const res = await request(env.app).get(ruta);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', servicio: 'backend' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('una ruta inexistente responde 404 JSON generico', async () => {
    for (const ruta of ['/no-existe', '/api/no-existe', '/restaurantes/1']) {
      const res = await request(env.app).get(ruta);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Recurso no encontrado', codigo: 'no_encontrado' });
    }
  });
});
