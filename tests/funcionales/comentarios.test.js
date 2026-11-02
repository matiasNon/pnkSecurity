'use strict';
// RF-05 Comentarios | ASVS v5 V1.2 (XSS), V2.3/V2.4 (anti automatizacion), V3.5 (CSRF), V8 (autorizacion)

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
  agente.post(`/restaurantes/${rid}/comentarios`).type('form').send({ csrf, comentario: texto, ...extra });

describe('RF-05 Publicar comentarios', () => {
  test('un usuario con sesion publica un comentario y lo ve en la carta', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    const r = await comentar(agente, csrf, 'Excelente atencion QA-001');
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe('/restaurantes/1?c=ok');
    const pagina = await agente.get('/restaurantes/1?c=ok');
    expect(pagina.text).toContain('Excelente atencion QA-001');
    expect(pagina.text).toContain('Comentario publicado.');
  });

  test('el autor sale de la sesion: un campo "usuario" enviado en el formulario se ignora', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    await comentar(agente, csrf, 'Suplantacion QA-002', 1, { usuario: 'Administrador' });
    const r = await env.pool.query("SELECT usuario FROM comentarios WHERE comentario = 'Suplantacion QA-002'");
    expect(r.rows[0].usuario).toBe('Alondra');
  });

  test('los saltos de linea se muestran como <br> sin romper el escape', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    await comentar(agente, csrf, 'linea uno QA-003\nlinea dos');
    const pagina = await agente.get('/restaurantes/1');
    expect(pagina.text).toContain('linea uno QA-003<br>linea dos');
  });

  test('los comentarios son del restaurante donde se publican', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01', 2);
    const csrf = await tokenDe(agente, '/restaurantes/2');
    await comentar(agente, csrf, 'Solo en la bahia QA-004', 2);
    const uno = await request(env.app).get('/restaurantes/1');
    const dos = await request(env.app).get('/restaurantes/2');
    expect(uno.text).not.toContain('Solo en la bahia QA-004');
    expect(dos.text).toContain('Solo en la bahia QA-004');
  });
});

describe('ASVS V1.2 XSS: el contenido de los comentarios se escapa', () => {
  test.each([
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
    ['"><svg/onload=alert(1)>', '&quot;&gt;&lt;svg/onload=alert(1)&gt;'],
    ["' onmouseover='alert(1)", '&#39; onmouseover=&#39;alert(1)'],
  ])('%s', async (carga, esperado) => {
    await limpiarIntentos(env.pool);
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    await comentar(agente, csrf, carga);
    const pagina = await agente.get('/restaurantes/1');
    expect(pagina.text).toContain(esperado);
    expect(pagina.text).not.toContain(carga);
  });

  test('un nombre de usuario con HTML tambien se escapa', async () => {
    await env.pool.query("INSERT INTO comentarios (usuario, comentario, restaurante_id) VALUES ('<b>x</b>', 'hola', 1)");
    try {
      const pagina = await request(env.app).get('/restaurantes/1');
      expect(pagina.text).toContain('&lt;b&gt;x&lt;/b&gt;');
    } finally {
      await env.pool.query("DELETE FROM comentarios WHERE usuario = '<b>x</b>'");
    }
  });
});

describe('Validacion y limites', () => {
  test('comentario vacio o solo con espacios -> invalido', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    expect((await comentar(agente, csrf, '')).headers.location).toBe('/restaurantes/1?c=invalido');
    expect((await comentar(agente, csrf, '    ')).headers.location).toBe('/restaurantes/1?c=invalido');
  });

  test('1000 caracteres es valido; 1001 es invalido', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    const largo = await comentar(agente, csrf, 'a'.repeat(1001));
    expect(largo.headers.location).toBe('/restaurantes/1?c=invalido');
    await limpiarIntentos(env.pool);
    const justo = await comentar(agente, csrf, 'b'.repeat(1000));
    expect(justo.headers.location).toBe('/restaurantes/1?c=ok');
    await env.pool.query("DELETE FROM comentarios WHERE comentario = $1", ['b'.repeat(1000)]);
  });

  test('los emojis se aceptan (PostgreSQL usa UTF-8 completo)', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    const r = await comentar(agente, csrf, 'Muy rico 😀 QA-005');
    expect(r.headers.location).toBe('/restaurantes/1?c=ok');
  });

  test('un caracter NUL en el texto no provoca error 500', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    const r = await comentar(agente, csrf, 'con\u0000nulo QA-006');
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe('/restaurantes/1?c=ok');
  });

  test('dos comentarios seguidos: el segundo debe esperar 10 segundos', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    expect((await comentar(agente, csrf, 'primero QA-007')).headers.location).toBe('/restaurantes/1?c=ok');
    const segundo = await comentar(agente, csrf, 'segundo QA-007');
    expect(segundo.headers.location).toBe('/restaurantes/1?c=espera');
    const r = await env.pool.query("SELECT 1 FROM comentarios WHERE comentario = 'segundo QA-007'");
    expect(r.rowCount).toBe(0);
  });

  test('tope de 30 comentarios por hora y por usuario', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    const uid = (await env.pool.query("SELECT id FROM usuarios WHERE email = 'alondra@gmail.com'")).rows[0].id;
    const clave = 'm:' + require('node:crypto').createHash('sha256').update(`uid:${uid}`).digest('hex');
    // 30 comentarios ya registrados hace 5 minutos
    await env.pool.query(
      "INSERT INTO intentos (tipo, clave, creado_en) SELECT 'comentario', $1, now() - interval '5 minutes' FROM generate_series(1, 30)",
      [clave]
    );
    const r = await comentar(agente, csrf, 'treinta y uno QA-008');
    expect(r.headers.location).toBe('/restaurantes/1?c=espera');
  });
});

describe('ASVS V8 / V3.5 Autorizacion y CSRF', () => {
  test('sin sesion no se puede comentar (403)', async () => {
    const agente = request.agent(env.app);
    const csrf = await tokenDe(agente);
    const r = await comentar(agente, csrf, 'anonimo QA-009');
    expect(r.status).toBe(403);
    const f = await env.pool.query("SELECT 1 FROM comentarios WHERE comentario = 'anonimo QA-009'");
    expect(f.rowCount).toBe(0);
  });

  test('sin token CSRF no se publica y se avisa que la sesion expiro', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const r = await agente.post('/restaurantes/1/comentarios').type('form').send({ comentario: 'sin token QA-010' });
    expect(r.headers.location).toBe('/restaurantes/1?c=csrf');
    const f = await env.pool.query("SELECT 1 FROM comentarios WHERE comentario = 'sin token QA-010'");
    expect(f.rowCount).toBe(0);
  });

  test('restaurante inexistente -> 404', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const csrf = await tokenDe(agente);
    expect((await comentar(agente, csrf, 'x', 99)).status).toBe(404);
  });

  test('el formulario de comentarios solo se muestra con sesion', async () => {
    const anonimo = await request(env.app).get('/restaurantes/1');
    expect(anonimo.text).not.toContain('name="comentario"');
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    const conSesion = await agente.get('/restaurantes/1');
    expect(conSesion.text).toContain('name="comentario"');
  });
});
