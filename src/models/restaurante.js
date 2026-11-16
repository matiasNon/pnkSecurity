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

  // Alta de un restaurante con su direccion (una transaccion: o se crean las dos filas o ninguna). Devuelve el id nuevo.
  async crear(d) {
    const cx = await pool.connect();
    try {
      await cx.query('BEGIN');
      const dir = await cx.query(
        'INSERT INTO direcciones (calle, numero, comuna, region) VALUES ($1, $2, $3, $4) RETURNING id',
        [d.calle, d.numero, d.comuna, d.region]
      );
      const r = await cx.query(
        `INSERT INTO restaurantes (rut, nombre, fono, email, direccion_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [d.rut, d.nombre, d.fono, d.email, dir.rows[0].id]
      );
      await cx.query('COMMIT');
      return r.rows[0].id;
    } catch (e) {
      await cx.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cx.release();
    }
  },

  async existe(id) {
    const r = await pool.query('SELECT 1 FROM restaurantes WHERE id = $1 AND eliminado_en IS NULL', [id]);
    return r.rowCount > 0;
  },
});
