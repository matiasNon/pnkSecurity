'use strict';
// Utilidades comunes de las pruebas funcionales.

const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const { cargarConfig } = require('../src/config/env');
const { crearPool } = require('../src/config/db');
const { iniciarLog } = require('../src/services/logSeguridad');
const { crearApp } = require('../src/app');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'pnk-qa-uploads');

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
    UPLOAD_DIR,
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

// El token CSRF lo entrega GET /api/sesion (el frontend lo envia en la cabecera X-CSRF-Token).
async function tokenDe(agente) {
  const res = await agente.get('/api/sesion');
  if (!res.body || !res.body.csrf) throw new Error('No se obtuvo el token CSRF');
  return res.body.csrf;
}

// Inicia sesion por la API. Devuelve el agente (con la cookie), la respuesta y el token CSRF vigente
// (el login renueva el token, asi que despues de un login exitoso se usa el nuevo).
async function iniciarSesion(app, email, password) {
  const agente = request.agent(app);
  const previo = await tokenDe(agente);
  const res = await agente.post('/api/login').set('X-CSRF-Token', previo).send({ email, password });
  return { agente, res, csrf: (res.body && res.body.csrf) || previo };
}

async function limpiarIntentos(pool) {
  await pool.query('DELETE FROM intentos');
}

module.exports = { entornoPrueba, crearEntorno, tokenDe, iniciarSesion, limpiarIntentos, UPLOAD_DIR };
