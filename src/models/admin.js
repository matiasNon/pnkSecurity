'use strict';
// Modelo del panel de administracion: CRUD de cartas, categorias y productos.
// REGLA DE SEGURIDAD: cada consulta se acota al restaurante de la sesion del administrador
// (restauranteId viene de req.usuario, jamas del cliente). Asi un admin no puede leer ni modificar datos de otro
// restaurante aunque conozca los ids (IDOR, ASVS v5 V8.2). El borrado es logico (eliminado_en).

module.exports = (pool) => ({
  // ---------- Cartas ----------
  async listarCartas(rid) {
    const r = await pool.query(
      `SELECT id, nombre, orden, visible FROM cartas
        WHERE restaurante_id = $1 AND eliminado_en IS NULL ORDER BY orden NULLS LAST, id`,
      [rid]
    );
    return r.rows;
  },
  async obtenerCarta(rid, id) {
    const r = await pool.query(
      `SELECT id, nombre, orden, visible FROM cartas
        WHERE id = $1 AND restaurante_id = $2 AND eliminado_en IS NULL`,
      [id, rid]
    );
    return r.rows[0] || null;
  },
  async crearCarta(rid, d) {
    const r = await pool.query(
      'INSERT INTO cartas (nombre, orden, visible, restaurante_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [d.nombre, d.orden, d.visible, rid]
    );
    return r.rows[0].id;
  },
  async actualizarCarta(rid, id, d) {
    const r = await pool.query(
      `UPDATE cartas SET nombre = $3, orden = $4, visible = $5, actualizado_en = now()
        WHERE id = $1 AND restaurante_id = $2 AND eliminado_en IS NULL`,
      [id, rid, d.nombre, d.orden, d.visible]
    );
    return r.rowCount > 0;
  },
  async eliminarCarta(rid, id) {
    const r = await pool.query(
      'UPDATE cartas SET eliminado_en = now() WHERE id = $1 AND restaurante_id = $2 AND eliminado_en IS NULL',
      [id, rid]
    );
    return r.rowCount > 0;
  },

  // ---------- Categorias ----------
  async listarCategorias(rid) {
    const r = await pool.query(
      `SELECT k.id, k.nombre, k.orden, k.visible, k.carta_id, c.nombre AS carta
         FROM categorias k JOIN cartas c ON c.id = k.carta_id
        WHERE c.restaurante_id = $1 AND c.eliminado_en IS NULL AND k.eliminado_en IS NULL
        ORDER BY c.orden NULLS LAST, c.id, k.orden NULLS LAST, k.id`,
      [rid]
    );
    return r.rows;
  },
  async obtenerCategoria(rid, id) {
    const r = await pool.query(
      `SELECT k.id, k.nombre, k.orden, k.visible, k.carta_id
         FROM categorias k JOIN cartas c ON c.id = k.carta_id
        WHERE k.id = $1 AND c.restaurante_id = $2 AND k.eliminado_en IS NULL`,
      [id, rid]
    );
    return r.rows[0] || null;
  },
  async crearCategoria(rid, d) {
    // La carta destino debe pertenecer al restaurante del admin.
    if (!(await this.obtenerCarta(rid, d.carta_id))) return null;
    const r = await pool.query(
      'INSERT INTO categorias (nombre, orden, visible, carta_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [d.nombre, d.orden, d.visible, d.carta_id]
    );
    return r.rows[0].id;
  },
  async actualizarCategoria(rid, id, d) {
    if (!(await this.obtenerCarta(rid, d.carta_id))) return false;
    const r = await pool.query(
      `UPDATE categorias k SET nombre = $3, orden = $4, visible = $5, carta_id = $6, actualizado_en = now()
         FROM cartas c
        WHERE k.id = $1 AND c.id = k.carta_id AND c.restaurante_id = $2 AND k.eliminado_en IS NULL`,
      [id, rid, d.nombre, d.orden, d.visible, d.carta_id]
    );
    return r.rowCount > 0;
  },
  async eliminarCategoria(rid, id) {
    const r = await pool.query(
      `UPDATE categorias k SET eliminado_en = now()
         FROM cartas c
        WHERE k.id = $1 AND c.id = k.carta_id AND c.restaurante_id = $2 AND k.eliminado_en IS NULL`,
      [id, rid]
    );
    return r.rowCount > 0;
  },

  // ---------- Productos ----------
  async listarItems(rid) {
    const r = await pool.query(
      `SELECT i.id, i.nombre, i.precio, i.visible, i.destacado, i.foto, k.nombre AS categoria, c.nombre AS carta
         FROM items i
         JOIN categorias k ON k.id = i.categoria_id
         JOIN cartas c ON c.id = k.carta_id
        WHERE c.restaurante_id = $1 AND c.eliminado_en IS NULL AND k.eliminado_en IS NULL AND i.eliminado_en IS NULL
        ORDER BY c.orden NULLS LAST, c.id, k.orden NULLS LAST, k.id, i.orden NULLS LAST, i.id`,
      [rid]
    );
    return r.rows;
  },
  async obtenerItem(rid, id) {
    const r = await pool.query(
      `SELECT i.id, i.nombre, i.descripcion, i.tiempo, i.observaciones, i.precio, i.visible, i.destacado,
              i.puntuacion, i.foto, i.orden, i.categoria_id
         FROM items i
         JOIN categorias k ON k.id = i.categoria_id
         JOIN cartas c ON c.id = k.carta_id
        WHERE i.id = $1 AND c.restaurante_id = $2 AND i.eliminado_en IS NULL`,
      [id, rid]
    );
    return r.rows[0] || null;
  },
  async crearItem(rid, d) {
    if (!(await this.obtenerCategoria(rid, d.categoria_id))) return null;
    const r = await pool.query(
      `INSERT INTO items (nombre, descripcion, tiempo, observaciones, precio, visible, destacado, puntuacion, foto, orden, categoria_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [d.nombre, d.descripcion, d.tiempo, d.observaciones, d.precio, d.visible, d.destacado, d.puntuacion, d.foto, d.orden, d.categoria_id]
    );
    return r.rows[0].id;
  },
  async actualizarItem(rid, id, d) {
    if (!(await this.obtenerCategoria(rid, d.categoria_id))) return false;
    // La foto solo cambia si se subio una nueva (d.foto === undefined la conserva).
    const r = await pool.query(
      `UPDATE items i SET nombre = $3, descripcion = $4, tiempo = $5, observaciones = $6, precio = $7,
              visible = $8, destacado = $9, puntuacion = $10, orden = $11, categoria_id = $12,
              foto = COALESCE($13, i.foto), actualizado_en = now()
         FROM categorias k, cartas c
        WHERE i.id = $1 AND k.id = i.categoria_id AND c.id = k.carta_id
          AND c.restaurante_id = $2 AND i.eliminado_en IS NULL`,
      [id, rid, d.nombre, d.descripcion, d.tiempo, d.observaciones, d.precio, d.visible, d.destacado,
        d.puntuacion, d.orden, d.categoria_id, d.foto === undefined ? null : d.foto]
    );
    return r.rowCount > 0;
  },
  async eliminarItem(rid, id) {
    const r = await pool.query(
      `UPDATE items i SET eliminado_en = now()
         FROM categorias k, cartas c
        WHERE i.id = $1 AND k.id = i.categoria_id AND c.id = k.carta_id
          AND c.restaurante_id = $2 AND i.eliminado_en IS NULL`,
      [id, rid]
    );
    return r.rowCount > 0;
  },
});
