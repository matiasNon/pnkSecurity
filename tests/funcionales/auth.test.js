'use strict';
// RF-04 Login/logout | ASVS v5 V6 (autenticacion), V7 (sesion), V3.5 (CSRF) | ISO 27001 A.5.17 / A.8.5

const request = require('supertest');
const { crearEntorno, tokenDe, iniciarSesion, limpiarIntentos } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await limpiarIntentos(env.pool); await env.pool.end(); });
beforeEach(async () => { await limpiarIntentos(env.pool); });

const cookieSesion = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('PNKSESSID='));

describe('RF-04 Inicio y cierre de sesion', () => {
  test('credenciales correctas: redirige a la carta y muestra "Bienvenido"', async () => {
    const { agente, res } = await iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/restaurantes/1');
    const pagina = await agente.get('/restaurantes/1');
    expect(pagina.text).toContain('Bienvenido: Administrador');
    expect(pagina.text).toContain('Cerrar sesión');
  });

  test('el correo no distingue mayusculas (citext)', async () => {
    const { res } = await iniciarSesion(env.app, 'ADMIN@GMAIL.COM', 'admin01');
    expect(res.headers.location).toBe('/restaurantes/1');
  });

  test('la contrasena SI distingue mayusculas', async () => {
    const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'ADMIN01');
    expect(res.headers.location).toBe('/restaurantes/1?login=error');
  });

  test('cerrar sesion invalida la sesion en el servidor y limpia la cookie', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    const salida = await agente.post('/logout').type('form').send({ csrf, id: 1 });
    expect(salida.status).toBe(303);
    expect(cookieSesion(salida)).toMatch(/PNKSESSID=;/);
    const pagina = await agente.get('/restaurantes/1');
    expect(pagina.text).not.toContain('Bienvenido');
    expect(pagina.text).toContain('Ingresar');
  });

  test('cerrar sesion sin token CSRF no cierra la sesion', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const salida = await agente.post('/logout').type('form').send({ id: 1 });
    expect(salida.status).toBe(303);
    const pagina = await agente.get('/restaurantes/1');
    expect(pagina.text).toContain('Bienvenido: Alondra');
  });
});

describe('ASVS V6 / V7: mensajes genericos y proteccion de la sesion', () => {
  test('usuario inexistente y clave incorrecta producen exactamente la misma respuesta', async () => {
    const a = await iniciarSesion(env.app, 'no.existe@gmail.com', 'cualquiera');
    const b = await iniciarSesion(env.app, 'admin@gmail.com', 'cualquiera');
    expect(a.res.status).toBe(b.res.status);
    expect(a.res.headers.location).toBe('/restaurantes/1?login=error');
    expect(b.res.headers.location).toBe(a.res.headers.location);
  });

  test('la pagina de error de login no revela si la cuenta existe', async () => {
    const { agente } = await iniciarSesion(env.app, 'no.existe@gmail.com', 'x');
    const pagina = await agente.get('/restaurantes/1?login=error');
    expect(pagina.text).toContain('Usuario o contraseña incorrectos.');
    expect(pagina.text).not.toMatch(/no existe|inexistente|usuario no encontrado/i);
  });

  test('el id de sesion cambia al iniciar sesion (anti fijacion de sesion)', async () => {
    const agente = request.agent(env.app);
    const primera = await agente.get('/restaurantes/1');
    const antes = cookieSesion(primera).split(';')[0];
    const csrf = require('../ayuda').extraerCsrf(primera.text);
    const res = await agente.post('/login').type('form').send({ csrf, id: 1, frmusuario: 'admin@gmail.com', frmpassword: 'admin01' });
    const despues = cookieSesion(res).split(';')[0];
    expect(antes).toMatch(/^PNKSESSID=s%3A/);
    expect(despues).toMatch(/^PNKSESSID=s%3A/);
    expect(despues).not.toBe(antes);
  });

  test('un id de sesion fijado por el atacante no es aceptado por el servidor', async () => {
    const res = await request(env.app).get('/restaurantes/1').set('Cookie', 'PNKSESSID=s%3Afijada-por-el-atacante.firmainvalida');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Bienvenido');
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
      expect(res.headers.location).toBe('/restaurantes/1?login=error');
    } finally {
      await env.pool.query("UPDATE usuarios SET habilitado = true WHERE email = 'alondra@gmail.com'");
    }
  });

  test('si la cuenta se deshabilita con la sesion abierta, la sesion deja de valer', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    await env.pool.query("UPDATE usuarios SET habilitado = false WHERE email = 'alondra@gmail.com'");
    try {
      const pagina = await agente.get('/restaurantes/1');
      expect(pagina.text).not.toContain('Bienvenido');
    } finally {
      await env.pool.query("UPDATE usuarios SET habilitado = true WHERE email = 'alondra@gmail.com'");
    }
  });
});

