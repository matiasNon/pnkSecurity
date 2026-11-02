'use strict';
// Controlador de la carta publica y el carrito (equivale a index.php, mostrar_carrito.php y carrito.php).

const { rutaFoto, monedaChilena, entero } = require('../utils/validar');
const { nl2br } = require('../utils/html');
const { logSeguridad } = require('../services/logSeguridad');

const CARRITO_MAX_ITEMS = 50;

const MENSAJES_LOGIN = {
  error: 'Usuario o contraseña incorrectos.',
  bloqueado: 'Demasiados intentos fallidos. Intente nuevamente en unos minutos.',
  csrf: 'La solicitud expiró. Intente nuevamente.',
};

const MENSAJES_COMENTARIO = {
  ok: ['success', 'Comentario publicado.'],
  csrf: ['warning', 'Su sesión expiró. Inicie sesión e intente comentar nuevamente.'],
  invalido: ['danger', 'El comentario no puede estar vacío ni superar 1000 caracteres.'],
  espera: ['warning', 'Espere unos segundos antes de publicar otro comentario.'],
  error: ['danger', 'No se pudo publicar el comentario. Intente nuevamente.'],
};

// El carrito vive en la sesion y es POR RESTAURANTE (la version PHP mezclaba restaurantes distintos).
function leerCarrito(req, rid) {
  const todos = req.session.carritos;
  return todos && Array.isArray(todos[rid]) ? todos[rid] : [];
}

function guardarCarrito(req, rid, carrito) {
  req.session.carritos = { ...(req.session.carritos || {}), [rid]: carrito };
}

module.exports = (modelos) => {
  // Valida :id y carga el restaurante. Un id invalido o inexistente responde 404 sin revelar nada mas.
  async function cargarRestaurante(req, res, next) {
    try {
      const rid = entero(req.params.id);
      const restaurante = rid === null ? null : await modelos.restaurante.obtener(rid);
      if (!restaurante) {
        return res.status(404).render('error', { titulo: 'Restaurante no encontrado', codigo: 404 });
      }
      req.rid = rid;
      req.restaurante = restaurante;
      res.locals.rid = rid;
      res.locals.restaurante = restaurante;
      return next();
    } catch (e) {
      return next(e);
    }
  }

  const ayudasVista = (rid) => ({
    foto: (f) => rutaFoto(rid, f),
    moneda: monedaChilena,
    nl2br,
  });

  async function mostrarCarta(req, res, next) {
    try {
      const rid = req.rid;
      const [destacados, cartas, comentarios] = await Promise.all([
        modelos.carta.destacados(rid),
        modelos.carta.arbolPublico(rid),
        modelos.comentario.ultimos(rid),
      ]);
      const login = typeof req.query.login === 'string' ? req.query.login : '';
      const c = typeof req.query.c === 'string' ? req.query.c : '';
      res.render('carta', {
        titulo: req.restaurante.nombre,
        destacados,
        cartas,
        comentarios,
        mensajeLogin: Object.hasOwn(MENSAJES_LOGIN, login) ? MENSAJES_LOGIN[login] : null,
        mensajeComentario: Object.hasOwn(MENSAJES_COMENTARIO, c) ? MENSAJES_COMENTARIO[c] : null,
        ...ayudasVista(rid),
      });
    } catch (e) {
      next(e);
    }
  }

  function mostrarCarrito(req, res) {
    res.render('carrito', {
      titulo: req.restaurante.nombre,
      carrito: leerCarrito(req, req.rid),
      ...ayudasVista(req.rid),
    });
  }

  async function agregarItem(req, res, next) {
    try {
      const rid = req.rid;
      const itemId = entero(req.body && req.body.iditems);
      if (itemId === null) return res.status(400).json({ error: 'Solicitud inválida' });
      const carrito = leerCarrito(req, rid);
      if (carrito.length >= CARRITO_MAX_ITEMS) {
        return res.status(409).json({ error: 'El carrito alcanzó el máximo de productos' });
      }
      const item = await modelos.carta.itemParaCarrito(itemId, rid);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado' });
      const posicion = carrito.reduce((m, p) => Math.max(m, p.posicion), 0) + 1;
      guardarCarrito(req, rid, [
        ...carrito,
        { posicion, id: item.id, nombre: String(item.nombre), precio: Number(item.precio) || 0 },
      ]);
      return res.json({ ok: true });
    } catch (e) {
      return next(e);
    }
  }

  function eliminarItem(req, res) {
    const pos = entero(req.params.pos);
    if (pos === null) return res.status(400).json({ error: 'Solicitud inválida' });
    guardarCarrito(req, req.rid, leerCarrito(req, req.rid).filter((p) => p.posicion !== pos));
    return res.json({ ok: true });
  }

  function vaciarCarrito(req, res) {
    guardarCarrito(req, req.rid, []);
    return res.json({ ok: true });
  }

  // Solo se acepta application/x-www-form-urlencoded en el alta (igual que carrito.php: 415 si no).
  function soloFormulario(req, res, next) {
    if (!req.is('application/x-www-form-urlencoded')) {
      logSeguridad('SEC', 'carrito_tipo_contenido_rechazado', {}, req);
      return res.status(415).json({ error: 'Tipo de contenido no soportado' });
    }
    return next();
  }

  return {
    cargarRestaurante,
    mostrarCarta,
    mostrarCarrito,
    agregarItem,
    eliminarItem,
    vaciarCarrito,
    soloFormulario,
    CARRITO_MAX_ITEMS,
  };
};
