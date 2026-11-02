'use strict';
// Manejo de errores: respuestas genericas al usuario, detalle solo en el log (ASVS v5 V16.5, ISO 27001 A.8.28).

const { logError } = require('../services/logSeguridad');

function noEncontrado(req, res) {
  res.status(404).render('error', { titulo: 'Página no encontrada', codigo: 404 });
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) return next(err);
  // Errores de lectura del cuerpo (JSON/forms malformados o demasiado grandes): 4xx sin detalle tecnico.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).render('error', { titulo: 'La solicitud es demasiado grande', codigo: 413 });
  }
  if (err && err.status >= 400 && err.status < 500) {
    return res.status(err.status).render('error', { titulo: 'Solicitud inválida', codigo: err.status });
  }
  logError('Error no controlado', err);
  return res.status(500).render('error', { titulo: 'Ha ocurrido un error. Intente nuevamente más tarde.', codigo: 500 });
}

module.exports = { noEncontrado, manejadorErrores };
