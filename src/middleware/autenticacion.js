'use strict';
// Autenticacion y autorizacion. La sesion no se confia ciegamente: se vuelve a comprobar en BD que la cuenta
// siga habilitada y con el mismo rol (ASVS v5 V8, ISO 27001 A.5.15 / A.8.3).

const { logSeguridad } = require('../services/logSeguridad');

function usuarioAutenticado(req) {
  return Number.isInteger(req.session && req.session.uid);
}

// Carga la cuenta vigente en req.usuario. Si fue deshabilitada o eliminada, cierra la sesion.
function cargarUsuario(modeloUsuario, cfg = {}) {
  const superEmail = String(cfg.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  return async (req, res, next) => {
    try {
      if (!usuarioAutenticado(req)) return next();
      const u = await modeloUsuario.porId(req.session.uid);
      if (!u || !u.habilitado) {
        logSeguridad('SEC', 'sesion_cuenta_inactiva', { uid: req.session.uid }, req);
        req.session.uid = undefined;
        req.session.nombre = undefined;
        return next();
      }
      // Super admin: cuenta admin cuyo correo es SUPERADMIN_EMAIL (decision del servidor, nunca del cliente).
      u.superadmin = u.rol === 'admin' && superEmail !== '' && String(u.email || '').toLowerCase() === superEmail;
      req.usuario = u;
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

function requiereSesion(req, res, next) {
  if (req.usuario) return next();
  logSeguridad('SEC', 'acceso_sin_sesion', { ruta: req.originalUrl.slice(0, 80) }, req);
  return res.status(401).json({ error: 'Debe iniciar sesión', codigo: 'sin_sesion' });
}

// Solo rol admin y con restaurante asignado. El admin comun opera siempre sobre SU restaurante (req.usuario.restaurante_id);
// solo el super admin puede cambiar de restaurante, y esa eleccion queda en la sesion del servidor (evita IDOR entre restaurantes).
function requiereAdmin(req, res, next) {
  if (req.usuario && req.usuario.rol === 'admin' && req.usuario.restaurante_id) return next();
  logSeguridad('SEC', 'acceso_admin_denegado', { uid: req.usuario ? req.usuario.id : '-' }, req);
  return res.status(403).json({ error: 'Acceso restringido', codigo: 'prohibido' });
}

// Solo el super admin (gestiona todos los restaurantes).
function requiereSuperAdmin(req, res, next) {
  if (req.usuario && req.usuario.superadmin) return next();
  logSeguridad('SEC', 'acceso_superadmin_denegado', { uid: req.usuario ? req.usuario.id : '-' }, req);
  return res.status(403).json({ error: 'Acceso restringido', codigo: 'prohibido' });
}

// Fija req.rid, el restaurante sobre el que opera el panel: el propio del admin; para el super admin, el que eligio
// (guardado en la sesion) si todavia existe.
function restauranteActivo(modeloRestaurante) {
  return async (req, res, next) => {
    try {
      let rid = req.usuario.restaurante_id;
      const elegido = req.session && req.session.restauranteAdmin;
      if (req.usuario.superadmin && Number.isInteger(elegido) && elegido !== rid && await modeloRestaurante.existe(elegido)) rid = elegido;
      req.rid = rid;
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = { usuarioAutenticado, cargarUsuario, requiereSesion, requiereAdmin, requiereSuperAdmin, restauranteActivo };
