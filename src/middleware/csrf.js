'use strict';
// CSRF (ASVS v5 V3.5): token aleatorio por sesion, comparacion en tiempo constante.
// El token llega por el campo de formulario "csrf" o por la cabecera X-CSRF-Token (AJAX).

const crypto = require('node:crypto');
const { logSeguridad } = require('../services/logSeguridad');

// Garantiza que la sesion tenga token y lo expone a las vistas.
function asegurarToken(req, res, next) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrf;
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

// Valida el token en toda peticion que modifica estado. "alFallar" permite redirigir con un aviso
// (login, comentarios); por defecto responde 403.
function validarCsrf(evento, alFallar) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (csrfValido(req)) return next();
    logSeguridad('SEC', evento, {}, req);
    if (alFallar) return alFallar(req, res);
    return res.status(403).render('error', { titulo: 'Solicitud no autorizada', codigo: 403 });
  };
}

module.exports = { asegurarToken, validarCsrf, csrfValido, tokensIguales };
