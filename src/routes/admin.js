'use strict';
// Rutas del panel de administracion. Cadena de proteccion en TODAS: sesion valida -> rol admin ->
// (subida) -> token CSRF -> controlador acotado al restaurante de la sesion.

const express = require('express');
const { requiereSesion, requiereAdmin } = require('../middleware/autenticacion');
const { validarCsrf } = require('../middleware/csrf');

module.exports = (admin, subidas) => {
  const router = express.Router();
  router.use(requiereSesion, requiereAdmin);

  const csrf = validarCsrf('admin_csrf_invalido');
  // multer va antes del CSRF porque en un formulario multipart el token llega dentro del cuerpo.
  const escritura = [subidas.recibir, csrf];

  router.get('/', admin.panel);
  router.get('/:recurso', admin.recursoDe, admin.lista);
  router.get('/:recurso/nuevo', admin.recursoDe, admin.nuevo);
  router.post('/:recurso', admin.recursoDe, ...escritura, admin.guardar);
  router.get('/:recurso/:id/editar', admin.recursoDe, admin.editar);
  router.post('/:recurso/:id/eliminar', admin.recursoDe, ...escritura, admin.eliminar);
  router.post('/:recurso/:id', admin.recursoDe, ...escritura, admin.guardar);

  return router;
};
