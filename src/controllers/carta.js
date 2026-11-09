'use strict';
// API de la carta publica y el carrito (equivale a index.php, mostrar_carrito.php y carrito.php).
// Solo entrega datos (JSON): el frontend arma la pagina y escapa todo lo que muestra (textContent, nunca innerHTML).

const { rutaFoto, entero } = require('../utils/validar');
const { logSeguridad } = require('../services/logSeguridad');

const CARRITO_MAX_ITEMS = 50;

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
        return res.status(404).json({ error: 'Restaurante no encontrado', codigo: 'no_encontrado' });
      }
      req.rid = rid;
      req.restaurante = restaurante;
      return next();
    } catch (e) {
      return next(e);
    }
  }

  // Solo los campos publicos, con la URL de la foto ya validada (o null).
  const restaurantePublico = (r) => ({
    id: r.id,
    nombre: r.nombre,
    calle: r.calle,
    numero: r.numero,
    comuna: r.comuna,
    fono: r.fono || null,
    email: r.email || null,
    foto: rutaFoto(r.id, r.foto),
  });

  const producto = (rid, p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion || '',
    observaciones: p.observaciones || '',
    tiempo: p.tiempo || '',
    puntuacion: Math.max(0, Math.min(5, Number(p.puntuacion) || 0)),
    precio: Number(p.precio) || 0,
    foto: rutaFoto(rid, p.foto),
  });

  async function mostrarCarta(req, res, next) {
    try {
      const rid = req.rid;
      const [destacados, cartas, comentarios] = await Promise.all([
        modelos.carta.destacados(rid),
        modelos.carta.arbolPublico(rid),
        modelos.comentario.ultimos(rid),
      ]);
      res.json({
        restaurante: restaurantePublico(req.restaurante),
        destacados: destacados.map((d) => producto(rid, d)),
        cartas: cartas.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          foto: rutaFoto(rid, c.foto),
          categorias: c.categorias.map((k) => ({
            id: k.id,
            nombre: k.nombre,
            items: k.items.map((i) => producto(rid, i)),
          })),
        })),
        comentarios: comentarios.map((c) => ({ usuario: c.usuario, comentario: c.comentario })),
      });
    } catch (e) {
      next(e);
    }
  }

  function mostrarCarrito(req, res) {
    res.json({
      restaurante: restaurantePublico(req.restaurante),
      items: leerCarrito(req, req.rid),
    });
  }

  async function agregarItem(req, res, next) {
    try {
      const rid = req.rid;
      const itemId = entero(req.body && req.body.iditems);
      if (itemId === null) return res.status(400).json({ error: 'Solicitud inválida', codigo: 'invalida' });
      const carrito = leerCarrito(req, rid);
      if (carrito.length >= CARRITO_MAX_ITEMS) {
        return res.status(409).json({ error: 'El carrito alcanzó el máximo de productos', codigo: 'lleno' });
      }
      const item = await modelos.carta.itemParaCarrito(itemId, rid);
      if (!item) return res.status(404).json({ error: 'Producto no encontrado', codigo: 'no_encontrado' });
      const posicion = carrito.reduce((m, p) => Math.max(m, p.posicion), 0) + 1;
      guardarCarrito(req, rid, [
        ...carrito,
        { posicion, id: item.id, nombre: String(item.nombre), precio: Number(item.precio) || 0 },
      ]);
      return res.status(201).json({ ok: true, total: carrito.length + 1 });
    } catch (e) {
      return next(e);
    }
  }

  function eliminarItem(req, res) {
    const pos = entero(req.params.pos);
    if (pos === null) return res.status(400).json({ error: 'Solicitud inválida', codigo: 'invalida' });
    guardarCarrito(req, req.rid, leerCarrito(req, req.rid).filter((p) => p.posicion !== pos));
    return res.json({ ok: true });
  }

  function vaciarCarrito(req, res) {
    guardarCarrito(req, req.rid, []);
    return res.json({ ok: true });
  }

  // Las escrituras de la API solo aceptan JSON (415 si no): un formulario HTML de otro sitio no puede enviarlo.
  function soloJson(evento) {
    return (req, res, next) => {
      if (!req.is('application/json')) {
        logSeguridad('SEC', evento, {}, req);
        return res.status(415).json({ error: 'Tipo de contenido no soportado', codigo: 'tipo' });
      }
      return next();
    };
  }

  return {
    cargarRestaurante,
    mostrarCarta,
    mostrarCarrito,
    agregarItem,
    eliminarItem,
    vaciarCarrito,
    soloJson,
    CARRITO_MAX_ITEMS,
  };
};
