'use strict';
// Super admin: la cuenta admin@gmail.com gestiona TODOS los restaurantes (elige cual administrar y crea nuevos);
// los demas admin siguen limitados al suyo. ASVS v5 V8 (control de acceso, IDOR) | ISO 27001 A.5.15

const { crearEntorno, iniciarSesion, limpiarIntentos } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => {
  await env.pool.query("DELETE FROM restaurantes WHERE nombre LIKE 'QA %'");
  await env.pool.query("DELETE FROM direcciones WHERE calle LIKE 'QA %'");
  await limpiarIntentos(env.pool);
  await env.pool.end();
});
beforeEach(async () => { await limpiarIntentos(env.pool); });

const superAdmin = () => iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
const adminDos = () => iniciarSesion(env.app, 'admin.bahia@gmail.com', 'bahia01');
const cliente = () => iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
const cambiar = (s, id) => s.agente.put('/api/admin/restaurante').set('X-CSRF-Token', s.csrf).send({ id });
const nuevoRest = (s, d) => s.agente.post('/api/admin/restaurantes').set('X-CSRF-Token', s.csrf).send(d);
const REST = { nombre: 'QA Resto Nuevo', rut: '76123456-7', fono: '+56 51 2123456', email: '', calle: 'QA Calle', numero: '123', comuna: 'La Serena' };

describe('Super admin: ve y elige restaurantes', () => {
  test('el panel lo marca como super admin y entrega la lista de restaurantes', async () => {
    const s = await superAdmin();
    const r = await s.agente.get('/api/admin');
    expect(r.status).toBe(200);
    expect(r.body.usuario.superadmin).toBe(true);
    expect(r.body.restaurante.id).toBe(1);
    expect(r.body.restaurantes.map((x) => x.id)).toEqual(expect.arrayContaining([1, 2]));
  });

  test('al cambiar de restaurante el panel y las listas pasan a ser los del restaurante elegido', async () => {
    const s = await superAdmin();
    expect((await cambiar(s, 2)).status).toBe(200);
    const panel = await s.agente.get('/api/admin');
    expect(panel.body.restaurante.id).toBe(2);
    const cartas = await s.agente.get('/api/admin/cartas');
    expect(cartas.status).toBe(200);
    const propias = await env.pool.query('SELECT id FROM cartas WHERE restaurante_id = 2 AND eliminado_en IS NULL');
    expect(cartas.body.filas.map((f) => f.id).sort()).toEqual(propias.rows.map((f) => f.id).sort());
  });

  test('una sesion nueva vuelve a su restaurante (la eleccion no se arrastra)', async () => {
    const s = await superAdmin();
    await cambiar(s, 2);
    const otra = await superAdmin();
    expect((await otra.agente.get('/api/admin')).body.restaurante.id).toBe(1);
  });

  test('un restaurante inexistente o un id invalido se rechazan con 404', async () => {
    const s = await superAdmin();
    expect((await cambiar(s, 99999)).status).toBe(404);
    expect((await cambiar(s, 'x OR 1=1')).status).toBe(404);
  });

  test('cambiar de restaurante exige el token CSRF', async () => {
    const s = await superAdmin();
    const r = await s.agente.put('/api/admin/restaurante').send({ id: 2 });
    expect(r.status).toBe(403);
  });
});

describe('Super admin: crea restaurantes', () => {
  test('crea un restaurante con su direccion y pasa a administrarlo', async () => {
    const s = await superAdmin();
    const r = await nuevoRest(s, REST);
    expect(r.status).toBe(201);
    const panel = await s.agente.get('/api/admin');
    expect(panel.body.restaurante).toEqual({ id: r.body.id, nombre: 'QA Resto Nuevo' });
    const lista = await s.agente.get('/api/restaurantes');
    expect(lista.body.restaurantes.find((x) => x.id === r.body.id)).toMatchObject({ nombre: 'QA Resto Nuevo', calle: 'QA Calle', cartas: 0 });
  });

  test('valida los campos (RUT, telefono, correo) y no crea nada si son invalidos', async () => {
    const s = await superAdmin();
    const antes = (await env.pool.query('SELECT count(*)::int n FROM restaurantes')).rows[0].n;
    const r = await nuevoRest(s, { ...REST, rut: 'abc', fono: 'x', email: 'no-es-correo' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.errores)).toEqual(expect.arrayContaining(['rut', 'fono', 'email']));
    expect((await env.pool.query('SELECT count(*)::int n FROM restaurantes')).rows[0].n).toBe(antes);
  });
});

describe('Los demas usuarios no pueden cambiar ni crear restaurantes', () => {
  test('el admin comun (La Bahia) recibe 403 y sigue en su restaurante', async () => {
    const s = await adminDos();
    expect((await s.agente.get('/api/admin')).body.usuario.superadmin).toBe(false);
    expect((await s.agente.get('/api/admin')).body.restaurantes).toBeUndefined();
    expect((await cambiar(s, 1)).status).toBe(403);
    expect((await nuevoRest(s, REST)).status).toBe(403);
    expect((await s.agente.get('/api/admin')).body.restaurante.id).toBe(2);
  });

  test('un cliente recibe 403 y sin sesion 401', async () => {
    const c = await cliente();
    expect((await cambiar(c, 1)).status).toBe(403);
    const anon = await iniciarSesion(env.app, 'nadie@x.cl', 'mala-clave-123');
    expect((await cambiar(anon, 1)).status).toBe(401);
  });
});
