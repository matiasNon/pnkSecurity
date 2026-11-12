'use strict';
// Derechos del titular (Ley 19.628; preparacion Ley 21.719): acceso/portabilidad, rectificacion y supresion.
// ASVS v5 V8 (solo la propia cuenta), V3.5 (CSRF), V6 (re-autenticacion para la supresion).

const request = require('supertest');
const { crearEntorno, iniciarSesion, limpiarIntentos } = require('../ayuda');
const { hashPassword } = require('../../src/services/password');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => {
  // Limpieza: las cuentas y comentarios de prueba no deben quedar en la BD de QA (la usan las capturas de evidencia).
  await env.pool.query("DELETE FROM comentarios WHERE comentario = 'Muy rico todo'");
  await env.pool.query("DELETE FROM usuarios WHERE email LIKE 'titular%@correo.cl'");
  await env.pool.end();
});
beforeEach(async () => { await limpiarIntentos(env.pool); });

const CLAVE = 'clave-titular-01';
let n = 0;

// Cada prueba usa su propia cuenta para no afectar a las cuentas de demostracion.
async function cuentaNueva() {
  n += 1;
  const email = `titular${Date.now()}${n}@correo.cl`;
  const r = await env.pool.query(
    "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, 'cliente') RETURNING id",
    [`Titular ${n}`, email, await hashPassword(CLAVE)]
  );
  const uid = r.rows[0].id;
  await env.pool.query(
    'INSERT INTO comentarios (usuario, usuario_id, comentario, restaurante_id) VALUES ($1, $2, $3, 1)',
    [`Titular ${n}`, uid, 'Muy rico todo']
  );
  const s = await iniciarSesion(env.app, email, CLAVE);
  return { uid, email, ...s };
}

describe('Acceso y portabilidad: GET /api/mi-cuenta/datos', () => {
  test('entrega solo los datos del titular (sin hash ni ids internos) y permite descargarlos', async () => {
    const c = await cuentaNueva();
    const r = await c.agente.get('/api/mi-cuenta/datos');
    expect(r.status).toBe(200);
    expect(r.body.titular).toMatchObject({ email: c.email, rol: 'cliente' });
    expect(r.body.comentarios).toEqual([expect.objectContaining({ restaurante: 'Afríca Restobar', comentario: 'Muy rico todo' })]);
    expect(JSON.stringify(r.body)).not.toMatch(/password|scrypt|usuario_id/);
    const d = await c.agente.get('/api/mi-cuenta/datos?descargar=1');
    expect(d.headers['content-disposition']).toMatch(/attachment; filename="mis-datos-carta-digital.json"/);
  });

  test('sin sesion responde 401', async () => {
    expect((await request(env.app).get('/api/mi-cuenta/datos')).status).toBe(401);
  });
});

describe('Rectificacion: PATCH /api/mi-cuenta', () => {
  test('corrige el nombre de la cuenta y el mostrado en sus comentarios', async () => {
    const c = await cuentaNueva();
    const r = await c.agente.patch('/api/mi-cuenta').set('X-CSRF-Token', c.csrf).send({ nombre: 'Nombre Corregido' });
    expect(r.status).toBe(200);
    const u = await env.pool.query('SELECT nombre FROM usuarios WHERE id = $1', [c.uid]);
    const k = await env.pool.query('SELECT usuario FROM comentarios WHERE usuario_id = $1', [c.uid]);
    expect(u.rows[0].nombre).toBe('Nombre Corregido');
    expect(k.rows.map((x) => x.usuario)).toEqual(['Nombre Corregido']);
  });

  test.each([
    ['vacio', { nombre: '   ' }],
    ['demasiado largo', { nombre: 'x'.repeat(101) }],
    ['caracteres de control', { nombre: 'Ana\u0000' }],
    ['salto de linea CR/LF (pentest)', { nombre: 'Ana\r\nX-Inyectada: 1' }],
    ['tabulador', { nombre: 'Ana\tB' }],
    ['campos extra (no se puede cambiar el rol ni el email)', { nombre: 'Ana', rol: 'admin' }],
  ])('rechaza %s con 400', async (_n, cuerpo) => {
    const c = await cuentaNueva();
    expect((await c.agente.patch('/api/mi-cuenta').set('X-CSRF-Token', c.csrf).send(cuerpo)).status).toBe(400);
    const u = await env.pool.query('SELECT rol FROM usuarios WHERE id = $1', [c.uid]);
    expect(u.rows[0].rol).toBe('cliente');
  });

  test('sin token CSRF responde 403', async () => {
    const c = await cuentaNueva();
    expect((await c.agente.patch('/api/mi-cuenta').send({ nombre: 'X' })).status).toBe(403);
  });
});

