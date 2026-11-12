'use strict';
// Datos de la propia cuenta (derechos del titular). Consultas parametrizadas; la supresion es transaccional.

module.exports = (pool) => ({
  async exportar(uid) {
    const u = await pool.query(
      'SELECT nombre, email::text AS email, rol, creado_en FROM usuarios WHERE id = $1',
      [uid]
    );
    const c = await pool.query(
      `SELECT r.nombre AS restaurante, c.comentario, c.creado_en
         FROM comentarios c JOIN restaurantes r ON r.id = c.restaurante_id
        WHERE c.usuario_id = $1
        ORDER BY c.id`,
      [uid]
    );
    return { titular: u.rows[0] || null, comentarios: c.rows };
  },

  async hashPassword(uid) {
    const r = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1 AND habilitado', [uid]);
    return r.rows[0] ? r.rows[0].password_hash : null;
  },

  async rectificarNombre(uid, nombre) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('UPDATE usuarios SET nombre = $2 WHERE id = $1', [uid, nombre]);
      await cliente.query('UPDATE comentarios SET usuario = $2 WHERE usuario_id = $1', [uid, nombre]);
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  },

  // Anonimiza los comentarios (sin nombre ni vinculo) y borra la cuenta. Devuelve cuantos comentarios se anonimizaron.
  async suprimir(uid, nombreAnonimo) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const c = await cliente.query(
        'UPDATE comentarios SET usuario = $2, usuario_id = NULL WHERE usuario_id = $1',
        [uid, nombreAnonimo]
      );
      await cliente.query('DELETE FROM usuarios WHERE id = $1', [uid]);
      await cliente.query('COMMIT');
      return c.rowCount;
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  },
});
