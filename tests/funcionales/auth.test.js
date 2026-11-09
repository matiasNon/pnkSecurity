'use strict';
// RF-04 Login/logout (API) | ASVS v5 V6 (autenticacion), V7 (sesion), V3.5 (CSRF) | ISO 27001 A.5.17 / A.8.5

const request = require('supertest');
const { crearEntorno, tokenDe, iniciarSesion, limpiarIntentos } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await limpiarIntentos(env.pool); await env.pool.end(); });
beforeEach(async () => { await limpiarIntentos(env.pool); });

const cookieSesion = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('PNKSESSID='));
const ERROR = 'Usuario o contraseña incorrectos.';

describe('RF-04 Inicio y cierre de sesion', () => {
  test('credenciales correctas: 200 con el usuario y la sesion queda abierta', async () => {
    const { agente, res } = await iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
    expect(res.status).toBe(200);
    expect(res.body.usuario).toEqual({ nombre: 'Administrador', rol: 'admin' });
    expect(res.body.csrf).toMatch(/^[a-f0-9]{64}$/);
    const sesion = await agente.get('/api/sesion');
    expect(sesion.body.usuario).toEqual({ nombre: 'Administrador', rol: 'admin' });
  });

  test('la respuesta del login no expone el hash, el id interno ni el correo', async () => {
    const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|password|hash|"id"|@gmail/);
  });

  test('el correo no distingue mayusculas (citext)', async () => {
    const { res } = await iniciarSesion(env.app, 'ADMIN@GMAIL.COM', 'admin01');
    expect(res.status).toBe(200);
  });

  test('la contrasena SI distingue mayusculas', async () => {
    const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'ADMIN01');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe(ERROR);
  });

  test('cerrar sesion invalida la sesion en el servidor y limpia la cookie', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const salida = await agente.post('/api/logout').set('X-CSRF-Token', csrf);
    expect(salida.status).toBe(200);
    expect(cookieSesion(salida)).toMatch(/PNKSESSID=;/);
    const sesion = await agente.get('/api/sesion');
    expect(sesion.body.usuario).toBeNull();
  });

  test('cerrar sesion sin token CSRF no cierra la sesion (403)', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const salida = await agente.post('/api/logout');
    expect(salida.status).toBe(403);
    const sesion = await agente.get('/api/sesion');
    expect(sesion.body.usuario).toEqual({ nombre: 'Alondra', rol: 'cliente' });
  });
});

describe('ASVS V6 / V7: mensajes genericos y proteccion de la sesion', () => {
  test('usuario inexistente y clave incorrecta producen exactamente la misma respuesta', async () => {
    const a = await iniciarSesion(env.app, 'no.existe@gmail.com', 'cualquiera');
    const b = await iniciarSesion(env.app, 'admin@gmail.com', 'cualquiera');
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(a.res.status);
    expect(b.res.body).toEqual(a.res.body);
    expect(a.res.body.error).toBe(ERROR);
    expect(JSON.stringify(a.res.body)).not.toMatch(/no existe|inexistente|usuario no encontrado/i);
  });

  test('el id de sesion y el token CSRF cambian al iniciar sesion (anti fijacion de sesion)', async () => {
    const agente = request.agent(env.app);
    const primera = await agente.get('/api/sesion');
    const antes = cookieSesion(primera).split(';')[0];
    const res = await agente.post('/api/login').set('X-CSRF-Token', primera.body.csrf).send({ email: 'admin@gmail.com', password: 'admin01' });
    const despues = cookieSesion(res).split(';')[0];
    expect(antes).toMatch(/^PNKSESSID=s%3A/);
    expect(despues).toMatch(/^PNKSESSID=s%3A/);
    expect(despues).not.toBe(antes);
    expect(res.body.csrf).not.toBe(primera.body.csrf);
  });

  test('un id de sesion fijado por el atacante no es aceptado por el servidor', async () => {
    const res = await request(env.app).get('/api/sesion').set('Cookie', 'PNKSESSID=s%3Afijada-por-el-atacante.firmainvalida');
    expect(res.status).toBe(200);
    expect(res.body.usuario).toBeNull();
  });

  test('la cookie de sesion es HttpOnly y SameSite=Strict', async () => {
    const res = await request(env.app).get('/api/sesion');
    const c = cookieSesion(res);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
  });

  test('las contrasenas en la BD estan en hash scrypt, nunca en texto plano', async () => {
    const r = await env.pool.query('SELECT password_hash FROM usuarios');
    expect(r.rowCount).toBeGreaterThanOrEqual(3);
    for (const fila of r.rows) {
      expect(fila.password_hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
      expect(fila.password_hash).not.toContain('admin01');
    }
  });

  test('una cuenta deshabilitada no puede iniciar sesion', async () => {
    await env.pool.query("UPDATE usuarios SET habilitado = false WHERE email = 'alondra@gmail.com'");
    try {
      const { res } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
      expect(res.status).toBe(401);
    } finally {
      await env.pool.query("UPDATE usuarios SET habilitado = true WHERE email = 'alondra@gmail.com'");
    }
  });

  test('si la cuenta se deshabilita con la sesion abierta, la sesion deja de valer', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    await env.pool.query("UPDATE usuarios SET habilitado = false WHERE email = 'alondra@gmail.com'");
    try {
      const sesion = await agente.get('/api/sesion');
      expect(sesion.body.usuario).toBeNull();
    } finally {
      await env.pool.query("UPDATE usuarios SET habilitado = true WHERE email = 'alondra@gmail.com'");
    }
  });
});

