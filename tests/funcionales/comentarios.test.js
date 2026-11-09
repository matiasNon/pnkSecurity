'use strict';
// RF-05 Comentarios (API) | ASVS v5 V1.2 (XSS), V2.3/V2.4 (anti automatizacion), V3.5 (CSRF), V8 (autorizacion)
// El escape al mostrar lo hace el frontend (textContent); aqui se verifica que la API entregue el texto como DATO
// (JSON con nosniff) y nunca como HTML. La prueba visual del XSS esta en tests/e2e (navegador real).

const request = require('supertest');
const { crearEntorno, tokenDe, iniciarSesion, limpiarIntentos } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => {
  await env.pool.query("DELETE FROM comentarios WHERE usuario IN ('Alondra', 'Administrador')");
  await limpiarIntentos(env.pool);
  await env.pool.end();
});
beforeEach(async () => { await limpiarIntentos(env.pool); });

const comentar = (agente, csrf, texto, rid = 1, extra = {}) =>
  agente.post(`/api/restaurantes/${rid}/comentarios`).set('X-CSRF-Token', csrf).send({ comentario: texto, ...extra });
const textos = (res) => res.body.comentarios.map((c) => c.comentario);

describe('RF-05 Publicar comentarios', () => {
  test('un usuario con sesion publica un comentario y aparece en la carta', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const r = await comentar(agente, csrf, 'Excelente atencion QA-001');
    expect(r.status).toBe(201);
    expect(r.body.comentario).toEqual({ usuario: 'Alondra', comentario: 'Excelente atencion QA-001' });
    const carta = await agente.get('/api/restaurantes/1');
    expect(textos(carta)).toContain('Excelente atencion QA-001');
  });

  test('el autor sale de la sesion: un campo "usuario" enviado en el cuerpo se ignora', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    await comentar(agente, csrf, 'Suplantacion QA-002', 1, { usuario: 'Administrador' });
    const r = await env.pool.query("SELECT usuario FROM comentarios WHERE comentario = 'Suplantacion QA-002'");
    expect(r.rows[0].usuario).toBe('Alondra');
  });

  test('los saltos de linea se conservan en el dato (el frontend los muestra como <br>)', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    await comentar(agente, csrf, 'linea uno QA-003\nlinea dos');
    const carta = await agente.get('/api/restaurantes/1');
    expect(textos(carta)).toContain('linea uno QA-003\nlinea dos');
  });

  test('los comentarios son del restaurante donde se publican', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    await comentar(agente, csrf, 'Solo en la bahia QA-004', 2);
    const uno = await request(env.app).get('/api/restaurantes/1');
    const dos = await request(env.app).get('/api/restaurantes/2');
    expect(textos(uno)).not.toContain('Solo en la bahia QA-004');
    expect(textos(dos)).toContain('Solo en la bahia QA-004');
  });
});

describe('ASVS V1.2 XSS: el contenido se entrega como dato, nunca como HTML', () => {
  test.each([
    ['<script>alert(1)</script>'],
    ['<img src=x onerror=alert(1)>'],
    ['"><svg/onload=alert(1)>'],
    ["' onmouseover='alert(1)"],
  ])('%s', async (carga) => {
    await limpiarIntentos(env.pool);
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    await comentar(agente, csrf, carga);
    const carta = await agente.get('/api/restaurantes/1');
    // Respuesta JSON con nosniff: el navegador no la interpreta como HTML aunque se abra directo.
    expect(carta.headers['content-type']).toMatch(/^application\/json/);
    expect(carta.headers['x-content-type-options']).toBe('nosniff');
    expect(carta.headers['content-security-policy']).toContain("default-src 'none'");
    // El texto se conserva exacto (sin "limpiar"): el escape corresponde al mostrarlo.
    expect(textos(carta)).toContain(carga);
  });
});

