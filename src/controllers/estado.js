'use strict';
// Consola de estado del BACKEND (GET /api): pagina HTML estatica + JSON vivo (GET /api/estado).
// Solo informacion operativa NO sensible: nunca host/usuario/version de la BD, rutas internas ni secretos
// (ASVS v5 V13.4, ISO 27001 A.8.9). Sin sesion ni cookies: no pasa por el router de la API.

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { version } = require('../../package.json');

const DIR_PAGINA = path.join(__dirname, '..', 'estado');

// La pagina carga solo su CSS y su JS propios (sin estilos ni scripts en linea) y consulta /api/estado.
const CSP_PAGINA = [
  "default-src 'none'",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function crearControladorEstado({ cfg, pool }) {
  const inicio = Date.now();
  // El hostname del contenedor distingue las instancias del Auto Scaling Group detras del balanceador.
  const nodo = os.hostname().slice(0, 12);

  async function revisarBd() {
    const t0 = process.hrtime.bigint();
    try {
      // pg_stat_ssl confirma desde el propio servidor que ESTA conexion va cifrada (no solo la configuracion).
      const { rows } = await pool.query(
        `SELECT COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS tls,
                -- Minimo privilegio: el usuario de la app no es superusuario ni puede crear BD/roles ni es rds_superuser.
                (SELECT NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole)
                        AND NOT EXISTS (SELECT 1 FROM pg_roles s WHERE s.rolname = 'rds_superuser'
                                          AND pg_has_role(current_user, s.oid, 'MEMBER'))
                   FROM pg_roles r WHERE r.rolname = current_user) AS "minimoPrivilegio",
                (SELECT count(*)::int FROM cartas WHERE eliminado_en IS NULL) AS cartas,
                (SELECT count(*)::int FROM categorias WHERE eliminado_en IS NULL) AS categorias,
                (SELECT count(*)::int FROM items WHERE eliminado_en IS NULL) AS productos`
      );
      const latenciaMs = Number(process.hrtime.bigint() - t0) / 1e6;
      const { tls, minimoPrivilegio, ...conteos } = rows[0];
      return { ok: true, latenciaMs: Math.round(latenciaMs * 10) / 10, tls, minimoPrivilegio, conteos };
    } catch {
      return { ok: false, latenciaMs: null, tls: null, minimoPrivilegio: null, conteos: null };
    }
  }

  async function revisarAlmacenamiento() {
    try {
      const dir = path.resolve(cfg.UPLOAD_DIR);
      await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
      const archivos = (await fs.readdir(dir)).filter((n) => !n.startsWith('.')).length;
      // EFS_TLS lo fija el arranque de la instancia segun como quedo montado el volumen (1 = NFS dentro de TLS).
      return { ok: true, archivos, tlsTransito: process.env.EFS_TLS === '1' ? true : process.env.EFS_TLS === '0' ? false : null };
    } catch {
      return { ok: false, archivos: null, tlsTransito: null };
    }
  }

  async function estado(req, res) {
    const [bd, almacenamiento] = await Promise.all([revisarBd(), revisarAlmacenamiento()]);
    const ok = bd.ok && almacenamiento.ok;
    res
      .status(ok ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        estado: ok ? 'ok' : 'degradado',
        nodo,
        version,
        ambiente: cfg.esProd ? 'produccion' : 'desarrollo',
        activoSegundos: Math.floor((Date.now() - inicio) / 1000),
        hora: new Date().toISOString(),
        baseDatos: bd,
        almacenamiento,
      });
  }

  function pagina(req, res) {
    res.set('Content-Security-Policy', CSP_PAGINA);
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIR_PAGINA, 'index.html'));
  }

  // CSS y JS de la pagina (necesitan su propia CSP: la del backend es default-src 'none').
  function recursos(req, res, next) {
    res.set('Content-Security-Policy', CSP_PAGINA);
    next();
  }

  return { estado, pagina, recursos, DIR_PAGINA };
}

module.exports = crearControladorEstado;
