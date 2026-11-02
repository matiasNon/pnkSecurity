'use strict';
// Cabeceras HTTP de seguridad y HTTPS (ASVS v5 V3 / V12 / V13, ISO 27001 A.8.9 y A.8.24).
// Mismas politicas que enviar_cabeceras_seguridad() de la version PHP: CSP sin scripts ni estilos en linea.

const helmet = require('helmet');
const { logSeguridad } = require('../services/logSeguridad');

function cabecerasSeguridad() {
  const csp = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // HSTS solo cuando la peticion llego por HTTPS (se agrega abajo); helmet lo enviaria tambien por HTTP.
    strictTransportSecurity: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    xPoweredBy: false,
  });

  return [
    csp,
    (req, res, next) => {
      res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
      if (req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
      next();
    },
  ];
}

// Paginas dinamicas: nunca se guardan en cache (contienen token CSRF y datos de sesion).
function sinCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

// Con FORCE_HTTPS=1, toda peticion que no llegue por HTTPS se redirige (301) a https://PUBLIC_HOST.
// El destino sale de la configuracion y nunca de la cabecera Host del cliente (evita redireccion abierta).
function forzarHttps(cfg) {
  return (req, res, next) => {
    if (!cfg.forzarHttps || req.secure) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Un POST por HTTP ya viajo en claro y una redireccion no lo repararia: se rechaza.
      logSeguridad('SEC', 'https_requerido_rechazado', { metodo: req.method }, req);
      return res.status(403).type('text/plain').send('Se requiere HTTPS');
    }
    let ruta = req.originalUrl;
    if (!ruta.startsWith('/') || ruta.startsWith('//') || /[\r\n]/.test(ruta)) ruta = '/';
    return res.redirect(301, `https://${cfg.PUBLIC_HOST}${ruta}`);
  };
}

module.exports = { cabecerasSeguridad, sinCache, forzarHttps };
