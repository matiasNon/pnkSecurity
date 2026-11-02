'use strict';
// Utilidades comunes de las pruebas funcionales.

const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const { cargarConfig } = require('../src/config/env');
const { crearPool } = require('../src/config/db');
const { iniciarLog } = require('../src/services/logSeguridad');
const { crearApp } = require('../src/app');

const UPLOAD_DIR = path.join(os.tmpdir(), 'pnk-qa-uploads');

// Variables de entorno del ambiente QA. Se pueden sobrescribir desde fuera (docker-compose.qa.yml).
function entornoPrueba(extra = {}) {
  return {
    APP_ENV: 'qa',
    LOG_LEVEL: 'silent',
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: process.env.DB_PORT || '5433',
    DB_NAME: process.env.DB_NAME || 'pnk_carta_test',
    DB_USER: process.env.DB_USER || 'pnk_app',
    DB_PASSWORD: process.env.DB_PASSWORD || 'dev_password_local',
    SESSION_SECRET: 'secreto-de-pruebas-automaticas-qa-0123456789',
    UPLOAD_DIR: process.env.UPLOAD_DIR || UPLOAD_DIR,
    ...extra,
  };
}

function crearEntorno(extra = {}) {
  const cfg = cargarConfig(entornoPrueba(extra));
  iniciarLog('silent');
  const pool = crearPool(cfg);
  const app = crearApp({ cfg, pool });
  return { cfg, pool, app };
}

// El token CSRF se entrega en <meta name="csrf-token">.
function extraerCsrf(html) {
  const m = /name="csrf-token" content="([a-f0-9]+)"/.exec(html);
  if (!m) throw new Error('No se encontro el token CSRF en la pagina');
  return m[1];
}

// Abre una pagina y devuelve el token CSRF de la sesion del agente.
async function tokenDe(agente, ruta = '/restaurantes/1') {
  const res = await agente.get(ruta);
  return extraerCsrf(res.text);
}

async function iniciarSesion(app, email, password, restauranteId = 1) {
  const agente = request.agent(app);
  const csrf = await tokenDe(agente, `/restaurantes/${restauranteId}`);
  const res = await agente.post('/login').type('form').send({ csrf, id: restauranteId, frmusuario: email, frmpassword: password });
  return { agente, res, csrf };
}

async function limpiarIntentos(pool) {
  await pool.query('DELETE FROM intentos');
}

module.exports = { entornoPrueba, crearEntorno, extraerCsrf, tokenDe, iniciarSesion, limpiarIntentos, UPLOAD_DIR };
