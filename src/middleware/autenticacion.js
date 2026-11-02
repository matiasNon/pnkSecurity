'use strict';
// Autenticacion y autorizacion. La sesion no se confia ciegamente: se vuelve a comprobar en BD que la cuenta
// siga habilitada y con el mismo rol (ASVS v5 V8, ISO 27001 A.5.15 / A.8.3).

const { logSeguridad } = require('../services/logSeguridad');

function usuarioAutenticado(req) {
  return Number.isInteger(req.session && req.session.uid);
}

// Carga la cuenta vigente en req.usuario. Si fue deshabilitada o eliminada, cierra la sesion.
function cargarUsuario(modeloUsuario) {
  return async (req, res, next) => {
    try {
      res.locals.sesion = null;
      if (!usuarioAutenticado(req)) return next();
      const u = await modeloUsuario.porId(req.session.uid);
      if (!u || !u.habilitado) {
        logSeguridad('SEC', 'sesion_cuenta_inactiva', { uid: req.session.uid }, req);
        req.session.uid = undefined;
        req.session.nombre = undefined;
        return next();
      }
      req.usuario = u;
      res.locals.sesion = { nombre: u.nombre, rol: u.rol };
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

function requiereSesion(req, res, next) {
  if (req.usuario) return next();
  logSeguridad('SEC', 'acceso_sin_sesion', { ruta: req.originalUrl.slice(0, 80) }, req);
  return res.status(403).render('error', { titulo: 'Debe iniciar sesión', codigo: 403 });
}

// Solo rol admin y con restaurante asignado. Siempre se opera sobre req.usuario.restaurante_id:
// jamas sobre un id de restaurante recibido del cliente (evita IDOR entre restaurantes).
function requiereAdmin(req, res, next) {
  if (req.usuario && req.usuario.rol === 'admin' && req.usuario.restaurante_id) return next();
  logSeguridad('SEC', 'acceso_admin_denegado', { uid: req.usuario ? req.usuario.id : '-' }, req);
  return res.status(403).render('error', { titulo: 'Acceso restringido', codigo: 403 });
}

module.exports = { usuarioAutenticado, cargarUsuario, requiereSesion, requiereAdmin };
