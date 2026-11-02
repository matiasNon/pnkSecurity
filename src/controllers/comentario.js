'use strict';
// Publicacion de comentarios (equivale a grcomentarios.php): requiere sesion y token CSRF, el autor sale de la
// sesion (no del formulario), longitud 1..1000, limite por usuario y consulta parametrizada.
// El escape contra XSS se aplica al mostrar los comentarios (vista carta.ejs).

const { comentarioLimitado } = require('../services/throttle');
const { logSeguridad, logError } = require('../services/logSeguridad');

const COMENTARIO_MAX = 1000;

function normalizar(texto) {
  // Fuera caracteres de control (PostgreSQL rechaza NUL) salvo saltos de linea y tabulaciones.
  return String(texto ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

module.exports = (modelos, pool) => async function publicar(req, res, next) {
  const destino = `/restaurantes/${req.rid}`;
  try {
    if (!req.usuario) {
      logSeguridad('SEC', 'comentario_sin_sesion', { restaurante: req.rid }, req);
      return res.status(403).render('error', { titulo: 'Debe iniciar sesión para comentar', codigo: 403 });
    }
    const comentario = normalizar(req.body && req.body.comentario);
    const largo = [...comentario].length;
    if (largo < 1 || largo > COMENTARIO_MAX) return res.redirect(303, `${destino}?c=invalido`);

    // Limite por usuario (no por sesion: volver a iniciar sesion no lo reinicia).
    if (await comentarioLimitado(pool, req.usuario.id)) {
      logSeguridad('SEC', 'comentario_limitado', { uid: req.usuario.id }, req);
      return res.redirect(303, `${destino}?c=espera`);
    }

    try {
      await modelos.comentario.crear({
        usuario: req.usuario.nombre,
        usuarioId: req.usuario.id,
        comentario,
        restauranteId: req.rid,
      });
    } catch (e) {
      logError('No se pudo guardar el comentario', e);
      return res.redirect(303, `${destino}?c=error`);
    }
    logSeguridad('SEC', 'comentario_publicado', { uid: req.usuario.id, restaurante: req.rid }, req);
    return res.redirect(303, `${destino}?c=ok`);
  } catch (e) {
    return next(e);
  }
};
