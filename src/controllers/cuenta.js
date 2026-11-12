'use strict';
// Derechos del titular de datos personales sobre su propia cuenta (Ley 19.628 arts. 12 y ss.; preparacion para la
// Ley 21.719: acceso, rectificacion, supresion y portabilidad). Siempre sobre req.usuario (sesion verificada en BD),
// nunca sobre un id enviado por el cliente (ASVS v5 V8). Escrituras: solo JSON + token CSRF (en las rutas).

const { z } = require('zod');
const { verificarPassword } = require('../services/password');
const { reservarLogin, liberarLogin } = require('../services/throttle');
const { logSeguridad } = require('../services/logSeguridad');

const { linea } = require('../utils/formularios');

const esquemaNombre = z.object({
  nombre: linea(100),
}).strict();
const esquemaSupresion = z.object({
  password: z.string().min(1).max(128),
  confirmar: z.literal('ELIMINAR'),
}).strict();

const NOMBRE_ANONIMO = 'Usuario eliminado';

module.exports = (modelos, pool, cfg) => {
  // GET /api/mi-cuenta/datos  (acceso y portabilidad: JSON estructurado y legible por maquina)
  async function exportar(req, res, next) {
    try {
      const datos = await modelos.cuenta.exportar(req.usuario.id);
      logSeguridad('PRIV', 'datos_exportados', { uid: req.usuario.id }, req);
      if (req.query.descargar === '1') {
        res.set('Content-Disposition', 'attachment; filename="mis-datos-carta-digital.json"');
      }
      return res.json({
        generado_en: new Date().toISOString(),
        responsable: 'Carta Digital PNK',
        finalidades: [
          'Autenticación y gestión de la cuenta',
          'Publicación de comentarios en la carta del restaurante (con el nombre indicado)',
          'Seguridad del servicio (prevención de abuso y registro de eventos)',
        ],
        ...datos,
      });
    } catch (e) {
      return next(e);
    }
  }

  // PATCH /api/mi-cuenta  { nombre }  (rectificacion; tambien corrige el nombre mostrado en sus comentarios)
  async function rectificar(req, res, next) {
    try {
      const r = esquemaNombre.safeParse(req.body);
      if (!r.success) return res.status(400).json({ error: 'Nombre inválido (1 a 100 caracteres)', codigo: 'invalida' });
      await modelos.cuenta.rectificarNombre(req.usuario.id, r.data.nombre);
      req.session.nombre = r.data.nombre;
      logSeguridad('PRIV', 'datos_rectificados', { uid: req.usuario.id, campo: 'nombre' }, req);
      return res.json({ ok: true, usuario: { nombre: r.data.nombre, rol: req.usuario.rol } });
    } catch (e) {
      return next(e);
    }
  }

  // DELETE /api/mi-cuenta  { password, confirmar: "ELIMINAR" }
  // Supresion: re-autenticacion obligatoria (ASVS v5 V6/V7: operacion sensible), limite de intentos compartido con el
  // login, comentarios anonimizados (el texto publicado queda sin vinculo con la persona) y cuenta borrada.
  async function suprimir(req, res, next) {
    try {
      const r = esquemaSupresion.safeParse(req.body);
      if (!r.success) {
        return res.status(400).json({ error: 'Debe escribir ELIMINAR y su contraseña', codigo: 'invalida' });
      }
      if (req.usuario.rol === 'admin') {
        logSeguridad('PRIV', 'supresion_admin_rechazada', { uid: req.usuario.id }, req);
        return res.status(409).json({
          error: 'Una cuenta de administrador no se elimina desde aquí: solicítelo al responsable del servicio.',
          codigo: 'admin',
        });
      }
      const claves = { cuentaId: req.usuario.id, email: '', ip: req.ip };
      const control = await reservarLogin(pool, claves);
      if (control.bloqueado) return res.status(429).json({ error: 'Demasiados intentos. Intente más tarde.', codigo: 'bloqueado' });
      const hash = await modelos.cuenta.hashPassword(req.usuario.id);
      if (!hash || !(await verificarPassword(r.data.password, hash))) {
        logSeguridad('PRIV', 'supresion_clave_incorrecta', { uid: req.usuario.id }, req);
        return res.status(401).json({ error: 'Contraseña incorrecta.', codigo: 'clave' });
      }
      await liberarLogin(pool, claves);

      const uid = req.usuario.id;
      const anonimizados = await modelos.cuenta.suprimir(uid, NOMBRE_ANONIMO);
      logSeguridad('PRIV', 'cuenta_suprimida', { uid, comentariosAnonimizados: anonimizados }, req);
      await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
      res.clearCookie('PNKSESSID', { path: '/', httpOnly: true, sameSite: 'strict', secure: cfg.cookieSegura });
      return res.json({ ok: true, comentariosAnonimizados: anonimizados });
    } catch (e) {
      return next(e);
    }
  }

  return { exportar, rectificar, suprimir };
};
