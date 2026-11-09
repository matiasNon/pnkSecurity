'use strict';
// Pool de conexiones a PostgreSQL. Todas las consultas del proyecto son parametrizadas ($1, $2...):
// nunca se concatena entrada del usuario en el SQL (ASVS v5 V1, ISO 27034 ONF de validacion).
// Con DB_SSL=1 (Amazon RDS) la conexion va cifrada con TLS y se verifica el certificado del servidor:
// nunca se usa rejectUnauthorized:false (ASVS v5 V12.3.2, ISO 27001 A.8.24).

const fs = require('node:fs');
const { Pool } = require('pg');

function opcionesSsl(cfg, leer = fs.readFileSync) {
  if (!cfg.bdSsl) return false;
  const ssl = { rejectUnauthorized: true };
  if (cfg.DB_SSL_CA) ssl.ca = leer(cfg.DB_SSL_CA, 'utf8');
  return ssl;
}

function crearPool(cfg) {
  const pool = new Pool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    database: cfg.DB_NAME,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    ssl: opcionesSsl(cfg),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  // Un error en una conexion ociosa no debe tumbar el proceso.
  pool.on('error', () => {});
  return pool;
}

module.exports = { crearPool, opcionesSsl };
