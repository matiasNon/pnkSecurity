'use strict';
// CSRF (ASVS v5 V3.5): token aleatorio por sesion, comparacion en tiempo constante.
// El token llega por la cabecera X-CSRF-Token (o, por compatibilidad, en el campo "csrf" del cuerpo).

const crypto = require('node:crypto');
const { logSeguridad } = require('../services/logSeguridad');

// Garantiza que la sesion tenga token. El frontend lo obtiene con GET /api/sesion y lo envia en X-CSRF-Token.
function nuevoToken(req) {
  req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function asegurarToken(req, res, next) {
  if (!req.session.csrf) nuevoToken(req);
  next();
}

function tokensIguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function csrfValido(req) {
  const enviado = (req.body && req.body.csrf) || req.get('x-csrf-token') || '';
  return Boolean(req.session && req.session.csrf) && tokensIguales(req.session.csrf, enviado);
}

// Valida el token en toda peticion que modifica estado. Si falla responde 403 con codigo "csrf"
// (el frontend pide un token nuevo y avisa que la solicitud expiro).
function validarCsrf(evento) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (csrfValido(req)) return next();
    logSeguridad('SEC', evento, {}, req);
    return res.status(403).json({ error: 'La solicitud expiró. Intente nuevamente.', codigo: 'csrf' });
  };
}

module.exports = { asegurarToken, nuevoToken, validarCsrf, csrfValido, tokensIguales };