describe('Supresion: DELETE /api/mi-cuenta', () => {
  test('con la contrasena correcta borra la cuenta, anonimiza sus comentarios y cierra la sesion', async () => {
    const c = await cuentaNueva();
    const r = await c.agente.delete('/api/mi-cuenta').set('X-CSRF-Token', c.csrf).send({ password: CLAVE, confirmar: 'ELIMINAR' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, comentariosAnonimizados: 1 });
    expect((await env.pool.query('SELECT 1 FROM usuarios WHERE id = $1', [c.uid])).rowCount).toBe(0);
    const k = await env.pool.query("SELECT usuario, usuario_id FROM comentarios WHERE comentario = 'Muy rico todo' AND usuario = 'Usuario eliminado'");
    expect(k.rows.length).toBeGreaterThan(0);
    expect(k.rows.every((x) => x.usuario_id === null)).toBe(true);
    expect((await c.agente.get('/api/mi-cuenta/datos')).status).toBe(401);
  });

  test('con la contrasena incorrecta no borra nada (401)', async () => {
    const c = await cuentaNueva();
    const r = await c.agente.delete('/api/mi-cuenta').set('X-CSRF-Token', c.csrf).send({ password: 'otra', confirmar: 'ELIMINAR' });
    expect(r.status).toBe(401);
    expect((await env.pool.query('SELECT 1 FROM usuarios WHERE id = $1', [c.uid])).rowCount).toBe(1);
  });

  test('sin la palabra de confirmacion responde 400', async () => {
    const c = await cuentaNueva();
    const r = await c.agente.delete('/api/mi-cuenta').set('X-CSRF-Token', c.csrf).send({ password: CLAVE, confirmar: 'si' });
    expect(r.status).toBe(400);
  });

  test('una cuenta de administrador no se puede eliminar desde aqui (409)', async () => {
    const s = await iniciarSesion(env.app, 'admin.bahia@gmail.com', 'bahia01');
    const r = await s.agente.delete('/api/mi-cuenta').set('X-CSRF-Token', s.csrf).send({ password: 'bahia01', confirmar: 'ELIMINAR' });
    expect(r.status).toBe(409);
    expect((await env.pool.query("SELECT 1 FROM usuarios WHERE email = 'admin.bahia@gmail.com'")).rowCount).toBe(1);
  });

  test('la fuerza bruta de la contrasena se bloquea (429) igual que el login', async () => {
    const c = await cuentaNueva();
    let ultimo;
    for (let i = 0; i < 7; i++) {
      ultimo = await c.agente.delete('/api/mi-cuenta').set('X-CSRF-Token', c.csrf).send({ password: `mala${i}`, confirmar: 'ELIMINAR' });
    }
    expect(ultimo.status).toBe(429);
  }, 20000);

  test('sin token CSRF responde 403 y sin sesion 401', async () => {
    const c = await cuentaNueva();
    expect((await c.agente.delete('/api/mi-cuenta').send({ password: CLAVE, confirmar: 'ELIMINAR' })).status).toBe(403);
    const anon = request.agent(env.app);
    const t = (await anon.get('/api/sesion')).body.csrf;
    expect((await anon.delete('/api/mi-cuenta').set('X-CSRF-Token', t).send({ password: CLAVE, confirmar: 'ELIMINAR' })).status).toBe(401);
  });
});
