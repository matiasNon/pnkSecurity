'use strict';
// Panel de administracion: CRUD de cartas, categorias y productos.
// Todas las operaciones usan req.usuario.restaurante_id (de la sesion verificada en BD), nunca un id del cliente.

const { entero, rutaFoto } = require('../utils/validar');
const { esquemaCarta, esquemaCategoria, esquemaItem, validar } = require('../utils/formularios');
const { logSeguridad, logError } = require('../services/logSeguridad');

const MENSAJES = {
  creado: 'Registro creado.',
  actualizado: 'Cambios guardados.',
  eliminado: 'Registro eliminado.',
};

module.exports = (modelos, subidas) => {
  const m = modelos.admin;

  // Definicion de cada recurso: sus datos y como se dibuja la lista y el formulario.
  const recursos = {
    cartas: {
      singular: 'Carta',
      nuevo: 'Nueva',
      plural: 'Cartas',
      esquema: esquemaCarta,
      columnas: [
        { campo: 'nombre', titulo: 'Nombre' },
        { campo: 'orden', titulo: 'Orden' },
        { campo: 'visible', titulo: 'Visible', tipo: 'bool' },
      ],
      listar: (rid) => m.listarCartas(rid),
      obtener: (rid, id) => m.obtenerCarta(rid, id),
      crear: (rid, d) => m.crearCarta(rid, d),
      actualizar: (rid, id, d) => m.actualizarCarta(rid, id, d),
      eliminar: (rid, id) => m.eliminarCarta(rid, id),
      campos: async () => [
        { nombre: 'nombre', etiqueta: 'Nombre de la carta', tipo: 'text', max: 45, requerido: true },
        { nombre: 'orden', etiqueta: 'Orden', tipo: 'number', min: 0, max: 9999 },
        { nombre: 'visible', etiqueta: 'Visible en la carta', tipo: 'checkbox' },
      ],
      porDefecto: { visible: true },
    },
    categorias: {
      singular: 'Categoría',
      nuevo: 'Nueva',
      plural: 'Categorías',
      esquema: esquemaCategoria,
      columnas: [
        { campo: 'carta', titulo: 'Carta' },
        { campo: 'nombre', titulo: 'Nombre' },
        { campo: 'orden', titulo: 'Orden' },
        { campo: 'visible', titulo: 'Visible', tipo: 'bool' },
      ],
      listar: (rid) => m.listarCategorias(rid),
      obtener: (rid, id) => m.obtenerCategoria(rid, id),
      crear: (rid, d) => m.crearCategoria(rid, d),
      actualizar: (rid, id, d) => m.actualizarCategoria(rid, id, d),
      eliminar: (rid, id) => m.eliminarCategoria(rid, id),
      campos: async (rid) => [
        {
          nombre: 'carta_id', etiqueta: 'Carta', tipo: 'select', requerido: true,
          opciones: (await m.listarCartas(rid)).map((c) => ({ valor: c.id, texto: c.nombre })),
        },
        { nombre: 'nombre', etiqueta: 'Nombre de la categoría', tipo: 'text', max: 100, requerido: true },
        { nombre: 'orden', etiqueta: 'Orden', tipo: 'number', min: 0, max: 9999 },
        { nombre: 'visible', etiqueta: 'Visible en la carta', tipo: 'checkbox' },
      ],
      porDefecto: { visible: true },
    },
    productos: {
      singular: 'Producto',
      nuevo: 'Nuevo',
      plural: 'Productos',
      esquema: esquemaItem,
      multipart: true,
      columnas: [
        { campo: 'carta', titulo: 'Carta' },
        { campo: 'categoria', titulo: 'Categoría' },
        { campo: 'nombre', titulo: 'Nombre' },
        { campo: 'precio', titulo: 'Precio', tipo: 'moneda' },
        { campo: 'visible', titulo: 'Visible', tipo: 'bool' },
        { campo: 'destacado', titulo: 'Destacado', tipo: 'bool' },
      ],
      listar: (rid) => m.listarItems(rid),
      obtener: (rid, id) => m.obtenerItem(rid, id),
      crear: (rid, d) => m.crearItem(rid, d),
      actualizar: (rid, id, d) => m.actualizarItem(rid, id, d),
      eliminar: (rid, id) => m.eliminarItem(rid, id),
      campos: async (rid) => [
        {
          nombre: 'categoria_id', etiqueta: 'Categoría', tipo: 'select', requerido: true,
          opciones: (await m.listarCategorias(rid)).map((k) => ({ valor: k.id, texto: `${k.carta} › ${k.nombre}` })),
        },
        { nombre: 'nombre', etiqueta: 'Nombre del producto', tipo: 'text', max: 100, requerido: true },
        { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'text', max: 300 },
        { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'text', max: 300 },
        { nombre: 'tiempo', etiqueta: 'Tiempo de preparación', tipo: 'text', max: 100 },
        { nombre: 'precio', etiqueta: 'Precio (CLP)', tipo: 'number', min: 0, max: 10000000, requerido: true },
        { nombre: 'puntuacion', etiqueta: 'Puntuación (0 a 5)', tipo: 'number', min: 0, max: 5 },
        { nombre: 'orden', etiqueta: 'Orden', tipo: 'number', min: 0, max: 9999 },
        { nombre: 'visible', etiqueta: 'Visible en la carta', tipo: 'checkbox' },
        { nombre: 'destacado', etiqueta: 'Producto destacado', tipo: 'checkbox' },
        { nombre: 'foto', etiqueta: 'Fotografía (JPG, PNG, GIF o WEBP)', tipo: 'file' },
      ],
      porDefecto: { visible: true, puntuacion: 0 },
    },
  };

  function recursoDe(req, res, next) {
    const r = Object.hasOwn(recursos, req.params.recurso) ? recursos[req.params.recurso] : null;
    if (!r) return res.status(404).render('error', { titulo: 'Página no encontrada', codigo: 404 });
    req.recurso = r;
    req.nombreRecurso = req.params.recurso;
    return next();
  }

  async function panel(req, res, next) {
    try {
      const rid = req.usuario.restaurante_id;
      const [cartas, categorias, items, restaurante] = await Promise.all([
        m.listarCartas(rid), m.listarCategorias(rid), m.listarItems(rid), modelos.restaurante.obtener(rid),
      ]);
      res.render('admin/panel', {
        titulo: 'Panel de administración',
        restaurante,
        totales: { cartas: cartas.length, categorias: categorias.length, productos: items.length },
      });
    } catch (e) { next(e); }
  }

  async function lista(req, res, next) {
    try {
      const rid = req.usuario.restaurante_id;
      const filas = await req.recurso.listar(rid);
      const mensaje = typeof req.query.m === 'string' && Object.hasOwn(MENSAJES, req.query.m) ? MENSAJES[req.query.m] : null;
      res.render('admin/lista', {
        titulo: req.recurso.plural, recurso: req.recurso, nombreRecurso: req.nombreRecurso, filas, mensaje,
      });
    } catch (e) { next(e); }
  }

  async function formulario(req, res, next, { valores, errores, id = null, estado = 200, error = null }) {
    const rid = req.usuario.restaurante_id;
    const campos = await req.recurso.campos(rid);
    res.status(estado).render('admin/formulario', {
      titulo: id ? `Editar ${req.recurso.singular.toLowerCase()}` : `${req.recurso.nuevo} ${req.recurso.singular.toLowerCase()}`,
      recurso: req.recurso, nombreRecurso: req.nombreRecurso, campos, valores, errores: errores || {}, id,
      errorGeneral: error, fotoActual: valores && valores.foto ? rutaFoto(rid, valores.foto) : null,
    });
  }

  async function nuevo(req, res, next) {
    try {
      await formulario(req, res, next, { valores: { ...req.recurso.porDefecto } });
    } catch (e) { next(e); }
  }

  async function editar(req, res, next) {
    try {
      const id = entero(req.params.id);
      const fila = id === null ? null : await req.recurso.obtener(req.usuario.restaurante_id, id);
      if (!fila) return res.status(404).render('error', { titulo: 'Registro no encontrado', codigo: 404 });
      return await formulario(req, res, next, { valores: fila, id });
    } catch (e) { return next(e); }
  }

  // Alta y modificacion comparten el mismo flujo: validar -> (subir foto) -> guardar -> redirigir.
  async function guardar(req, res, next) {
    const rid = req.usuario.restaurante_id;
    const id = req.params.id === undefined ? null : entero(req.params.id);
    try {
      if (req.params.id !== undefined && id === null) {
        return res.status(404).render('error', { titulo: 'Registro no encontrado', codigo: 404 });
      }
      const previo = id ? await req.recurso.obtener(rid, id) : null;
      if (id && !previo) return res.status(404).render('error', { titulo: 'Registro no encontrado', codigo: 404 });

      const { datos, errores } = validar(req.recurso.esquema, req.body);
      if (errores) {
        return await formulario(req, res, next, { valores: { ...req.body, foto: previo && previo.foto }, errores, id, estado: 400 });
      }

      let foto = null;
      if (req.recurso.multipart) {
        try {
          foto = await subidas.guardarFoto(req, rid);
        } catch (e) {
          return await formulario(req, res, next, {
            valores: { ...req.body, foto: previo && previo.foto }, errores: { foto: e.message }, id, estado: 400,
          });
        }
        datos.foto = id ? (foto === null ? undefined : foto) : foto;
      }

      const ok = id ? await req.recurso.actualizar(rid, id, datos) : await req.recurso.crear(rid, datos);
      if (!ok) {
        // Referencia a una carta/categoria que no es del restaurante del admin (o ya no existe).
        if (foto) await subidas.borrarFoto(rid, foto);
        logSeguridad('SEC', 'admin_referencia_invalida', { uid: req.usuario.id, recurso: req.nombreRecurso }, req);
        return await formulario(req, res, next, {
          valores: { ...req.body, foto: previo && previo.foto },
          errores: { general: 'La carta o categoría seleccionada no es válida' }, id, estado: 400,
        });
      }
      if (id && foto && previo && previo.foto) await subidas.borrarFoto(rid, previo.foto);
      logSeguridad('ADMIN', `${req.nombreRecurso}_${id ? 'actualizado' : 'creado'}`, { uid: req.usuario.id, id: id || ok }, req);
      return res.redirect(303, `/admin/${req.nombreRecurso}?m=${id ? 'actualizado' : 'creado'}`);
    } catch (e) {
      logError('Error en el panel de administracion', e);
      return next(e);
    }
  }

  async function eliminar(req, res, next) {
    try {
      const id = entero(req.params.id);
      const ok = id !== null && await req.recurso.eliminar(req.usuario.restaurante_id, id);
      if (!ok) return res.status(404).render('error', { titulo: 'Registro no encontrado', codigo: 404 });
      logSeguridad('ADMIN', `${req.nombreRecurso}_eliminado`, { uid: req.usuario.id, id }, req);
      return res.redirect(303, `/admin/${req.nombreRecurso}?m=eliminado`);
    } catch (e) { return next(e); }
  }

  return { recursoDe, panel, lista, nuevo, editar, guardar, eliminar };
};
