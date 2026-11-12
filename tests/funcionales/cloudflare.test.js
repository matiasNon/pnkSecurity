'use strict';
// H10: IP real del visitante detras de Cloudflare (ASVS v5 V16 registro; limites por IP de V2/V6).

const express = require('express');
const request = require('supertest');
const { ipRealCloudflare, esDeCloudflare } = require('../../src/middleware/cloudflare');

function appCon(cfg, ipPeer) {
  const app = express();
  // Simula lo que entrega el ALB: req.ip = quien se conecto al balanceador.
  app.use((req, res, next) => { Object.defineProperty(req, 'ip', { value: ipPeer, configurable: true }); next(); });
  app.use(ipRealCloudflare(cfg));
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe('IP real detras de Cloudflare', () => {
  test.each([
    ['104.16.1.1', true], ['172.70.10.20', true], ['2606:4700::1', true], ['::ffff:162.158.5.5', true],
    ['8.8.8.8', false], ['10.0.1.15', false], ['', false], ['no-es-ip', false],
  ])('esDeCloudflare(%s) = %s', (ip, esperado) => {
    expect(esDeCloudflare(ip)).toBe(esperado);
  });

  test('si la conexion viene de Cloudflare se usa CF-Connecting-IP', async () => {
    const r = await request(appCon({ confiarCloudflare: true }, '172.70.10.20')).get('/ip').set('CF-Connecting-IP', '190.5.6.7');
    expect(r.body.ip).toBe('190.5.6.7');
  });

  test('una cabecera falsificada desde fuera de Cloudflare se ignora', async () => {
    const r = await request(appCon({ confiarCloudflare: true }, '45.33.1.2')).get('/ip').set('CF-Connecting-IP', '1.2.3.4');
    expect(r.body.ip).toBe('45.33.1.2');
  });

  test('un valor que no es IP se ignora', async () => {
    const r = await request(appCon({ confiarCloudflare: true }, '172.70.10.20')).get('/ip').set('CF-Connecting-IP', "1.2.3.4' OR 1=1");
    expect(r.body.ip).toBe('172.70.10.20');
  });

  test('desactivado (dev/qa o TRUST_CLOUDFLARE=0) no cambia nada', async () => {
    const r = await request(appCon({ confiarCloudflare: false }, '172.70.10.20')).get('/ip').set('CF-Connecting-IP', '190.5.6.7');
    expect(r.body.ip).toBe('172.70.10.20');
  });
});
