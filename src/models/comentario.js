'use strict';

module.exports = (pool) => ({
  // Ultimos 100 comentarios en orden cronologico (acota el tamano de la pagina).
  async ultimos(restauranteId) {
    const r = await pool.query(
      `SELECT usuario, comentario FROM (
         SELECT id, usuario, comentario FROM comentarios
          WHERE restaurante_id = $1 ORDER BY id DESC LIMIT 100) ultimos
        ORDER BY id ASC`,
      [restauranteId]
    );
    return r.rows;
  },

  async crear({ usuario, usuarioId, comentario, restauranteId }) {
    await pool.query(
      'INSERT INTO comentarios (usuario, usuario_id, comentario, restaurante_id) VALUES ($1, $2, $3, $4)',
      [usuario, usuarioId, comentario, restauranteId]
    );
  },
});
