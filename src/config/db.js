'use strict';
// Pool de conexiones a PostgreSQL. Todas las consultas del proyecto son parametrizadas ($1, $2...):
// nunca se concatena entrada del usuario en el SQL (ASVS v5 V1, ISO 27034 ONF de validacion).

const { Pool } = require('pg');

function crearPool(cfg) {
  const pool = new Pool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    database: cfg.DB_NAME,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  // Un error en una conexion ociosa no debe tumbar el proceso.
  pool.on('error', () => {});
  return pool;
}

module.exports = { crearPool };
