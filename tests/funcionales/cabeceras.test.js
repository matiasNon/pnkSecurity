'use strict';
// ASVS v5 V3 (cabeceras y CSP), V7.2 (cookie de sesion), V13 (configuracion) | ISO 27001 A.8.9 / A.8.24

const request = require('supertest');
const { crearEntorno } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => { await env.pool.end(); });

describe('Cabeceras HTTP de seguridad', () => {
  let res;
  beforeAll(async () => { res = await request(env.app).get('/restaurantes/1'); });

  test('Content-Security-Policy sin unsafe-inline ni unsafe-eval y con frame-ancestors none', () => {
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  test('X-Content-Type-Options, X-Frame-Options, Referrer-Policy y Permissions-Policy', () => {
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toContain('geolocation=()');
  });

  test('no se revela la tecnologia (sin X-Powered-By) y las paginas dinamicas no se cachean', () => {
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('sin HTTPS no se envia Strict-Transport-Security (solo aplica en conexiones seguras)', () => {
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('Cookie de sesion', () => {
  test('PNKSESSID es HttpOnly y SameSite=Strict', async () => {
    const res = await request(env.app).get('/restaurantes/1');
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('PNKSESSID='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
  });

  test('en produccion la cookie ademas lleva el atributo Secure y HSTS cuando llega por HTTPS', async () => {
    const prod = crearEntorno({
      APP_ENV: 'prod', SESSION_SECRET: 'x'.repeat(40),
      TRUST_PROXY: '1', FORCE_HTTPS: '1', PUBLIC_HOST: 'carta.ejemplo.cl',
    });
    try {
      const res = await request(prod.app).get('/restaurantes/1').set('X-Forwarded-Proto', 'https');
      expect(res.status).toBe(200);
      const cookie = res.headers['set-cookie'].find((c) => c.startsWith('PNKSESSID='));
      expect(cookie).toMatch(/Secure/i);
      expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    } finally {
      await prod.pool.end();
    }
  });
});

describe('HTML sin codigo en linea (necesario para una CSP estricta)', () => {
  test.each([['/restaurantes/1'], ['/restaurantes/1/carrito'], ['/restaurantes/3']])('%s', async (ruta) => {
    const res = await request(env.app).get(ruta);
    expect(res.text).not.toMatch(/<script(?![^>]*\ssrc=)/i);
    expect(res.text).not.toMatch(/\sstyle=/i);
    expect(res.text).not.toMatch(/\son[a-z]+=/i);
    expect(res.text).not.toMatch(/javascript:/i);
  });

  test('todas las librerias de terceros llevan integridad SRI (sha384)', async () => {
    const res = await request(env.app).get('/restaurantes/1');
    const vendors = res.text.match(/<(?:script|link)[^>]+vendors\/[^>]+>/g) || [];
    expect(vendors.length).toBeGreaterThanOrEqual(9);
    for (const etiqueta of vendors) expect(etiqueta).toMatch(/integrity="sha384-/);
  });
});

describe('Redireccion a HTTPS (PNK_FORCE_HTTPS)', () => {
  let prod;
  beforeAll(() => {
    prod = crearEntorno({
      APP_ENV: 'prod', SESSION_SECRET: 'x'.repeat(40),
      TRUST_PROXY: '1', FORCE_HTTPS: '1', PUBLIC_HOST: 'carta.ejemplo.cl',
    });
  });
  afterAll(async () => { await prod.pool.end(); });

  test('GET por HTTP se redirige (301) al host de la configuracion, nunca al Host del cliente', async () => {
    const res = await request(prod.app).get('/restaurantes/1').set('Host', 'malo.example').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://carta.ejemplo.cl/restaurantes/1');
  });

  test('POST por HTTP se rechaza (403) porque ya viajo en claro', async () => {
    const res = await request(prod.app).post('/login').set('X-Forwarded-Proto', 'http').type('form').send({ a: 1 });
    expect(res.status).toBe(403);
  });

  test('/health no se redirige (lo usa Docker por HTTP interno)', async () => {
    const res = await request(prod.app).get('/health').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(200);
  });
});
