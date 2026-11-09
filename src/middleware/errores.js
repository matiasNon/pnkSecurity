'use strict';
// Manejo de errores de la API: respuestas JSON genericas, detalle solo en el log (ASVS v5 V16.5, ISO 27001 A.8.28).

const { logError } = require('../services/logSeguridad');

function noEncontrado(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado', codigo: 'no_encontrado' });
}

function manejadorErrores(err, req, res, next) {
  if (res.headersSent) return next(err);
  // Errores de lectura del cuerpo (JSON/forms malformados o demasiado grandes): 4xx sin detalle tecnico.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'La solicitud es demasiado grande', codigo: 'muy_grande' });
  }
  if (err && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Solicitud inválida', codigo: 'invalida' });
  }
  logError('Error no controlado', err);
  return res.status(500).json({ error: 'Ha ocurrido un error. Intente nuevamente más tarde.', codigo: 'error' });
}

module.exports = { noEncontrado, manejadorErrores };
