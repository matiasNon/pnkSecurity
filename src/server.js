'use strict';
// Punto de entrada: valida la configuracion, prepara la BD y levanta el servidor HTTP.

const { cargarConfig } = require('./config/env');
const { crearPool } = require('./config/db');
const { iniciarLog, logError } = require('./services/logSeguridad');
const { crearApp } = require('./app');
const { migrar } = require('../scripts/migrate');
const { sembrarUsuarios } = require('../scripts/seed-usuarios');

async function main() {
  const cfg = cargarConfig();
  const log = iniciarLog(cfg.LOG_LEVEL);
  const pool = crearPool(cfg);

  // En los ambientes con Docker la BD aplica las migraciones al arrancar (idempotente).
  if (process.env.AUTO_MIGRATE === '1') {
    await migrar(pool, log);
    await sembrarUsuarios(pool, cfg, log);
  }

  const app = crearApp({ cfg, pool });
  const servidor = app.listen(cfg.PORT, () => {
    log.info({ puerto: cfg.PORT, ambiente: cfg.APP_ENV }, 'Servidor iniciado');
  });

  const cerrar = (senal) => {
    log.info({ senal }, 'Cerrando servidor');
    servidor.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => cerrar('SIGTERM'));
  process.on('SIGINT', () => cerrar('SIGINT'));
}

main().catch((e) => {
  logError('No se pudo iniciar la aplicacion', e);
  process.exit(1);
});