describe('ASVS V3.5 CSRF en el login', () => {
  test('sin token CSRF no se inicia sesion y se avisa que la solicitud expiro', async () => {
    const agente = request.agent(env.app);
    await agente.get('/restaurantes/1');
    const res = await agente.post('/login').type('form').send({ id: 1, frmusuario: 'admin@gmail.com', frmpassword: 'admin01' });
    expect(res.headers.location).toBe('/restaurantes/1?login=csrf');
    const pagina = await agente.get('/restaurantes/1');
    expect(pagina.text).not.toContain('Bienvenido');
  });

  test('el login sin id de restaurante se rechaza (400)', async () => {
    const agente = request.agent(env.app);
    const csrf = await tokenDe(agente);
    const res = await agente.post('/login').type('form').send({ csrf, frmusuario: 'admin@gmail.com', frmpassword: 'admin01' });
    expect(res.status).toBe(400);
  });
});

describe('ASVS V6.3 Proteccion contra fuerza bruta', () => {
  test('tras 5 intentos fallidos la cuenta queda bloqueada, incluso con la clave correcta', async () => {
    for (let i = 0; i < 5; i++) {
      const { res } = await iniciarSesion(env.app, 'admin@gmail.com', `mala${i}`);
      expect(res.headers.location).toBe('/restaurantes/1?login=error');
    }
    const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
    expect(res.headers.location).toBe('/restaurantes/1?login=bloqueado');
  }, 60000);

  test('el mensaje de bloqueo se muestra al usuario', async () => {
    const agente = request.agent(env.app);
    const pagina = await agente.get('/restaurantes/1?login=bloqueado');
    expect(pagina.text).toContain('Demasiados intentos fallidos');
  });

  test('un login correcto reinicia el contador de la cuenta', async () => {
    for (let i = 0; i < 3; i++) await iniciarSesion(env.app, 'admin@gmail.com', 'mala');
    const ok = await iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
    expect(ok.res.headers.location).toBe('/restaurantes/1');
    for (let i = 0; i < 4; i++) {
      const { res } = await iniciarSesion(env.app, 'admin@gmail.com', 'mala');
      expect(res.headers.location).toBe('/restaurantes/1?login=error');
    }
  }, 60000);

  test('los intentos contra una cuenta inexistente tambien se limitan', async () => {
    for (let i = 0; i < 5; i++) await iniciarSesion(env.app, 'fantasma@gmail.com', 'x');
    const { res } = await iniciarSesion(env.app, 'fantasma@gmail.com', 'x');
    expect(res.headers.location).toBe('/restaurantes/1?login=bloqueado');
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
    expect(res.headers.location).toBe('/restaurantes/1?login=error');
    const r = await env.pool.query('SELECT count(*)::int AS n FROM intentos');
    expect(r.rows[0].n).toBe(0);
  });

  test('inyeccion SQL en el usuario no inicia sesion', async () => {
    const { res } = await iniciarSesion(env.app, "' OR '1'='1", "' OR '1'='1");
    expect(res.headers.location).toBe('/restaurantes/1?login=error');
  });
});
