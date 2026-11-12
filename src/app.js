'use strict';
// Fabrica del BACKEND (API REST JSON). Separada de server.js para poder probarla con Supertest.
// El frontend (paginas HTML/CSS/JS) es otro servicio: frontend/ (nginx). El balanceador envia /api/* y /uploads/*
// a este backend y todo lo demas al frontend, asi ambos comparten origen (cookie SameSite=Strict, sin CORS).

const path = require('node:path');
const express = require('express');

const { crearModelos } = require('./models');
const { cabecerasSeguridad, sinCache, forzarHttps } = require('./middleware/seguridad');
const { ipRealCloudflare } = require('./middleware/cloudflare');
const { middlewareSesion } = require('./middleware/sesion');
const { asegurarToken } = require('./middleware/csrf');
const { cargarUsuario } = require('./middleware/autenticacion');
const { crearSubidas } = require('./middleware/subidas');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');
const crearControladorCarta = require('./controllers/carta');
const crearControladorAuth = require('./controllers/auth');
const crearControladorComentario = require('./controllers/comentario');
const crearControladorAdmin = require('./controllers/admin');
const crearControladorEstado = require('./controllers/estado');
const crearControladorCuenta = require('./controllers/cuenta');
const { rutasPublicas, rutasAdmin } = require('./routes/api');

function crearApp({ cfg, pool }) {
  const app = express();
  const modelos = crearModelos(pool);
  const subidas = crearSubidas(cfg);

  app.disable('x-powered-by');
  app.disable('etag');
  // Solo se confia en X-Forwarded-* cuando el despliegue lo declara (un salto: nginx o el ALB).
  app.set('trust proxy', cfg.confiarProxy ? 1 : false);

  app.use(ipRealCloudflare(cfg));
  app.use(cabecerasSeguridad());

  // Salud para Docker, el health check del balanceador y la pipeline: sin sesion y sin redireccion a HTTPS.
  const salud = async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.set('Cache-Control', 'no-store').json({ estado: 'ok', servicio: 'backend' });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ estado: 'error', servicio: 'backend' });
    }
  };
  app.get('/health', salud);
  app.get('/api/health', salud);

  app.use(forzarHttps(cfg));

  // Consola de estado del backend (HTML + JSON vivo), sin sesion: va antes del router de la API.
  const consola = crearControladorEstado({ cfg, pool });
  app.get(['/api', '/api/'], consola.pagina);
  app.get('/api/estado', consola.estado);
  app.use('/api/_consola', consola.recursos,
    express.static(consola.DIR_PAGINA, { index: false, dotfiles: 'ignore', maxAge: '10m' }));

  // Fotos subidas por el panel (volumen aparte: EFS en AWS). Solo imagenes con nombre aleatorio.
  app.use('/uploads', express.static(path.resolve(cfg.UPLOAD_DIR), { index: false, dotfiles: 'ignore', maxAge: '1h' }));

  const api = express.Router();
  // Cuerpos pequenos: la API solo recibe JSON corto (los archivos los procesa multer en el panel).
  api.use(express.json({ limit: '20kb', strict: true }));
  api.use(sinCache);
  api.use(...middlewareSesion(cfg, pool));
  api.use(asegurarToken);
  api.use(cargarUsuario(modelos.usuario));
  api.use(
    rutasPublicas({
      carta: crearControladorCarta(modelos),
      comentario: crearControladorComentario(modelos, pool),
      auth: crearControladorAuth(modelos, pool, cfg),
      cuenta: crearControladorCuenta(modelos, pool, cfg),
    })
  );
  api.use('/admin', rutasAdmin(crearControladorAdmin(modelos, subidas), subidas));
  app.use('/api', api);

  app.use(noEncontrado);
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
