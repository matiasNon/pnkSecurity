'use strict';
// Ejecutor de migraciones: aplica en orden los .sql de db/migrations y anota cada uno en schema_migrations.
// Idempotente (una migracion ya aplicada no se repite) y seguro con varias instancias (candado de asesoria).
// Uso: npm run migrate   (o automaticamente al arrancar con AUTO_MIGRATE=1).

const fs = require('node:fs/promises');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'db', 'migrations');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarBd(pool, log) {
  for (let intento = 1; intento <= 30; intento++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      if (intento === 30) throw e;
      log.warn({ intento }, 'Esperando a PostgreSQL...');
      await pausa(1000);
    }
  }
}

async function migrar(pool, log = console) {
  const info = (...a) => (log.info ? log.info(...a) : console.log(...a));
  await esperarBd(pool, log.warn ? log : { warn: console.warn });

  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock(hashtext($1))', ['pnk:migraciones']);
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now())`);
    const aplicadas = new Set((await cliente.query('SELECT nombre FROM schema_migrations')).rows.map((r) => r.nombre));
    const archivos = (await fs.readdir(DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      const sql = await fs.readFile(path.join(DIR, archivo), 'utf8');
      try {
        await cliente.query('BEGIN');
        await cliente.query(sql);
        await cliente.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
        await cliente.query('COMMIT');
        info({ migracion: archivo }, 'Migracion aplicada');
      } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw new Error(`Fallo la migracion ${archivo}: ${e.message}`);
      }
    }
  } finally {
    await cliente.query('SELECT pg_advisory_unlock(hashtext($1))', ['pnk:migraciones']).catch(() => {});
    cliente.release();
  }
}

module.exports = { migrar };

if (require.main === module) {
  const { cargarConfig } = require('../src/config/env');
  const { crearPool } = require('../src/config/db');
  const { iniciarLog } = require('../src/services/logSeguridad');
  const cfg = cargarConfig();
  const pool = crearPool(cfg);
  migrar(pool, iniciarLog(cfg.LOG_LEVEL))
    .then(() => pool.end())
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
