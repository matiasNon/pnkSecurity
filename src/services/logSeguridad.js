'use strict';
// Registro de eventos de seguridad (ASVS v5 V16, ISO 27001 A.8.15). JSON por stdout (pino): Docker y la
// futura pipeline lo recogen sin tocar archivos. Mantiene los nombres de evento de la version PHP
// (login_ok, login_fallido, login_bloqueado, comentario_publicado...). Nunca se registran contrasenas.

const crypto = require('node:crypto');
const pino = require('pino');

let logger = null;

function iniciarLog(nivel) {
  logger = pino({
    level: nivel,
    base: { app: 'pnk-carta' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return logger;
}

function limpiar(valor, max = 100) {
  // Quita caracteres de control para impedir inyeccion de lineas en el log.
  return String(valor ?? '').replace(/[\x00-\x1F\x7F]+/g, ' ').slice(0, max);
}

// Identifica al usuario: el email si es valido; si no (p. ej. alguien escribio su clave en el campo)
// solo un hash corto.
function usuarioLog(usuario) {
  const u = String(usuario ?? '').trim();
  if (u === '') return '(vacio)';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return limpiar(u);
  return `(no-email:${crypto.createHash('sha256').update(u).digest('hex').slice(0, 10)})`;
}

function logSeguridad(categoria, evento, datos = {}, req = null) {
  if (!logger) iniciarLog('info');
  const registro = { categoria, evento };
  if (req) registro.ip = limpiar(req.ip, 45);
  for (const [clave, valor] of Object.entries(datos)) {
    registro[limpiar(clave, 30)] = typeof valor === 'number' ? valor : limpiar(valor);
  }
  logger.info(registro, `${categoria} ${evento}`);
}

function logError(mensaje, error) {
  if (!logger) iniciarLog('error');
  logger.error({ err: { tipo: error?.name, mensaje: error?.message, pila: error?.stack } }, mensaje);
}

module.exports = { iniciarLog, logSeguridad, logError, usuarioLog };
