'use strict';
// Carga las cuentas iniciales con la contrasena en hash scrypt (el volcado original las tenia en texto plano).
//  - dev y qa: cuentas de demostracion con claves conocidas (solo para pruebas locales).
//  - prod: las claves salen de ADMIN_PASSWORD / CLIENTE_PASSWORD (12+ caracteres); si faltan NO se crea nada.
// Idempotente: una cuenta que ya existe no se modifica.

const { hashPassword } = require('../src/services/password');

function cuentasIniciales(cfg) {
  if (cfg.esProd) {
    const cuentas = [];
    if (cfg.ADMIN_PASSWORD.length >= 12) {
      cuentas.push({ nombre: 'Administrador', email: 'admin@gmail.com', password: cfg.ADMIN_PASSWORD, rol: 'admin', restaurante_id: 1 });
    }
    if (cfg.CLIENTE_PASSWORD.length >= 12) {
      cuentas.push({ nombre: 'Alondra', email: 'alondra@gmail.com', password: cfg.CLIENTE_PASSWORD, rol: 'cliente', restaurante_id: null });
    }
    return cuentas;
  }
  return [
    { nombre: 'Administrador', email: 'admin@gmail.com', password: cfg.ADMIN_PASSWORD || 'admin01', rol: 'admin', restaurante_id: 1 },
    { nombre: 'Alondra', email: 'alondra@gmail.com', password: cfg.CLIENTE_PASSWORD || 'alondra01', rol: 'cliente', restaurante_id: null },
    // Segundo administrador (otro restaurante): sirve para demostrar y probar que no hay acceso cruzado (IDOR).
    { nombre: 'Admin La Bahía', email: 'admin.bahia@gmail.com', password: 'bahia01', rol: 'admin', restaurante_id: 2 },
  ];
}

async function sembrarUsuarios(pool, cfg, log = console) {
  const info = (...a) => (log.info ? log.info(...a) : console.log(...a));
  const cuentas = cuentasIniciales(cfg);
  if (cfg.esProd && cuentas.length === 0) {
    (log.warn || console.warn).call(log, 'Produccion: ADMIN_PASSWORD/CLIENTE_PASSWORD ausentes o cortas; no se crean cuentas.');
    return;
  }
  for (const c of cuentas) {
    const r = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, restaurante_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
      [c.nombre, c.email, await hashPassword(c.password), c.rol, c.restaurante_id]
    );
    if (r.rowCount > 0) info({ email: c.email, rol: c.rol }, 'Cuenta creada');
  }
}

module.exports = { sembrarUsuarios };

if (require.main === module) {
  const { cargarConfig } = require('../src/config/env');
  const { crearPool } = require('../src/config/db');
  const cfg = cargarConfig();
  const pool = crearPool(cfg);
  sembrarUsuarios(pool, cfg)
    .then(() => pool.end())
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
