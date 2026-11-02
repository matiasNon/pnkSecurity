'use strict';
// Autenticacion (equivale a procesalogin.php y cerrar_sesion.php): mensajes genericos, hash senuelo,
// limitacion de intentos, demora progresiva y renovacion del id de sesion (anti fijacion).

const { z } = require('zod');
const { entero } = require('../utils/validar');
const { verificarPassword, verificarSenuelo } = require('../services/password');
const { reservarLogin, liberarLogin } = require('../services/throttle');
const { logSeguridad, usuarioLog } = require('../services/logSeguridad');
const { regenerar, guardar } = require('../middleware/sesion');

const esquemaLogin = z.object({
  frmusuario: z.string().trim().min(1).max(255),
  frmpassword: z.string().min(1).max(128),
});

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = (modelos, pool, cfg) => {
  const destinoCarta = (id, extra = '') => (id ? `/restaurantes/${id}${extra}` : '/');
  const conParam = (id, param) => destinoCarta(id, `?login=${param}`);

  async function login(req, res, next) {
    try {
      const id = entero(req.body && req.body.id);
      if (id === null) return res.status(400).render('error', { titulo: 'Solicitud inválida', codigo: 400 });

      const datos = esquemaLogin.safeParse(req.body);
      if (!datos.success) return res.redirect(303, conParam(id, 'error'));
      const email = datos.data.frmusuario;
      const password = datos.data.frmpassword;

      const cuenta = await modelos.usuario.porEmail(email);
      // La clave de la cuenta es su id real (asi "ADMIN@..." y "admin@..." cuentan contra la misma cuenta).
      const claves = { cuentaId: cuenta ? cuenta.id : null, email, ip: req.ip };
      const control = await reservarLogin(pool, claves);
      if (control.bloqueado) {
        logSeguridad('AUTH', 'login_bloqueado', { usuario: usuarioLog(email) }, req);
        return res.redirect(303, conParam(id, 'bloqueado'));
      }

      const valido = cuenta ? await verificarPassword(password, cuenta.password_hash) : await verificarSenuelo(password);
      if (!valido) {
        logSeguridad('AUTH', 'login_fallido', { usuario: usuarioLog(email), intentos: control.intentos }, req);
        // Demora incremental (0,3 s por intento fallido, hasta 1,5 s) para encarecer la fuerza bruta.
        await pausa(Math.min(Math.max(control.intentos, 1), 5) * 300);
        return res.redirect(303, conParam(id, 'error'));
      }

      await liberarLogin(pool, claves);
      logSeguridad('AUTH', 'login_ok', { usuario: usuarioLog(email), uid: cuenta.id, rol: cuenta.rol }, req);

      // Renueva el id de sesion (evita fijacion) conservando solo los carritos.
      const carritos = req.session.carritos || {};
      await regenerar(req);
      req.session.uid = cuenta.id;
      req.session.nombre = cuenta.nombre;
      req.session.carritos = carritos;
      req.session.inicio = Date.now();
      req.session.ultimaActividad = Date.now();
      await guardar(req);
      return res.redirect(303, destinoCarta(id));
    } catch (e) {
      return next(e);
    }
  }

  async function logout(req, res, next) {
    try {
      const id = entero(req.body && req.body.id);
      logSeguridad('AUTH', 'logout', { uid: req.session.uid ?? '-' }, req);
      await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
      res.clearCookie('PNKSESSID', {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: cfg.cookieSegura,
      });
      return res.redirect(303, destinoCarta(id));
    } catch (e) {
      return next(e);
    }
  }

  return { login, logout, destinoCarta };
};
