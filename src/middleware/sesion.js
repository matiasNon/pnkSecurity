'use strict';
// Sesion endurecida (ASVS v5 V7, ISO 27001 A.8.5): cookie PNKSESSID HttpOnly + SameSite=Strict (+ Secure en prod),
// almacenada en PostgreSQL, 30 min de inactividad y 8 h de vida maxima desde el inicio de sesion.

const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);

const INACTIVIDAD_MAX_MS = 30 * 60 * 1000;
const VIDA_MAX_MS = 8 * 60 * 60 * 1000;

function regenerar(req) {
  return new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
}

function guardar(req) {
  return new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
}

function middlewareSesion(cfg, pool) {
  const sesion = session({
    name: 'PNKSESSID',
    secret: cfg.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // Detras de nginx (TLS) la app ve HTTP: con trust proxy, express marca req.secure y permite la cookie Secure.
    proxy: cfg.confiarProxy,
    store: new PgStore({
      pool,
      tableName: 'sesiones',
      // El almacen no debe borrar la sesion antes que el control de inactividad de este codigo.
      ttl: (INACTIVIDAD_MAX_MS + 10 * 60 * 1000) / 1000,
      pruneSessionInterval: 15 * 60,
      errorLog: () => {},
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: cfg.cookieSegura,
      path: '/',
      // Cookie de sesion (sin Max-Age): se descarta al cerrar el navegador.
    },
  });

  // Vencimiento por inactividad o por vida maxima: se vacia la sesion y se emite un id nuevo.
  const vigencia = async (req, res, next) => {
    try {
      const ahora = Date.now();
      const s = req.session;
      const inactiva = s.ultimaActividad && ahora - s.ultimaActividad > INACTIVIDAD_MAX_MS;
      const vencida = s.inicio && ahora - s.inicio > VIDA_MAX_MS;
      if (inactiva || vencida) {
        await regenerar(req);
      }
      req.session.ultimaActividad = ahora;
      next();
    } catch (e) {
      next(e);
    }
  };

  return [sesion, vigencia];
}

module.exports = { middlewareSesion, regenerar, guardar, INACTIVIDAD_MAX_MS, VIDA_MAX_MS };
