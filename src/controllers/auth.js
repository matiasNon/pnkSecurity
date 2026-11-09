'use strict';
// Autenticacion (equivale a procesalogin.php y cerrar_sesion.php): mensajes genericos, hash senuelo,
// limitacion de intentos, demora progresiva y renovacion del id de sesion (anti fijacion).

const { z } = require('zod');
const { verificarPassword, verificarSenuelo } = require('../services/password');
const { reservarLogin, liberarLogin } = require('../services/throttle');
const { logSeguridad, usuarioLog } = require('../services/logSeguridad');
const { regenerar, guardar } = require('../middleware/sesion');
const { nuevoToken } = require('../middleware/csrf');

const esquemaLogin = z.object({
  email: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(128),
});

const MENSAJE_ERROR = 'Usuario o contraseña incorrectos.';
const MENSAJE_BLOQUEO = 'Demasiados intentos fallidos. Intente nuevamente en unos minutos.';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Lo que el frontend necesita saber de la sesion (nunca el hash, el id interno ni el restaurante de otro).
function datosSesion(req, usuario) {
  return {
    usuario: usuario ? { nombre: usuario.nombre, rol: usuario.rol } : null,
    csrf: req.session.csrf,
  };
}

module.exports = (modelos, pool, cfg) => {
  // GET /api/sesion: usuario conectado (o null) y token CSRF de la sesion.
  function sesion(req, res) {
    res.json(datosSesion(req, req.usuario));
  }

  async function login(req, res, next) {
    try {
      const datos = esquemaLogin.safeParse(req.body);
      if (!datos.success) return res.status(401).json({ error: MENSAJE_ERROR, codigo: 'error' });
      const { email, password } = datos.data;

      const cuenta = await modelos.usuario.porEmail(email);
      // La clave de la cuenta es su id real (asi "ADMIN@..." y "admin@..." cuentan contra la misma cuenta).
      const claves = { cuentaId: cuenta ? cuenta.id : null, email, ip: req.ip };
      const control = await reservarLogin(pool, claves);
      if (control.bloqueado) {
        logSeguridad('AUTH', 'login_bloqueado', { usuario: usuarioLog(email) }, req);
        return res.status(429).json({ error: MENSAJE_BLOQUEO, codigo: 'bloqueado' });
      }

      const valido = cuenta ? await verificarPassword(password, cuenta.password_hash) : await verificarSenuelo(password);
      if (!valido) {
        logSeguridad('AUTH', 'login_fallido', { usuario: usuarioLog(email), intentos: control.intentos }, req);
        // Demora incremental (0,3 s por intento fallido, hasta 1,5 s) para encarecer la fuerza bruta.
        await pausa(Math.min(Math.max(control.intentos, 1), 5) * 300);
        return res.status(401).json({ error: MENSAJE_ERROR, codigo: 'error' });
      }

      await liberarLogin(pool, claves);
      logSeguridad('AUTH', 'login_ok', { usuario: usuarioLog(email), uid: cuenta.id, rol: cuenta.rol }, req);

      // Renueva el id de sesion (evita fijacion) y el token CSRF, conservando solo los carritos.
      const carritos = req.session.carritos || {};
      await regenerar(req);
      req.session.uid = cuenta.id;
      req.session.nombre = cuenta.nombre;
      req.session.carritos = carritos;
      req.session.inicio = Date.now();
      req.session.ultimaActividad = Date.now();
      nuevoToken(req);
      await guardar(req);
      return res.json(datosSesion(req, cuenta));
    } catch (e) {
      return next(e);
    }
  }

  async function logout(req, res, next) {
    try {
      logSeguridad('AUTH', 'logout', { uid: req.session.uid ?? '-' }, req);
      await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
      res.clearCookie('PNKSESSID', {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: cfg.cookieSegura,
      });
      return res.json({ ok: true });
    } catch (e) {
      return next(e);
    }
  }

  return { sesion, login, logout };
};
