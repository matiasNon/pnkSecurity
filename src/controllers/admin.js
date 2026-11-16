'use strict';
// API del panel de administracion: CRUD de cartas, categorias y productos (JSON; la foto llega en multipart).
// Todas las operaciones usan req.rid: el restaurante del admin (sesion verificada en BD) o, solo para el super admin,
// el que eligio y quedo guardado en su sesion en el servidor; jamas un id recibido en cada peticion.

const { entero, rutaFoto } = require('../utils/validar');
const { esquemaCarta, esquemaCategoria, esquemaItem, esquemaRestaurante, validar } = require('../utils/formularios');
const { logSeguridad, logError } = require('../services/logSeguridad');

const MENSAJES = {
  creado: 'Registro creado.',
  actualizado: 'Cambios guardados.',
  eliminado: 'Registro eliminado.',
};

module.exports = (modelos, subidas) => {
  const m = modelos.admin;

  // Definicion de cada recurso: sus datos y como el frontend dibuja la lista y el formulario.
  const recursos = {
    cartas: {
      singular: 'Carta',
      nuevo: 'Nueva',
      plural: 'Cartas',
      esquema: esquemaCarta,
      multipart: true,
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
        { nombre: 'foto', etiqueta: 'Foto de portada (JPG, PNG, GIF o WEBP)', tipo: 'file' },
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

  const NO_ENCONTRADO = { error: 'Registro no encontrado', codigo: 'no_encontrado' };

  // Lo que el frontend necesita para dibujar la lista y el formulario de un recurso.
  const meta = (r, nombre) => ({
    recurso: nombre,
    singular: r.singular,
    plural: r.plural,
    nuevo: r.nuevo,
    multipart: Boolean(r.multipart),
    columnas: r.columnas,
  });

  function recursoDe(req, res, next) {
    const r = Object.hasOwn(recursos, req.params.recurso) ? recursos[req.params.recurso] : null;
    if (!r) return res.status(404).json({ error: 'Recurso no encontrado', codigo: 'no_encontrado' });
    req.recurso = r;
    req.nombreRecurso = req.params.recurso;
    return next();
  }

  // GET /api/admin: resumen del panel (restaurante del admin y totales).
  async function panel(req, res, next) {
    try {
      const rid = req.rid;
      const [cartas, categorias, items, restaurante] = await Promise.all([
        m.listarCartas(rid), m.listarCategorias(rid), m.listarItems(rid), modelos.restaurante.obtener(rid),
      ]);
      const superadmin = Boolean(req.usuario.superadmin);
      res.json({
        usuario: { nombre: req.usuario.nombre, rol: req.usuario.rol, superadmin },
        restaurante: { id: restaurante.id, nombre: restaurante.nombre },
        // Solo el super admin recibe la lista para cambiar de restaurante.
        restaurantes: superadmin ? (await modelos.restaurante.listar()).map((r) => ({ id: r.id, nombre: r.nombre })) : undefined,
        totales: { cartas: cartas.length, categorias: categorias.length, productos: items.length },
      });
    } catch (e) { next(e); }
  }

  // PUT /api/admin/restaurante { id }: el super admin elige el restaurante que administra (queda en su sesion).
  async function cambiarRestaurante(req, res, next) {
    try {
      const id = entero(req.body && req.body.id);
      if (id === null || !(await modelos.restaurante.existe(id))) return res.status(404).json(NO_ENCONTRADO);
      req.session.restauranteAdmin = id;
      logSeguridad('ADMIN', 'restaurante_cambiado', { uid: req.usuario.id, id }, req);
      return res.json({ ok: true, id });
    } catch (e) { return next(e); }
  }

  // POST /api/admin/restaurantes: el super admin crea un restaurante y pasa a administrarlo.
  async function crearRestaurante(req, res, next) {
    try {
      const { datos, errores } = validar(esquemaRestaurante, req.body);
      if (errores) return res.status(400).json({ error: 'Revise los campos marcados', codigo: 'validacion', errores });
      const id = await modelos.restaurante.crear({ ...datos, region: 'Coquimbo' });
      req.session.restauranteAdmin = id;
      logSeguridad('ADMIN', 'restaurante_creado', { uid: req.usuario.id, id }, req);
      return res.status(201).json({ ok: true, id });
    } catch (e) { return next(e); }
  }

  // GET /api/admin/:recurso
  async function lista(req, res, next) {
    try {
      const filas = await req.recurso.listar(req.rid);
      // La foto se entrega como URL validada (miniatura en la lista), nunca el nombre crudo del archivo.
      const rid = req.rid;
      res.json({
        ...meta(req.recurso, req.nombreRecurso),
        filas: filas.map(({ foto, ...f }) => (req.recurso.multipart ? { ...f, fotoUrl: rutaFoto(rid, foto) } : f)),
      });
    } catch (e) { next(e); }
  }

  // GET /api/admin/:recurso/nuevo -> campos del formulario (con las opciones de los select) y valores por defecto.
  async function nuevo(req, res, next) {
    try {
      const campos = await req.recurso.campos(req.rid);
      res.json({ ...meta(req.recurso, req.nombreRecurso), campos, valores: { ...req.recurso.porDefecto }, fotoActual: null });
    } catch (e) { next(e); }
  }

  // GET /api/admin/:recurso/:id -> campos y valores actuales del registro.
  async function editar(req, res, next) {
    try {
      const rid = req.rid;
      const id = entero(req.params.id);
      const fila = id === null ? null : await req.recurso.obtener(rid, id);
      if (!fila) return res.status(404).json(NO_ENCONTRADO);
      const campos = await req.recurso.campos(rid);
      const { foto, ...valores } = fila;
      return res.json({ ...meta(req.recurso, req.nombreRecurso), campos, valores, fotoActual: rutaFoto(rid, foto) });
    } catch (e) { return next(e); }
  }

  // Alta (POST) y modificacion (PUT) comparten el mismo flujo: validar -> (subir foto) -> guardar.
  // Errores de validacion: 400 { errores: { campo: mensaje } } para mostrarlos junto a cada campo.
  async function guardar(req, res, next) {
    const rid = req.rid;
    const id = req.params.id === undefined ? null : entero(req.params.id);
    try {
      if (req.params.id !== undefined && id === null) return res.status(404).json(NO_ENCONTRADO);
      const previo = id ? await req.recurso.obtener(rid, id) : null;
      if (id && !previo) return res.status(404).json(NO_ENCONTRADO);

      const { datos, errores } = validar(req.recurso.esquema, req.body);
      if (errores) return res.status(400).json({ error: 'Revise los campos marcados', codigo: 'validacion', errores });

      let foto = null;
      if (req.recurso.multipart) {
        try {
          foto = await subidas.guardarFoto(req, rid);
        } catch (e) {
          return res.status(400).json({ error: 'Revise los campos marcados', codigo: 'validacion', errores: { foto: e.message } });
        }
        datos.foto = id ? (foto === null ? undefined : foto) : foto;
      }

      const ok = id ? await req.recurso.actualizar(rid, id, datos) : await req.recurso.crear(rid, datos);
      if (!ok) {
        // Referencia a una carta/categoria que no es del restaurante del admin (o ya no existe).
        if (foto) await subidas.borrarFoto(rid, foto);
        logSeguridad('SEC', 'admin_referencia_invalida', { uid: req.usuario.id, recurso: req.nombreRecurso }, req);
        return res.status(400).json({
          error: 'La carta o categoría seleccionada no es válida', codigo: 'validacion',
          errores: { general: 'La carta o categoría seleccionada no es válida' },
        });
      }
      if (id && foto && previo && previo.foto) await subidas.borrarFoto(rid, previo.foto);
      logSeguridad('ADMIN', `${req.nombreRecurso}_${id ? 'actualizado' : 'creado'}`, { uid: req.usuario.id, id: id || ok }, req);
      return res.status(id ? 200 : 201).json({ ok: true, id: id || ok, mensaje: id ? MENSAJES.actualizado : MENSAJES.creado });
    } catch (e) {
      logError('Error en el panel de administracion', e);
      return next(e);
    }
  }

  // DELETE /api/admin/:recurso/:id
  async function eliminar(req, res, next) {
    try {
      const id = entero(req.params.id);
      const ok = id !== null && await req.recurso.eliminar(req.rid, id);
      if (!ok) return res.status(404).json(NO_ENCONTRADO);
      logSeguridad('ADMIN', `${req.nombreRecurso}_eliminado`, { uid: req.usuario.id, id }, req);
      return res.json({ ok: true, mensaje: MENSAJES.eliminado });
    } catch (e) { return next(e); }
  }

  return { recursoDe, panel, cambiarRestaurante, crearRestaurante, lista, nuevo, editar, guardar, eliminar };
};
