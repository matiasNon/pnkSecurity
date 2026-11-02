'use strict';
// Fabrica de la aplicacion Express (MVC). Separada de server.js para poder probarla con Supertest.

const path = require('node:path');
const express = require('express');

const { crearModelos } = require('./models');
const { monedaChilena } = require('./utils/validar');
const { cabecerasSeguridad, sinCache, forzarHttps } = require('./middleware/seguridad');
const { middlewareSesion } = require('./middleware/sesion');
const { asegurarToken } = require('./middleware/csrf');
const { cargarUsuario } = require('./middleware/autenticacion');
const { crearSubidas } = require('./middleware/subidas');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');
const crearControladorCarta = require('./controllers/carta');
const crearControladorAuth = require('./controllers/auth');
const crearControladorComentario = require('./controllers/comentario');
const crearControladorAdmin = require('./controllers/admin');
const crearRutasPublicas = require('./routes/publicas');
const crearRutasAdmin = require('./routes/admin');

function crearApp({ cfg, pool }) {
  const app = express();
  const modelos = crearModelos(pool);
  const subidas = crearSubidas(cfg);

  app.disable('x-powered-by');
  app.disable('etag');
  // Solo se confia en X-Forwarded-* cuando el despliegue lo declara (un salto: nginx).
  app.set('trust proxy', cfg.confiarProxy ? 1 : false);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.locals.moneda = monedaChilena;

  app.use(cabecerasSeguridad());

  // Salud para Docker y la pipeline: sin sesion y sin redireccion a HTTPS.
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.set('Cache-Control', 'no-store').json({ estado: 'ok' });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ estado: 'error' });
    }
  });

  app.use(forzarHttps(cfg));

  // Archivos estaticos: primero lo subido por el panel (volumen aparte), luego public/.
  const opcionesEstaticas = { index: false, dotfiles: 'ignore', maxAge: '1h' };
  app.use('/imagenes', express.static(path.resolve(cfg.UPLOAD_DIR), opcionesEstaticas));
  app.use(express.static(path.join(__dirname, '..', 'public'), opcionesEstaticas));

  // Cuerpos pequenos: la carta solo recibe formularios cortos (los archivos los procesa multer en el panel).
  app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 50 }));

  app.use(sinCache);
  app.use(...middlewareSesion(cfg, pool));
  app.use(asegurarToken);
  app.use(cargarUsuario(modelos.usuario));

  const auth = crearControladorAuth(modelos, pool, cfg);
  app.use(
    crearRutasPublicas({
      carta: crearControladorCarta(modelos),
      comentario: crearControladorComentario(modelos, pool),
      auth,
    })
  );
  app.use('/admin', crearRutasAdmin(crearControladorAdmin(modelos, subidas), subidas));

  app.use(noEncontrado);
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
