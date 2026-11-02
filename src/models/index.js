'use strict';
// Capa de modelos (la M de MVC). Todos los modelos reciben el pool y usan consultas parametrizadas.
// Visibilidad: la carta publica solo muestra lo que esta visible y no eliminado en toda la cadena
// restaurante -> carta -> categoria -> producto (igual que la version PHP).

const crearRestauranteModelo = require('./restaurante');
const crearCartaModelo = require('./carta');
const crearUsuarioModelo = require('./usuario');
const crearComentarioModelo = require('./comentario');
const crearAdminModelo = require('./admin');

function crearModelos(pool) {
  return {
    restaurante: crearRestauranteModelo(pool),
    carta: crearCartaModelo(pool),
    usuario: crearUsuarioModelo(pool),
    comentario: crearComentarioModelo(pool),
    admin: crearAdminModelo(pool),
  };
}

module.exports = { crearModelos };
