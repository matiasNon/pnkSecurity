'use strict';
// Rutas de la API REST (todas bajo /api). El frontend (otro contenedor/ASG) solo habla con el backend por aqui.
// Toda peticion que modifica estado exige el token CSRF en la cabecera X-CSRF-Token.

const express = require('express');
const { validarCsrf } = require('../middleware/csrf');
const { requiereSesion, requiereAdmin } = require('../middleware/autenticacion');

function rutasPublicas({ carta, comentario, auth }) {
  const router = express.Router();

  router.get('/sesion', auth.sesion);
  router.post('/login', carta.soloJson('login_tipo_contenido_rechazado'), validarCsrf('login_csrf_invalido'), auth.login);
  router.post('/logout', validarCsrf('logout_csrf_invalido'), auth.logout);

  router.get('/restaurantes/:id', carta.cargarRestaurante, carta.mostrarCarta);
  router.get('/restaurantes/:id/carrito', carta.cargarRestaurante, carta.mostrarCarrito);

  const csrfCarrito = validarCsrf('carrito_csrf_invalido');
  router.post('/restaurantes/:id/carrito/items', carta.cargarRestaurante,
    carta.soloJson('carrito_tipo_contenido_rechazado'), csrfCarrito, carta.agregarItem);
  router.patch('/restaurantes/:id/carrito/items/:pos', carta.cargarRestaurante,
    carta.soloJson('carrito_tipo_contenido_rechazado'), csrfCarrito, carta.cambiarCantidad);
  router.delete('/restaurantes/:id/carrito/items/:pos', carta.cargarRestaurante, csrfCarrito, carta.eliminarItem);
  router.delete('/restaurantes/:id/carrito', carta.cargarRestaurante, csrfCarrito, carta.vaciarCarrito);

  router.post('/restaurantes/:id/comentarios', carta.cargarRestaurante,
    carta.soloJson('comentario_tipo_contenido_rechazado'), validarCsrf('comentario_csrf_invalido'), comentario);

  return router;
}

// Panel de administracion. Cadena de proteccion en TODAS: sesion valida -> rol admin -> (subida) -> token CSRF ->
// controlador acotado al restaurante de la sesion.
function rutasAdmin(admin, subidas) {
  const router = express.Router();
  router.use(requiereSesion, requiereAdmin);

  // multer va antes del CSRF solo para leer el cuerpo multipart; el token se valida antes de guardar nada
  // (la foto queda en memoria y se escribe en disco recien en el controlador).
  const escritura = [subidas.recibir, validarCsrf('admin_csrf_invalido')];

  router.get('/', admin.panel);
  router.get('/:recurso', admin.recursoDe, admin.lista);
  router.get('/:recurso/nuevo', admin.recursoDe, admin.nuevo);
  router.get('/:recurso/:id', admin.recursoDe, admin.editar);
  router.post('/:recurso', admin.recursoDe, ...escritura, admin.guardar);
  router.put('/:recurso/:id', admin.recursoDe, ...escritura, admin.guardar);
  router.delete('/:recurso/:id', admin.recursoDe, validarCsrf('admin_csrf_invalido'), admin.eliminar);

  return router;
}

module.exports = { rutasPublicas, rutasAdmin };
