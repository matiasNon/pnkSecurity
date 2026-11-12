'use strict';
// Consola de estado del backend (GET /api y GET /api/estado) | ASVS v5 V13.4 (sin informacion sensible), V3.4 (CSP)

const request = require('supertest');
const { crearEntorno } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await env.pool.end(); });

describe('Consola del backend', () => {
  test('GET /api/estado entrega estado de BD y almacenamiento sin sesion ni datos sensibles', async () => {
    const res = await request(env.app).get('/api/estado');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body).toMatchObject({ estado: 'ok', baseDatos: { ok: true }, almacenamiento: { ok: true } });
    expect(typeof res.body.nodo).toBe('string');
    expect(typeof res.body.baseDatos.latenciaMs).toBe('number');
    expect(typeof res.body.baseDatos.tls).toBe('boolean');
    expect(typeof res.body.baseDatos.minimoPrivilegio).toBe('boolean');
    for (const k of ['cartas', 'categorias', 'productos']) {
      expect(Number.isInteger(res.body.baseDatos.conteos[k])).toBe(true);
    }
    const crudo = JSON.stringify(res.body);
    for (const secreto of [env.cfg.DB_HOST, env.cfg.DB_USER, env.cfg.DB_PASSWORD, env.cfg.SESSION_SECRET]) {
      expect(crudo).not.toContain(secreto);
    }
  });

  test('si la BD falla responde 503 "degradado" sin detalle tecnico', async () => {
    const original = env.pool.query;
    env.pool.query = () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    try {
      const res = await request(env.app).get('/api/estado');
      expect(res.status).toBe(503);
      expect(res.body.estado).toBe('degradado');
      expect(res.body.baseDatos).toEqual({ ok: false, latenciaMs: null, tls: null, minimoPrivilegio: null, conteos: null });
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
    } finally {
      env.pool.query = original;
    }
  });

  test.each([['/api'], ['/api/']])('GET %s entrega la pagina HTML con CSP propia sin scripts en linea', async (ruta) => {
    const res = await request(env.app).get(ruta);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['set-cookie']).toBeUndefined();
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.text).toContain('Consola del backend');
    expect(res.text).not.toMatch(/<script>(?!<\/script>)|style="/);
  });

  test.each([
    ['/api/_consola/estado.css', /text\/css/],
    ['/api/_consola/estado.js', /javascript/],
  ])('GET %s sirve el recurso estatico', async (ruta, tipo) => {
    const res = await request(env.app).get(ruta);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(tipo);
  });

  test('no se puede salir del directorio de la consola', async () => {
    const res = await request(env.app).get('/api/_consola/..%2f..%2fpackage.json');
    expect(res.status).toBe(404);
  });
});
