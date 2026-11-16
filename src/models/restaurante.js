'use strict';

module.exports = (pool) => ({
  // Datos publicos de un restaurante (con su direccion) o null si no existe / esta eliminado.
  async obtener(id) {
    const r = await pool.query(
      `SELECT r.id, r.nombre, r.fono, r.email, r.foto,
              d.calle, d.numero, d.comuna, d.region
         FROM restaurantes r
         JOIN direcciones d ON d.id = r.direccion_id
        WHERE r.id = $1 AND r.eliminado_en IS NULL`,
      [id]
    );
    return r.rows[0] || null;
  },

  // Listado publico (solo lectura) para la pagina de seleccion de restaurante, con el numero de cartas visibles.
  async listar() {
    const r = await pool.query(
      `SELECT r.id, r.nombre, r.foto, d.calle, d.numero, d.comuna,
              (SELECT count(*)::int FROM cartas c
                WHERE c.restaurante_id = r.id AND c.visible AND c.eliminado_en IS NULL) AS cartas
         FROM restaurantes r
         JOIN direcciones d ON d.id = r.direccion_id
        WHERE r.eliminado_en IS NULL
        ORDER BY r.id`
    );
    return r.rows;
  },

  async existe(id) {
    const r = await pool.query('SELECT 1 FROM restaurantes WHERE id = $1 AND eliminado_en IS NULL', [id]);
    return r.rowCount > 0;
  },
});
