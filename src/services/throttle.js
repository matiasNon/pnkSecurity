'use strict';
// Limitacion de intentos (anti fuerza bruta y anti spam). ASVS v5 V6.3 / V2.4, ISO 27001 A.8.5.
// Los contadores viven en PostgreSQL (tabla intentos): sirven con varias instancias de la app y
// sobreviven a reinicios. Se guarda solo un hash de la cuenta/IP, nunca el dato en claro.
// La comprobacion y la reserva del intento ocurren en una sola transaccion con un candado de
// asesoria: peticiones en paralelo no pueden superar el limite.

const crypto = require('node:crypto');

const LOGIN_MAX_POR_PAR = 5;       // cuenta + IP
const LOGIN_MAX_POR_CUENTA = 25;   // total por cuenta
const LOGIN_MAX_POR_IP = 20;       // total por IP
const LOGIN_VENTANA_SEG = 900;     // 15 minutos
const COMENTARIO_ESPERA_SEG = 10;  // minimo entre dos comentarios del mismo usuario
const COMENTARIO_MAX_HORA = 30;    // tope por usuario y por hora
const RETENCION_SEG = 3600;

const sha = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

function clavesLogin({ cuentaId, email, ip }) {
  const cuenta = 'c:' + sha(cuentaId != null ? `id:${cuentaId}` : `mail:${String(email).toLowerCase()}`);
  return {
    cuenta,
    par: 'p:' + sha(`${cuenta}|${ip}`),
    ip: 'i:' + sha(String(ip)),
  };
}

async function contar(cliente, tipo, clave, ventanaSeg) {
  const r = await cliente.query(
    `SELECT count(*)::int AS n FROM intentos
      WHERE tipo = $1 AND clave = $2 AND creado_en > now() - make_interval(secs => $3)`,
    [tipo, clave, ventanaSeg]
  );
  return r.rows[0].n;
}

async function enTransaccion(pool, tipo, fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`intentos:${tipo}`]);
    await cliente.query('DELETE FROM intentos WHERE creado_en < now() - make_interval(secs => $1)', [RETENCION_SEG]);
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

// Reserva un intento de login. Devuelve { bloqueado, intentos }.
async function reservarLogin(pool, datos) {
  const k = clavesLogin(datos);
  return enTransaccion(pool, 'login', async (c) => {
    const par = await contar(c, 'login', k.par, LOGIN_VENTANA_SEG);
    const cuenta = await contar(c, 'login', k.cuenta, LOGIN_VENTANA_SEG);
    const ip = await contar(c, 'login', k.ip, LOGIN_VENTANA_SEG);
    if (par >= LOGIN_MAX_POR_PAR || cuenta >= LOGIN_MAX_POR_CUENTA || ip >= LOGIN_MAX_POR_IP) {
      return { bloqueado: true, intentos: 0 };
    }
    for (const clave of [k.par, k.cuenta, k.ip]) {
      await c.query("INSERT INTO intentos (tipo, clave) VALUES ('login', $1)", [clave]);
    }
    return { bloqueado: false, intentos: par + 1 };
  });
}

// Login correcto: libera los contadores de la cuenta y el intento reservado de la IP.
async function liberarLogin(pool, datos) {
  const k = clavesLogin(datos);
  await enTransaccion(pool, 'login', async (c) => {
    await c.query("DELETE FROM intentos WHERE tipo = 'login' AND clave = ANY($1)", [[k.par, k.cuenta]]);
    await c.query(
      `DELETE FROM intentos WHERE id = (
         SELECT id FROM intentos WHERE tipo = 'login' AND clave = $1 ORDER BY id DESC LIMIT 1)`,
      [k.ip]
    );
  });
}

// Reserva un comentario. Devuelve true si esta limitado (debe esperar o supero el tope horario).
async function comentarioLimitado(pool, usuarioId) {
  const clave = 'm:' + sha(`uid:${usuarioId}`);
  return enTransaccion(pool, 'comentario', async (c) => {
    const ultimo = await c.query(
      `SELECT extract(epoch FROM (now() - max(creado_en))) AS seg FROM intentos
        WHERE tipo = 'comentario' AND clave = $1`,
      [clave]
    );
    const seg = ultimo.rows[0].seg;
    if (seg !== null && Number(seg) < COMENTARIO_ESPERA_SEG) return true;
    if ((await contar(c, 'comentario', clave, 3600)) >= COMENTARIO_MAX_HORA) return true;
    await c.query("INSERT INTO intentos (tipo, clave) VALUES ('comentario', $1)", [clave]);
    return false;
  });
}

module.exports = {
  reservarLogin,
  liberarLogin,
  comentarioLimitado,
  LOGIN_MAX_POR_PAR,
  LOGIN_VENTANA_SEG,
};
