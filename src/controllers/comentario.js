'use strict';
// Publicacion de comentarios (equivale a grcomentarios.php): requiere sesion y token CSRF, el autor sale de la
// sesion (no del cuerpo), longitud 1..1000, limite por usuario y consulta parametrizada.
// La API devuelve el texto tal cual; el frontend lo muestra con textContent (nunca se interpreta como HTML).

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
  try {
    if (!req.usuario) {
      logSeguridad('SEC', 'comentario_sin_sesion', { restaurante: req.rid }, req);
      return res.status(401).json({ error: 'Debe iniciar sesión para comentar', codigo: 'sin_sesion' });
    }
    const comentario = normalizar(req.body && req.body.comentario);
    const largo = [...comentario].length;
    if (largo < 1 || largo > COMENTARIO_MAX) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío ni superar 1000 caracteres.', codigo: 'invalido' });
    }

    // Limite por usuario (no por sesion: volver a iniciar sesion no lo reinicia).
    if (await comentarioLimitado(pool, req.usuario.id)) {
      logSeguridad('SEC', 'comentario_limitado', { uid: req.usuario.id }, req);
      return res.status(429).json({ error: 'Espere unos segundos antes de publicar otro comentario.', codigo: 'espera' });
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
      return res.status(500).json({ error: 'No se pudo publicar el comentario. Intente nuevamente.', codigo: 'error' });
    }
    logSeguridad('SEC', 'comentario_publicado', { uid: req.usuario.id, restaurante: req.rid }, req);
    return res.status(201).json({ ok: true, comentario: { usuario: req.usuario.nombre, comentario } });
  } catch (e) {
    return next(e);
  }
};
