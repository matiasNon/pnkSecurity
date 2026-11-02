'use strict';
// RF-03 Carrito | ASVS v5 V2 (validacion), V3.5 (CSRF), V8 (control de acceso), V2.3 (logica de negocio)

const request = require('supertest');
const { crearEntorno, tokenDe } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await env.pool.end(); });

async function agenteConToken(ruta = '/restaurantes/1') {
  const agente = request.agent(env.app);
  const csrf = await tokenDe(agente, ruta);
  return { agente, csrf };
}
const agregar = (agente, csrf, rid, datos) =>
  agente.post(`/restaurantes/${rid}/carrito/items`).set('X-CSRF-Token', csrf).type('form').send(datos);

describe('RF-03 Agregar, ver y quitar productos', () => {
  test('agregar un producto lo muestra en la pagina del carrito con nombre y precio de la BD', async () => {
    const { agente, csrf } = await agenteConToken();
    const r = await agregar(agente, csrf, 1, { iditems: 5 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    const pagina = await agente.get('/restaurantes/1/carrito');
    expect(pagina.text).toContain('Lomo a lo Pobre');
    expect(pagina.text).toContain('$ 12.500');
  });

  test('el cliente no puede fijar el precio: un campo "precio" enviado se ignora', async () => {
    const { agente, csrf } = await agenteConToken();
    await agregar(agente, csrf, 1, { iditems: 5, precio: 1, nombre: 'Gratis' });
    const pagina = await agente.get('/restaurantes/1/carrito');
    expect(pagina.text).toContain('$ 12.500');
    expect(pagina.text).not.toContain('Gratis');
  });

  test('eliminar un producto por su posicion', async () => {
    const { agente, csrf } = await agenteConToken();
    await agregar(agente, csrf, 1, { iditems: 5 });
    await agregar(agente, csrf, 1, { iditems: 2 });
    const r = await agente.delete('/restaurantes/1/carrito/items/1').set('X-CSRF-Token', csrf);
    expect(r.status).toBe(200);
    const pagina = await agente.get('/restaurantes/1/carrito');
    expect(pagina.text).not.toContain('Lomo a lo Pobre');
    expect(pagina.text).toContain('Crema de espinacas');
  });

  test('"Eliminar todo" vacia el carrito', async () => {
    const { agente, csrf } = await agenteConToken();
    await agregar(agente, csrf, 1, { iditems: 5 });
    const r = await agente.delete('/restaurantes/1/carrito').set('X-CSRF-Token', csrf);
    expect(r.status).toBe(200);
    const pagina = await agente.get('/restaurantes/1/carrito');
    expect(pagina.text).not.toContain('Lomo a lo Pobre');
  });

  test('el carrito es por restaurante: lo agregado en el 1 no aparece en el 2', async () => {
    const { agente, csrf } = await agenteConToken();
    await agregar(agente, csrf, 1, { iditems: 5 });
    const pagina = await agente.get('/restaurantes/2/carrito');
    expect(pagina.status).toBe(200);
    expect(pagina.text).not.toContain('Lomo a lo Pobre');
  });
});

describe('Reglas de negocio y validacion', () => {
  test('el limite es de 50 productos: el 51 responde 409', async () => {
    const { agente, csrf } = await agenteConToken();
    for (let i = 0; i < 50; i++) {
      const r = await agregar(agente, csrf, 1, { iditems: 5 });
      expect(r.status).toBe(200);
    }
    const r = await agregar(agente, csrf, 1, { iditems: 5 });
    expect(r.status).toBe(409);
  });

  test.each([
    ['producto inexistente', { iditems: 999 }, 404],
    ['producto eliminado (id 3)', { iditems: 3 }, 404],
    ['producto de otro restaurante (el 5 es del restaurante 1)', { iditems: 5 }, 404, 2],
    ['id no numerico', { iditems: 'abc' }, 400],
    ['inyeccion SQL', { iditems: '5 OR 1=1' }, 400],
    ['id negativo', { iditems: -5 }, 400],
    ['sin id', {}, 400],
  ])('%s', async (_nombre, datos, estado, rid = 1) => {
    const { agente, csrf } = await agenteConToken(`/restaurantes/${rid}`);
    const r = await agregar(agente, csrf, rid, datos);
    expect(r.status).toBe(estado);
  });

  test('un producto oculto no se puede agregar aunque se conozca su id', async () => {
    await env.pool.query('UPDATE items SET visible = false WHERE id = 1');
    try {
      const { agente, csrf } = await agenteConToken();
      const r = await agregar(agente, csrf, 1, { iditems: 1 });
      expect(r.status).toBe(404);
    } finally {
      await env.pool.query('UPDATE items SET visible = true WHERE id = 1');
    }
  });

  test('solo se acepta application/x-www-form-urlencoded (415 con otro tipo)', async () => {
    const { agente, csrf } = await agenteConToken();
    const r = await agente.post('/restaurantes/1/carrito/items').set('X-CSRF-Token', csrf).send({ iditems: 5 });
    expect(r.status).toBe(415);
  });

  test('restaurante inexistente o invalido responde 404', async () => {
    const { agente, csrf } = await agenteConToken();
    expect((await agregar(agente, csrf, 999, { iditems: 5 })).status).toBe(404);
    expect((await agregar(agente, csrf, 'abc', { iditems: 5 })).status).toBe(404);
  });
});

describe('ASVS V3.5 CSRF en el carrito', () => {
  test('sin token CSRF responde 403 y no se agrega nada', async () => {
    const { agente } = await agenteConToken();
    const r = await agente.post('/restaurantes/1/carrito/items').type('form').send({ iditems: 5 });
    expect(r.status).toBe(403);
    const pagina = await agente.get('/restaurantes/1/carrito');
    expect(pagina.text).not.toContain('Lomo a lo Pobre');
  });

  test('con un token falso responde 403', async () => {
    const { agente } = await agenteConToken();
    const r = await agregar(agente, 'a'.repeat(64), 1, { iditems: 5 });
    expect(r.status).toBe(403);
  });

  test('el token de una sesion no sirve en otra sesion', async () => {
    const a = await agenteConToken();
    const b = await agenteConToken();
    const r = await agregar(b.agente, a.csrf, 1, { iditems: 5 });
    expect(r.status).toBe(403);
  });

  test('DELETE sin token tambien se rechaza', async () => {
    const { agente } = await agenteConToken();
    expect((await agente.delete('/restaurantes/1/carrito')).status).toBe(403);
    expect((await agente.delete('/restaurantes/1/carrito/items/1')).status).toBe(403);
  });

  test('el metodo GET no modifica el carrito (404, la ruta no existe)', async () => {
    const { agente } = await agenteConToken();
    const r = await agente.get('/restaurantes/1/carrito/items');
    expect(r.status).toBe(404);
  });
});
