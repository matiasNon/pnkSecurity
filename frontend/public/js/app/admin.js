// Panel de administracion (CRUD). Una sola pieza para las tres vistas, segun la URL:
//   /admin                         -> resumen           (GET /api/admin)
//   /admin/:recurso                -> lista             (GET /api/admin/:recurso, DELETE /api/admin/:recurso/:id)
//   /admin/:recurso/nuevo          -> formulario de alta (GET .../nuevo, POST /api/admin/:recurso)
//   /admin/:recurso/:id/editar     -> formulario de edicion (GET .../:id, PUT /api/admin/:recurso/:id)
// La autorizacion la decide SIEMPRE el backend (sesion + rol admin + restaurante de la sesion); aqui solo se muestra.
// Diseno moderno (nov-2026): mismo estilo que la carta (encabezado azul, tarjetas, pildoras), miniaturas de fotos,
// buscador en las listas, eliminacion en dos pasos y vista previa de la foto antes de guardar.
// Seguridad: todo dato se inserta como texto (el() usa textContent/setAttribute); nunca innerHTML.
(function () {
  'use strict';
  const { el, agregar, vaciar, moneda, urlSegura, pedir, cargarSesion, paginaError } = window.PNK;

  const MENSAJES = { creado: 'Registro creado.', actualizado: 'Cambios guardados.', eliminado: 'Registro eliminado.' };
  const SECCIONES = [
    { recurso: 'cartas', nombre: 'Cartas', icono: 'ti-book' },
    { recurso: 'categorias', nombre: 'Categorías', icono: 'ti-view-list-alt' },
    { recurso: 'productos', nombre: 'Productos', icono: 'ti-package' },
  ];
  const FOTO_VACIA = '/imagenes/producto.jpg';
  const MAX_FOTO = 2 * 1024 * 1024;
  const ruta = location.pathname;
  const app = () => vaciar(document.getElementById('app'));
  let datosPanel = null; // { usuario, restaurante } para el encabezado

  // 401/403/404 de la API -> pagina de error; true si hubo error.
  function falla(r) {
    if (r.ok) return false;
    if (r.status === 401) paginaError('Debe iniciar sesión');
    else if (r.status === 403) paginaError('Acceso restringido');
    else if (r.status === 404) paginaError('Registro no encontrado');
    else paginaError('Ha ocurrido un error. Intente nuevamente más tarde.');
    return true;
  }

  // ---------- Estructura comun: encabezado + navegacion + pie ----------
  function encabezado(activo) {
    const { usuario, restaurante } = datosPanel;
    const salir = el('form', { class: 'cm-salir' }, el('button', { type: 'submit', class: 'cm-btn cm-btn-texto', text: 'Cerrar sesión' }));
    salir.addEventListener('submit', async (e) => {
      e.preventDefault();
      await pedir('POST', '/api/logout');
      location.href = `/restaurantes/${restaurante.id}`;
    });
    return el('header', { class: 'cm-header' },
      el('div', { class: 'cm-contenedor cm-header-fila' },
        el('div', { class: 'adm-marca' },
          el('a', { class: 'cm-logo', href: '/admin', 'aria-label': 'Inicio del panel' }, el('img', { src: '/img/logo.png', alt: 'PNK', width: '150', height: '42' })),
          el('div', { class: 'adm-marca-texto' },
            el('span', { class: 'adm-marca-titulo', text: 'Panel de administración' }),
            el('span', { class: 'adm-marca-sub', text: restaurante.nombre }))),
        el('div', { class: 'cm-header-acciones' },
          el('span', { class: 'cm-saludo', text: `Administrador: ${usuario.nombre}` }),
          el('a', { class: 'cm-btn cm-btn-claro', href: `/restaurantes/${restaurante.id}`, text: 'Ver la carta' }),
          salir)),
      el('nav', { class: 'adm-nav', 'aria-label': 'Secciones del panel' }, el('div', { class: 'cm-contenedor adm-nav-fila' },
        el('a', { class: `adm-tab${activo === 'resumen' ? ' activa' : ''}`, href: '/admin', 'aria-current': activo === 'resumen' ? 'page' : null },
          el('i', { class: 'ti-dashboard', 'aria-hidden': 'true' }), ' Resumen'),
        SECCIONES.map((s) => el('a', {
          class: `adm-tab${activo === s.recurso ? ' activa' : ''}`, href: `/admin/${s.recurso}`, 'aria-current': activo === s.recurso ? 'page' : null,
        }, el('i', { class: s.icono, 'aria-hidden': 'true' }), ` ${s.nombre}`)))));
  }

  function pieAdmin() {
    return el('footer', { class: 'cm-pie' }, el('div', { class: 'cm-contenedor' },
      el('p', {}, 'Copyright 2020, Todos los Derechos reservados PNK. ', el('b', { text: 'Inacap Sede La Serena' }))));
  }

  async function cargarEncabezado() {
    if (datosPanel) return true;
    const r = await pedir('GET', '/api/admin');
    if (falla(r)) return false;
    datosPanel = r.datos;
    return true;
  }

  function pagina(activo, ...contenido) {
    agregar(app(), [encabezado(activo), el('main', { class: 'adm-main' }, el('div', { class: 'cm-contenedor' }, contenido)), pieAdmin()]);
  }

  // ---------- Resumen ----------
  async function panel() {
    if (!(await cargarEncabezado())) return;
    const { restaurante, totales, usuario } = datosPanel;
    const tarjeta = (s, n) => el('article', { class: `adm-kpi adm-kpi-${s.recurso}` },
      el('div', { class: 'adm-kpi-icono', 'aria-hidden': 'true' }, el('i', { class: s.icono })),
      el('div', { class: 'adm-kpi-cuerpo' },
        el('span', { class: 'adm-kpi-numero', text: n }),
        el('h3', { class: 'adm-kpi-nombre', text: s.nombre })),
      el('div', { class: 'adm-kpi-acciones' },
        el('a', { class: 'cm-btn cm-btn-claro', href: `/admin/${s.recurso}`, text: `Administrar ${s.nombre.toLowerCase()}` }),
        el('a', { class: 'cm-btn cm-btn-verde', href: `/admin/${s.recurso}/nuevo`, 'aria-label': `Crear en ${s.nombre}`, text: '+ Nuevo' })));
    pagina('resumen',
      el('section', { class: 'adm-bienvenida' },
        el('h1', { text: 'Panel de administración' }),
        el('p', {}, `Hola, ${usuario.nombre}. Desde aquí administras la carta de `, el('b', { text: restaurante.nombre }), '.')),
      el('section', { class: 'adm-kpis' },
        tarjeta(SECCIONES[0], totales.cartas), tarjeta(SECCIONES[1], totales.categorias), tarjeta(SECCIONES[2], totales.productos)),
      el('section', { class: 'adm-consejos' },
        el('h2', { text: 'Consejos' }),
        el('ul', {},
          el('li', { text: 'Sube una foto de portada a cada carta: se muestra como banner en la pestaña de la carta pública.' }),
          el('li', { text: 'Marca un producto como "destacado" para que aparezca en la portada de la carta.' }),
          el('li', { text: 'Ocultar (desmarcar "Visible") es reversible; eliminar lo quita de la carta.' }))));
  }

  // ---------- Lista ----------
  function celda(col, v) {
    if (col.tipo === 'bool') return el('span', { class: `adm-estado ${v ? 'si' : 'no'}`, text: v ? 'Sí' : 'No' });
    if (col.tipo === 'moneda') return el('span', { class: 'adm-moneda', text: moneda(v) });
    return v ?? '';
  }

  // Eliminar en dos pasos: el primer clic pide confirmacion en el mismo boton (sin ventanas emergentes).
  function botonEliminar(nombre, alConfirmar) {
    const b = el('button', { type: 'button', class: 'cm-btn adm-btn-peligro', 'aria-label': `Eliminar ${nombre}`, text: 'Eliminar' });
    let armado = false;
    let espera = null;
    b.addEventListener('click', async () => {
      if (!armado) {
        armado = true;
        b.textContent = '¿Confirmar?';
        b.classList.add('armado');
        b.setAttribute('aria-label', `Confirmar eliminación de ${nombre}`);
        espera = setTimeout(() => {
          armado = false;
          b.textContent = 'Eliminar';
          b.classList.remove('armado');
          b.setAttribute('aria-label', `Eliminar ${nombre}`);
        }, 4000);
        return;
      }
      clearTimeout(espera);
      b.disabled = true;
      await alConfirmar();
    });
    return b;
  }

  async function lista(recurso, mensaje) {
    if (!(await cargarEncabezado())) return;
    const r = await pedir('GET', `/api/admin/${recurso}`);
    if (falla(r)) return;
    const d = r.datos;
    document.title = `${d.plural} · Panel`;
    const conFoto = d.multipart;
    const aviso = el('div', { class: 'alert alert-success adm-aviso', role: 'status', hidden: !mensaje, text: mensaje || '' });
    const cuerpo = el('tbody');
    const filasDom = [];

    for (const f of d.filas) {
      const tr = el('tr', { 'data-texto': d.columnas.map((c) => String(f[c.campo] ?? '')).join(' ').toLowerCase() },
        conFoto ? el('td', { class: 'adm-celda-foto', 'data-label': 'Foto' },
          el('img', { class: 'adm-mini', src: urlSegura(f.fotoUrl, FOTO_VACIA), alt: '', width: '56', height: '56', loading: 'lazy' })) : null,
        d.columnas.map((col) => el('td', { 'data-label': col.titulo }, celda(col, f[col.campo]))),
        el('td', { class: 'adm-acciones', 'data-label': 'Acciones' },
          el('a', { class: 'cm-btn adm-btn-editar', href: `/admin/${recurso}/${f.id}/editar`, 'aria-label': `Editar ${f.nombre}`, text: 'Editar' }),
          botonEliminar(f.nombre, async () => {
            const res = await pedir('DELETE', `/api/admin/${recurso}/${f.id}`);
            if (res.ok) {
              datosPanel = null; // los totales cambiaron
              return lista(recurso, MENSAJES.eliminado);
            }
            aviso.className = 'alert alert-danger adm-aviso';
            aviso.textContent = res.datos.error || 'No se pudo eliminar.';
            aviso.hidden = false;
            return null;
          })));
      filasDom.push(tr);
      cuerpo.appendChild(tr);
    }
    const sinResultados = el('tr', { hidden: true }, el('td', { colspan: d.columnas.length + (conFoto ? 2 : 1), class: 'vacio', text: 'Ningún registro coincide con la búsqueda.' }));
    if (d.filas.length === 0) {
      cuerpo.appendChild(el('tr', {}, el('td', { colspan: d.columnas.length + (conFoto ? 2 : 1), class: 'vacio' },
        'Todavía no hay registros. ', el('a', { href: `/admin/${recurso}/nuevo`, text: `Crea el primero` }), '.')));
    } else {
      cuerpo.appendChild(sinResultados);
    }

    // Buscador instantaneo (filtra en el navegador; no envia nada al servidor).
    const buscador = el('input', { type: 'search', class: 'adm-buscar', placeholder: `Buscar en ${d.plural.toLowerCase()}…`, 'aria-label': `Buscar en ${d.plural}` });
    buscador.addEventListener('input', () => {
      const q = buscador.value.trim().toLowerCase();
      let visibles = 0;
      for (const tr of filasDom) {
        const ok = !q || tr.dataset.texto.includes(q);
        tr.hidden = !ok;
        if (ok) visibles++;
      }
      sinResultados.hidden = visibles > 0 || filasDom.length === 0;
    });

    pagina(recurso,
      el('div', { class: 'adm-titulo-fila' },
        el('div', {},
          el('h1', { class: 'adm-titulo', text: d.plural }),
          el('p', { class: 'adm-subtitulo', text: `${d.filas.length} ${d.filas.length === 1 ? 'registro' : 'registros'}` })),
        el('a', { class: 'cm-btn cm-btn-verde cm-btn-grande', href: `/admin/${recurso}/nuevo`, text: `+ ${d.nuevo} ${d.singular.toLowerCase()}` })),
      aviso,
      el('div', { class: 'adm-tarjeta' },
        el('div', { class: 'adm-herramientas' }, buscador),
        el('div', { class: 'table-responsive' }, el('table', { class: 'adm-tabla' },
          el('thead', {}, el('tr', {},
            conFoto ? el('th', { scope: 'col', text: 'Foto' }) : null,
            d.columnas.map((c) => el('th', { scope: 'col', text: c.titulo })),
            el('th', { scope: 'col', text: 'Acciones' }))),
          cuerpo))));
  }

  // ---------- Formulario ----------
  function campo(c, valor) {
    const id = `f-${c.nombre}`;
    const error = el('small', { class: 'adm-error', role: 'alert', 'data-error': c.nombre, hidden: true });
    if (c.tipo === 'checkbox') {
      // Interruptor: es la casilla real (accesible y clicable), solo con otro aspecto.
      return el('div', { class: 'adm-switch' },
        el('input', { type: 'checkbox', class: 'adm-switch-input', role: 'switch', id, name: c.nombre, checked: Boolean(valor) }),
        el('label', { for: id, text: c.etiqueta }), error);
    }
    let control;
    if (c.tipo === 'select') {
      control = el('select', { class: 'form-control', id, name: c.nombre, required: c.requerido },
        el('option', { value: '', text: 'Seleccione...' }),
        c.opciones.map((o) => el('option', { value: o.valor, selected: String(valor) === String(o.valor), text: o.texto })));
    } else {
      control = el('input', {
        type: c.tipo, class: 'form-control', id, name: c.nombre, value: valor ?? '',
        maxlength: c.tipo === 'text' ? c.max : null,
        min: c.tipo === 'number' ? c.min : null, max: c.tipo === 'number' ? c.max : null,
        required: c.requerido,
      });
    }
    return el('div', { class: 'adm-campo' },
      el('label', { for: id }, c.etiqueta, c.requerido ? el('span', { class: 'adm-requerido', 'aria-hidden': 'true', text: ' *' }) : null), control, error);
  }

  // Zona de foto: muestra la actual y una vista previa local antes de guardar (FileReader -> data: URL, permitido por
  // la CSP img-src 'self' data:). La validacion real (tipo por contenido, tamano) la hace el backend al guardar.
  function zonaFoto(c, fotoActual) {
    const id = `f-${c.nombre}`;
    const vista = el('img', { class: 'adm-foto-vista', src: urlSegura(fotoActual, FOTO_VACIA), alt: 'Vista previa de la foto', width: '480', height: '360' });
    const estado = el('p', { class: 'adm-foto-estado', text: fotoActual ? 'Foto actual' : 'Sin foto (se mostrará una imagen por defecto)' });
    const error = el('small', { class: 'adm-error', role: 'alert', 'data-error': c.nombre, hidden: true });
    const input = el('input', { type: 'file', class: 'adm-foto-input', id, name: c.nombre, accept: 'image/jpeg,image/png,image/gif,image/webp' });
    input.addEventListener('change', () => {
      const archivo = input.files && input.files[0];
      error.hidden = true;
      if (!archivo) return;
      if (archivo.size > MAX_FOTO) {
        error.textContent = 'La foto supera el máximo de 2 MB.';
        error.hidden = false;
        input.value = '';
        return;
      }
      const lector = new FileReader();
      lector.addEventListener('load', () => {
        if (typeof lector.result === 'string' && lector.result.startsWith('data:image/')) vista.src = lector.result;
      });
      lector.readAsDataURL(archivo);
      estado.textContent = `Nueva foto: ${archivo.name} (se guarda al presionar Guardar)`;
    });
    return el('div', { class: 'adm-foto' },
      el('span', { class: 'adm-foto-titulo', text: c.etiqueta }),
      vista, estado,
      el('label', { class: 'cm-btn cm-btn-claro adm-foto-boton', for: id }, el('i', { class: 'ti-upload', 'aria-hidden': 'true' }), ' Elegir imagen'),
      input, error);
  }

  async function formulario(recurso, id) {
    if (!(await cargarEncabezado())) return;
    const r = await pedir('GET', id ? `/api/admin/${recurso}/${id}` : `/api/admin/${recurso}/nuevo`);
    if (falla(r)) return;
    const d = r.datos;
    const titulo = id ? `Editar ${d.singular.toLowerCase()}` : `${d.nuevo} ${d.singular.toLowerCase()}`;
    document.title = `${titulo} · Panel`;
    const general = el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
    const campoFoto = d.campos.find((c) => c.tipo === 'file');
    const guardar = el('button', { type: 'submit', class: 'cm-btn cm-btn-verde cm-btn-grande', text: 'Guardar' });
    const form = el('form', { class: 'adm-form', novalidate: false },
      el('div', { class: 'adm-form-grilla' },
        el('div', { class: 'adm-tarjeta adm-form-campos' },
          d.campos.filter((c) => c.tipo !== 'file').map((c) => campo(c, d.valores[c.nombre]))),
        campoFoto ? el('div', { class: 'adm-tarjeta adm-form-lateral' }, zonaFoto(campoFoto, urlSegura(d.fotoActual, null))) : null),
      el('div', { class: 'adm-form-acciones' },
        guardar,
        el('a', { class: 'cm-btn cm-btn-claro', href: `/admin/${recurso}`, text: 'Cancelar' })));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      for (const n of form.querySelectorAll('[data-error]')) { n.hidden = true; n.textContent = ''; }
      general.hidden = true;
      guardar.disabled = true;
      guardar.textContent = 'Guardando…';
      // FormData envia los campos y la foto (multipart); una casilla sin marcar no viaja (el backend la toma como false).
      const res = await pedir(id ? 'PUT' : 'POST', id ? `/api/admin/${recurso}/${id}` : `/api/admin/${recurso}`, new FormData(form));
      if (res.ok) {
        location.href = `/admin/${recurso}?m=${id ? 'actualizado' : 'creado'}`;
        return;
      }
      guardar.disabled = false;
      guardar.textContent = 'Guardar';
      if (res.status === 401 || res.status === 403) { falla(res); return; }
      const errores = res.datos.errores || {};
      for (const [nombre, mensaje] of Object.entries(errores)) {
        const nodo = form.querySelector(`[data-error="${CSS.escape(nombre)}"]`);
        if (nodo) { nodo.textContent = mensaje; nodo.hidden = false; }
      }
      general.textContent = errores.general || res.datos.error || 'No se pudo guardar.';
      general.hidden = false;
      general.scrollIntoView({ block: 'center' });
    });

    pagina(recurso,
      el('div', { class: 'adm-titulo-fila' },
        el('div', {},
          el('a', { class: 'adm-volver', href: `/admin/${recurso}`, text: `← ${d.plural}` }),
          el('h1', { class: 'adm-titulo', text: titulo }))),
      general, form);
  }

  async function iniciar() {
    await cargarSesion();
    const m = new URLSearchParams(location.search).get('m');
    const mensaje = Object.hasOwn(MENSAJES, m || '') ? MENSAJES[m] : null;
    let p;
    if (ruta === '/admin') return panel();
    if ((p = /^\/admin\/(cartas|categorias|productos)$/.exec(ruta))) return lista(p[1], mensaje);
    if ((p = /^\/admin\/(cartas|categorias|productos)\/nuevo$/.exec(ruta))) return formulario(p[1], null);
    if ((p = /^\/admin\/(cartas|categorias|productos)\/([0-9]{1,10})\/editar$/.exec(ruta))) return formulario(p[1], Number(p[2]));
    return paginaError('Página no encontrada');
  }

  iniciar();
})();