describe('ASVS V3.5 CSRF y tipo de contenido en el login', () => {
  test('sin token CSRF no se inicia sesion (403 codigo "csrf")', async () => {
    const agente = request.agent(env.app);
    await agente.get('/api/sesion');
    const res = await agente.post('/api/login').send({ email: 'admin@gmail.com', password: 'admin01' });
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('csrf');
    const sesion = await agente.get('/api/sesion');
    expect(sesion.body.usuario).toBeNull();
  });

  test('un formulario HTML (x-www-form-urlencoded) se rechaza con 415: solo JSON', async () => {
    const agente = request.agent(env.app);
    const csrf = await tokenDe(agente);
    const res = await agente.post('/api/login').type('form').send({ csrf, email: 'admin@gmail.com', password: 'admin01' });
    expect(res.status).toBe(415);
  });

  test('JSON malformado responde 400 sin detalles tecnicos', async () => {
    const agente = request.agent(env.app);
    const csrf = await tokenDe(agente);
    const res = await agente.post('/api/login').set('X-CSRF-Token', csrf).set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at .*\.js|Unexpected/);
  });
});

describe('ASVS V6.3 Proteccion contra fuerza bruta', () => {
  test('tras 5 intentos fallidos la cuenta queda bloqueada, incluso con la clave correcta', async () => {
    for (let i = 0; i < 5; i++) {
      const { res } = await iniciarSesion(env.app, 'admin@gmail.com', `mala${i}`);
      expect(res.status).toBe(401);
    }
    const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Demasiados intentos fallidos');
  }, 60000);

  test('un login correcto reinicia el contador de la cuenta', async () => {
    for (let i = 0; i < 3; i++) await iniciarSesion(env.app, 'admin@gmail.com', 'mala');
    const ok = await iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
    expect(ok.res.status).toBe(200);
    for (let i = 0; i < 4; i++) {
      const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'mala');
      expect(res.status).toBe(401);
    }
  }, 60000);

  test('los intentos contra una cuenta inexistente tambien se limitan', async () => {
    for (let i = 0; i < 5; i++) await iniciarSesion(env.app, 'fantasma@gmail.com', 'x');
    const { res } = await iniciarSesion(env.app, 'fantasma@gmail.com', 'x');
    expect(res.status).toBe(429);
  }, 60000);

  test('los contadores guardan solo hashes (la tabla no contiene correos ni IP en claro)', async () => {
    await iniciarSesion(env.app, 'admin@gmail.com', 'mala');
    const r = await env.pool.query('SELECT clave FROM intentos');
    expect(r.rowCount).toBeGreaterThan(0);
    for (const f of r.rows) {
      expect(f.clave).toMatch(/^[cpi]:[a-f0-9]{64}$/);
    }
  });

  test('campos con tamano excesivo se rechazan sin consultar la BD (contrasena de 129 caracteres)', async () => {
    const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'a'.repeat(129));
    expect(res.status).toBe(401);
    const r = await env.pool.query('SELECT count(*)::int AS n FROM intentos');
    expect(r.rows[0].n).toBe(0);
  });

  test('inyeccion SQL en el usuario no inicia sesion', async () => {
    const { res } = await iniciarSesion(env.app, "' OR '1'='1", "' OR '1'='1");
    expect(res.status).toBe(401);
  });

  test('tipos inesperados en el JSON (objeto en vez de texto) no inician sesion ni provocan 500', async () => {
    const agente = request.agent(env.app);
    const csrf = await tokenDe(agente);
    const res = await agente.post('/api/login').set('X-CSRF-Token', csrf).send({ email: { $ne: null }, password: ['x'] });
    expect(res.status).toBe(401);
  });
});
