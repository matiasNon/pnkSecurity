'use strict';
// Prepara la BD con el usuario MAESTRO (solo en el arranque de cada instancia del backend, nunca en la app):
//   1) migraciones y cuentas iniciales (idempotente);
//   2) rol de la aplicacion con MINIMO PRIVILEGIO (ASVS v5 V13 / ISO 27001 A.8.2 y A.8.3):
//      LOGIN sin SUPERUSER/CREATEDB/CREATEROLE, sin ser dueno de ninguna tabla (no puede DROP/ALTER/TRUNCATE),
//      solo SELECT/INSERT/UPDATE/DELETE sobre las tablas de la app y uso de sus secuencias; schema_migrations solo lectura.
// La clave del rol llega por variable de entorno desde Secrets Manager y se re-aplica en cada arranque (rotacion).
// Uso: APP_DB_USER=carta_app APP_DB_PASSWORD=... node scripts/preparar-bd.js   (con DB_USER/DB_PASSWORD del maestro)

const { escapeIdentifier, escapeLiteral } = require('pg');
const { migrar } = require('./migrate');
const { sembrarUsuarios } = require('./seed-usuarios');

const NOMBRE_ROL = /^[a-z_][a-z0-9_]{2,30}$/;

async function crearRolApp(pool, usuario, clave, log = console) {
  if (!NOMBRE_ROL.test(usuario)) throw new Error('APP_DB_USER invalido');
  if (String(clave).length < 20) throw new Error('APP_DB_PASSWORD debe tener al menos 20 caracteres');
  const c = await pool.connect();
  try {
    // Varias instancias pueden arrancar a la vez: un candado evita carreras al crear/alterar el rol.
    await c.query('SELECT pg_advisory_lock(hashtext($1))', ['pnk:rol-app']);
    const id = escapeIdentifier(usuario);
    const clavePg = escapeLiteral(clave);
    const existe = (await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [usuario])).rowCount > 0;
    if (existe) {
      // En RDS el usuario maestro no es superusuario: PostgreSQL no le deja cambiar SUPERUSER/REPLICATION de un rol ya
      // creado (aunque sea al mismo valor). Los atributos quedaron fijos al crearlo; aqui solo se renueva la clave.
      await c.query(`ALTER ROLE ${id} WITH LOGIN PASSWORD ${clavePg}`);
      // Defensa: si alguien le hubiera dado privilegios de administracion, no se continua con ese rol.
      const r = (await c.query('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1', [usuario])).rows[0];
      if (r.rolsuper || r.rolcreatedb || r.rolcreaterole) throw new Error(`El rol ${usuario} tiene privilegios de administracion`);
    } else {
      await c.query(`CREATE ROLE ${id} WITH LOGIN PASSWORD ${clavePg} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 40`);
    }

    const bd = escapeIdentifier((await c.query('SELECT current_database() AS d')).rows[0].d);
    await c.query(`GRANT CONNECT ON DATABASE ${bd} TO ${id}`);
    await c.query(`GRANT USAGE ON SCHEMA public TO ${id}`);
    await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${id}`);
    await c.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${id}`);
    await c.query(`REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM ${id}`);
    // Tablas futuras creadas por el maestro (nuevas migraciones) quedan con los mismos permisos.
    await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${id}`);
    await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${id}`);
    (log.info || console.log).call(log, { rol: usuario, nuevo: !existe }, 'Rol de la aplicacion con minimo privilegio listo');
  } finally {
    await c.query('SELECT pg_advisory_unlock(hashtext($1))', ['pnk:rol-app']).catch(() => {});
    c.release();
  }
}

async function prepararBd(pool, cfg, env = process.env, log = console) {
  await migrar(pool, log);
  await sembrarUsuarios(pool, cfg, log);
  if (!env.APP_DB_USER || !env.APP_DB_PASSWORD) {
    (log.warn || console.warn).call(log, 'APP_DB_USER/APP_DB_PASSWORD ausentes: no se crea el rol de la aplicacion');
    return false;
  }
  await crearRolApp(pool, env.APP_DB_USER, env.APP_DB_PASSWORD, log);
  return true;
}

module.exports = { prepararBd, crearRolApp };

if (require.main === module) {
  const { cargarConfig } = require('../src/config/env');
  const { crearPool } = require('../src/config/db');
  const cfg = cargarConfig();
  const pool = crearPool(cfg);
  prepararBd(pool, cfg)
    .then((ok) => pool.end().then(() => process.exit(ok ? 0 : 2)))
    .catch((e) => {
      console.error('preparar-bd:', e.message);
      process.exit(1);
    });
}
