'use strict';
// Prepara la BD de pruebas una sola vez: aplica las migraciones y crea las cuentas de demostracion.
// En el ambiente QA (Docker) la BD es efimera; en local conviene apuntar a una BD distinta de la de desarrollo.

const { cargarConfig } = require('../src/config/env');
const { crearPool } = require('../src/config/db');
const { migrar } = require('../scripts/migrate');
const { sembrarUsuarios } = require('../scripts/seed-usuarios');
const { entornoPrueba } = require('./ayuda');

module.exports = async () => {
  const cfg = cargarConfig(entornoPrueba());
  const pool = crearPool(cfg);
  const silencio = { info() {}, warn() {} };
  await migrar(pool, silencio);
  await sembrarUsuarios(pool, cfg, silencio);
  await pool.end();
};
