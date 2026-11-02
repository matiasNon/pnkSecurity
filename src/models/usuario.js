'use strict';

module.exports = (pool) => ({
  // Login: email insensible a mayusculas (citext). Solo cuentas habilitadas.
  async porEmail(email) {
    const r = await pool.query(
      'SELECT id, nombre, password_hash, rol, restaurante_id FROM usuarios WHERE email = $1 AND habilitado',
      [email]
    );
    return r.rows[0] || null;
  },

  async porId(id) {
    const r = await pool.query(
      'SELECT id, nombre, rol, restaurante_id, habilitado FROM usuarios WHERE id = $1',
      [id]
    );
    return r.rows[0] || null;
  },
});