describe('Validacion y limites', () => {
  test('comentario vacio o solo con espacios -> 400 invalido', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    for (const t of ['', '    ']) {
      const r = await comentar(agente, csrf, t);
      expect(r.status).toBe(400);
      expect(r.body.codigo).toBe('invalido');
    }
  });

  test('1000 caracteres es valido; 1001 es invalido', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    expect((await comentar(agente, csrf, 'a'.repeat(1001))).status).toBe(400);
    await limpiarIntentos(env.pool);
    expect((await comentar(agente, csrf, 'b'.repeat(1000))).status).toBe(201);
    await env.pool.query('DELETE FROM comentarios WHERE comentario = $1', ['b'.repeat(1000)]);
  });

  test('un comentario que no es texto (objeto) se rechaza o se guarda como texto, nunca 500', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const r = await comentar(agente, csrf, { $gt: '' });
    expect(r.status).toBeLessThan(500);
  });

  test('los emojis se aceptan (PostgreSQL usa UTF-8 completo)', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    expect((await comentar(agente, csrf, 'Muy rico 😀 QA-005')).status).toBe(201);
  });

  test('un caracter NUL en el texto no provoca error 500', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const r = await comentar(agente, csrf, 'con\u0000nulo QA-006');
    expect(r.status).toBe(201);
  });

  test('dos comentarios seguidos: el segundo debe esperar 10 segundos (429)', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    expect((await comentar(agente, csrf, 'primero QA-007')).status).toBe(201);
    const segundo = await comentar(agente, csrf, 'segundo QA-007');
    expect(segundo.status).toBe(429);
    expect(segundo.body.codigo).toBe('espera');
    const r = await env.pool.query("SELECT 1 FROM comentarios WHERE comentario = 'segundo QA-007'");
    expect(r.rowCount).toBe(0);
  });

  test('tope de 30 comentarios por hora y por usuario', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const uid = (await env.pool.query("SELECT id FROM usuarios WHERE email = 'alondra@gmail.com'")).rows[0].id;
    const clave = 'm:' + require('node:crypto').createHash('sha256').update(`uid:${uid}`).digest('hex');
    // 30 comentarios ya registrados hace 5 minutos
    await env.pool.query(
      "INSERT INTO intentos (tipo, clave, creado_en) SELECT 'comentario', $1, now() - interval '5 minutes' FROM generate_series(1, 30)",
      [clave]
    );
    const r = await comentar(agente, csrf, 'treinta y uno QA-008');
    expect(r.status).toBe(429);
  });
});

describe('ASVS V8 / V3.5 Autorizacion y CSRF', () => {
  test('sin sesion no se puede comentar (401)', async () => {
    const agente = request.agent(env.app);
    const csrf = await tokenDe(agente);
    const r = await comentar(agente, csrf, 'anonimo QA-009');
    expect(r.status).toBe(401);
    const f = await env.pool.query("SELECT 1 FROM comentarios WHERE comentario = 'anonimo QA-009'");
    expect(f.rowCount).toBe(0);
  });

  test('sin token CSRF no se publica (403 codigo "csrf")', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const r = await agente.post('/api/restaurantes/1/comentarios').send({ comentario: 'sin token QA-010' });
    expect(r.status).toBe(403);
    expect(r.body.codigo).toBe('csrf');
    const f = await env.pool.query("SELECT 1 FROM comentarios WHERE comentario = 'sin token QA-010'");
    expect(f.rowCount).toBe(0);
  });

  test('el token anterior al login ya no sirve despues de iniciar sesion', async () => {
    const agente = request.agent(env.app);
    const viejo = await tokenDe(agente);
    await agente.post('/api/login').set('X-CSRF-Token', viejo).send({ email: 'alondra@gmail.com', password: 'alondra01' });
    const r = await comentar(agente, viejo, 'token viejo QA-011');
    expect(r.status).toBe(403);
  });

  test('restaurante inexistente -> 404', async () => {
    const { agente, csrf } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    expect((await comentar(agente, csrf, 'x', 99)).status).toBe(404);
  });
});
