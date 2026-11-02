'use strict';
// Rutas publicas: carta, carrito, comentarios, login y logout.

const express = require('express');
const { validarCsrf } = require('../middleware/csrf');
const { entero } = require('../utils/validar');

module.exports = ({ carta, comentario, auth }) => {
  const router = express.Router();

  // Entrada: redirige a un restaurante de demostracion. Las rutas /index.php?id=N de los codigos QR de la
  // version anterior siguen funcionando (redireccion permanente a la URL limpia).
  router.get('/', (req, res) => res.redirect(302, '/restaurantes/1'));
  router.get('/index.php', (req, res) => {
    const id = entero(req.query.id);
    if (id === null) return res.status(404).render('error', { titulo: 'Restaurante no encontrado', codigo: 404 });
    return res.redirect(301, `/restaurantes/${id}`);
  });

  router.get('/restaurantes/:id', carta.cargarRestaurante, carta.mostrarCarta);
  router.get('/restaurantes/:id/carrito', carta.cargarRestaurante, carta.mostrarCarrito);

  // Operaciones del carrito (AJAX): token CSRF obligatorio en la cabecera X-CSRF-Token.
  const csrfCarrito = validarCsrf('carrito_csrf_invalido');
  router.post('/restaurantes/:id/carrito/items', carta.cargarRestaurante, carta.soloFormulario, csrfCarrito, carta.agregarItem);
  router.delete('/restaurantes/:id/carrito/items/:pos', carta.cargarRestaurante, csrfCarrito, carta.eliminarItem);
  router.delete('/restaurantes/:id/carrito', carta.cargarRestaurante, csrfCarrito, carta.vaciarCarrito);

  // Comentarios: si el token vencio se vuelve a la carta con un aviso en lugar de una pagina de error.
  router.post(
    '/restaurantes/:id/comentarios',
    carta.cargarRestaurante,
    validarCsrf('comentario_csrf_invalido', (req, res) => res.redirect(303, `/restaurantes/${req.rid}?c=csrf`)),
    comentario
  );

  router.post(
    '/login',
    validarCsrf('login_csrf_invalido', (req, res) =>
      res.redirect(303, auth.destinoCarta(entero(req.body && req.body.id), '?login=csrf'))),
    auth.login
  );
  router.post(
    '/logout',
    validarCsrf('logout_csrf_invalido', (req, res) =>
      res.redirect(303, auth.destinoCarta(entero(req.body && req.body.id)))),
    auth.logout
  );

  return router;
};
