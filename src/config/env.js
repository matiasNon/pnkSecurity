'use strict';
// Lectura y validacion de la configuracion. Todo viene de variables de entorno (nada de secretos en el codigo).
// En produccion la aplicacion se niega a arrancar con secretos debiles o ausentes (ASVS v5 V13, ISO 27001 A.8.9).

const { z } = require('zod');

const esquema = z.object({
  APP_ENV: z.enum(['dev', 'qa', 'prod']).default('dev'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1).default('pnk_carta'),
  DB_USER: z.string().min(1).default('pnk_app'),
  DB_PASSWORD: z.string().default(''),
  // Conexion cifrada a la BD (obligatoria con Amazon RDS). DB_SSL_CA = ruta al certificado de la CA
  // (en AWS: global-bundle.pem de RDS); con el se verifica la identidad del servidor (ASVS v5 V12.3).
  DB_SSL: z.enum(['0', '1']).default('0'),
  DB_SSL_CA: z.string().default(''),

  SESSION_SECRET: z.string().default(''),
  // Solo se confia en X-Forwarded-* si se declara explicitamente (de lo contrario cualquiera podria falsificarlas).
  TRUST_PROXY: z.enum(['0', '1']).default('0'),
  FORCE_HTTPS: z.enum(['0', '1']).default('0'),
  PUBLIC_HOST: z.string().default(''),

  UPLOAD_DIR: z.string().default('uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(2 * 1024 * 1024),

  // Credenciales iniciales de scripts/seed-usuarios.js (en prod son obligatorias y no hay valores por defecto).
  ADMIN_PASSWORD: z.string().default(''),
  CLIENTE_PASSWORD: z.string().default(''),
});

function cargarConfig(entorno = process.env) {
  const r = esquema.safeParse(entorno);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuracion invalida: ${detalle}`);
  }
  const cfg = r.data;
  const prod = cfg.APP_ENV === 'prod';

  if (prod) {
    const debiles = ['', 'cambiar', 'changeme', 'password', 'postgres', 'pnk_app'];
    if (cfg.SESSION_SECRET.length < 32) {
      throw new Error('Configuracion invalida: en produccion SESSION_SECRET debe tener al menos 32 caracteres.');
    }
    if (cfg.DB_PASSWORD.length < 12 || debiles.includes(cfg.DB_PASSWORD.toLowerCase())) {
      throw new Error('Configuracion invalida: en produccion DB_PASSWORD debe ser fuerte (12+ caracteres).');
    }
    if (cfg.DB_SSL === '1' && cfg.DB_SSL_CA === '') {
      throw new Error('Configuracion invalida: en produccion DB_SSL=1 requiere DB_SSL_CA (certificado de la CA de la BD).');
    }
    if (cfg.FORCE_HTTPS === '1' && !/^[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/.test(cfg.PUBLIC_HOST)) {
      throw new Error('Configuracion invalida: FORCE_HTTPS=1 requiere PUBLIC_HOST con un nombre de host valido.');
    }
  } else if (cfg.SESSION_SECRET === '') {
    // dev y qa: secreto de desarrollo estable, jamas valido en produccion (el chequeo anterior lo impide).
    cfg.SESSION_SECRET = 'secreto-solo-para-desarrollo-y-qa-no-usar-en-prod';
  }

  return Object.freeze({
    ...cfg,
    esProd: prod,
    esQa: cfg.APP_ENV === 'qa',
    esDev: cfg.APP_ENV === 'dev',
    // La cookie de sesion solo viaja por HTTPS en produccion; en dev/qa se sirve por HTTP.
    cookieSegura: prod,
    confiarProxy: cfg.TRUST_PROXY === '1',
    bdSsl: cfg.DB_SSL === '1',
    forzarHttps: cfg.FORCE_HTTPS === '1',
  });
}

module.exports = { cargarConfig };
