'use strict';
// RF-01 Ver la carta | RF-02 Visibilidad | ASVS v5 V1 (validacion de entradas), V2.2 (SQLi) | ISO 27034 ONF

const request = require('supertest');
const { crearEntorno } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await env.pool.end(); });

describe('RF-01 Carta publica del restaurante', () => {
  test('el restaurante 1 muestra nombre, direccion, contacto, destacados y pestanas de cartas', async () => {
    const res = await request(env.app).get('/restaurantes/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Afríca Restobar');
    expect(res.text).toContain('Avenida Argentina #951, La Serena');
    expect(res.text).toContain('22334455');
    expect(res.text).toContain('mail@correo.cl');
    expect(res.text).toContain('Menús Destacados');
    for (const carta of ['Vinos', 'Bebidas', 'Entradas', 'Principales', 'Postres', 'Pizzas', 'Dulces', 'Helados']) {
      expect(res.text).toContain(`>${carta}</a>`);
    }
  });

  test('los precios usan el formato de moneda chilena', async () => {
    const res = await request(env.app).get('/restaurantes/1');
    expect(res.text).toContain('$ 12.500');
    expect(res.text).toContain('$ 9.900');
    expect(res.text).toContain('$ 2.000');
  });

  test('un restaurante sin cartas visibles muestra el mensaje "No hay información para Mostrar"', async () => {
    const res = await request(env.app).get('/restaurantes/3');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No hay información para Mostrar');
  });

  test('las URLs antiguas /index.php?id=N redirigen a la URL limpia (codigos QR existentes)', async () => {
    const res = await request(env.app).get('/index.php?id=2');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/restaurantes/2');
  });
});

describe('RF-02 Visibilidad: solo se muestra lo visible y no eliminado', () => {
  test('un producto eliminado (id 3, "Porotos Granados") no aparece', async () => {
    const res = await request(env.app).get('/restaurantes/1');
    expect(res.text).not.toContain('Porotos Granados');
  });

  test('una categoria no visible ("Comida casera") no aparece', async () => {
    const res = await request(env.app).get('/restaurantes/1');
    expect(res.text).not.toContain('Comida casera');
  });

  test('un producto ocultado en la BD desaparece de la carta', async () => {
    await env.pool.query('UPDATE items SET visible = false WHERE id = 7');
    try {
      const res = await request(env.app).get('/restaurantes/1');
      expect(res.text).not.toContain('Rico Lomo a lo Pobre');
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
  ])('/restaurantes/%s responde 404 sin revelar informacion', async (valor) => {
    const res = await request(env.app).get(`/restaurantes/${valor}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toMatch(/syntax error|pg_|postgres|stack|at .*\.js/i);
  });

  test('la tabla items sigue intacta despues de los intentos de inyeccion SQL', async () => {
    const r = await env.pool.query('SELECT count(*)::int AS n FROM items');
    expect(r.rows[0].n).toBe(6);
  });

  test('un restaurante marcado como eliminado devuelve 404', async () => {
    await env.pool.query('UPDATE restaurantes SET eliminado_en = now() WHERE id = 7');
    try {
      const res = await request(env.app).get('/restaurantes/7');
      expect(res.status).toBe(404);
    } finally {
      await env.pool.query('UPDATE restaurantes SET eliminado_en = NULL WHERE id = 7');
    }
  });
});

describe('XSS almacenado: los datos de la BD se escapan al mostrarse', () => {
  test('un nombre de producto con HTML se muestra como texto', async () => {
    await env.pool.query(`UPDATE items SET nombre = '<img src=x onerror=alert(1)>' WHERE id = 7`);
    try {
      const res = await request(env.app).get('/restaurantes/1');
      expect(res.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(res.text).not.toContain('<img src=x onerror');
    } finally {
      await env.pool.query(`UPDATE items SET nombre = 'Lomo a lo Pobre' WHERE id = 7`);
    }
  });
});

describe('Salud del servicio', () => {
  test('GET /health responde 200 {estado: ok} sin sesion', async () => {
    const res = await request(env.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('una ruta inexistente responde 404 con pagina de error generica', async () => {
    const res = await request(env.app).get('/no-existe');
    expect(res.status).toBe(404);
  });
});
