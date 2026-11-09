// Panel de administracion (CRUD). Una sola pieza para las tres vistas, segun la URL:
//   /admin                         -> resumen           (GET /api/admin)
//   /admin/:recurso                -> lista             (GET /api/admin/:recurso, DELETE /api/admin/:recurso/:id)
//   /admin/:recurso/nuevo          -> formulario de alta (GET .../nuevo, POST /api/admin/:recurso)
//   /admin/:recurso/:id/editar     -> formulario de edicion (GET .../:id, PUT /api/admin/:recurso/:id)
// La autorizacion la decide SIEMPRE el backend (sesion + rol admin + restaurante de la sesion); aqui solo se muestra.
(function () {
  'use strict';
  const { el, agregar, vaciar, moneda, urlSegura, pedir, cargarSesion, estado, paginaError, pie } = window.PNK;

  const MENSAJES = { creado: 'Registro creado.', actualizado: 'Cambios guardados.', eliminado: 'Registro eliminado.' };
  const ruta = location.pathname;
  const app = () => vaciar(document.getElementById('app'));

  // 401/403/404 de la API -> pagina de error; true si hubo error.
  function falla(r) {
    if (r.ok) return false;
    if (r.status === 401) paginaError('Debe iniciar sesión');
    else if (r.status === 403) paginaError('Acceso restringido');
    else if (r.status === 404) paginaError('Registro no encontrado');
    else paginaError('Ha ocurrido un error. Intente nuevamente más tarde.');
    return true;
  }

  // ---------- Resumen ----------
  async function panel() {
    const r = await pedir('GET', '/api/admin');
    if (falla(r)) return;
    const { restaurante, totales, usuario } = r.datos;
    const salir = el('form', { class: 'form-inline' }, el('button', { type: 'submit', class: 'btn btn-link', text: 'Cerrar sesión' }));
    salir.addEventListener('submit', async (e) => {
      e.preventDefault();
      await pedir('POST', '/api/logout');
      location.href = `/restaurantes/${restaurante.id}`;
    });
    const tarjeta = (n, nombre, recurso) => el('div', { class: 'col-md-4 mb-3' }, el('div', { class: 'card' }, el('div', { class: 'card-body text-center' },
      el('h3', { text: n }), el('p', { text: nombre }),
      el('a', { class: 'btn btn-outline-primary', href: `/admin/${recurso}`, text: `Administrar ${nombre.toLowerCase()}` }))));
    agregar(app(), [
      el('nav', { class: 'navbar navbar-light bg-light' },
        el('span', { text: `Administrador: ${usuario.nombre}` }),
        el('a', { class: 'btn btn-link', href: `/restaurantes/${restaurante.id}`, text: 'Ver la carta' }),
        salir),
      el('section', {}, el('div', { class: 'container contendor' },
        el('h4', { class: 'intro-title text-center', text: 'Panel de administración' }),
        el('h5', { class: 'text-center', text: restaurante.nombre }),
        el('div', { class: 'row mt-4' },
          tarjeta(totales.cartas, 'Cartas', 'cartas'),
          tarjeta(totales.categorias, 'Categorías', 'categorias'),
          tarjeta(totales.productos, 'Productos', 'productos')))),
      pie(),
    ]);
  }

  // ---------- Lista ----------
  function celda(col, v) {
    if (col.tipo === 'bool') return v ? 'Sí' : 'No';
    if (col.tipo === 'moneda') return moneda(v);
    return v ?? '';
  }

  async function lista(recurso, mensaje) {
    const r = await pedir('GET', `/api/admin/${recurso}`);
    if (falla(r)) return;
    const d = r.datos;
    document.title = d.plural;
    const aviso = el('div', { class: 'alert alert-success', role: 'alert', hidden: !mensaje, text: mensaje || '' });
    const cuerpo = el('tbody');
    if (d.filas.length === 0) {
      cuerpo.appendChild(el('tr', {}, el('td', { colspan: d.columnas.length + 1, class: 'text-center', text: 'No hay registros.' })));
    }
    for (const f of d.filas) {
      const borrar = el('form', { class: 'd-inline' }, el('button', { type: 'submit', class: 'btn btn-sm btn-outline-danger', text: 'Eliminar' }));
      borrar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await pedir('DELETE', `/api/admin/${recurso}/${f.id}`);
        if (res.ok) return lista(recurso, MENSAJES.eliminado);
        aviso.className = 'alert alert-danger';
        aviso.textContent = res.datos.error || 'No se pudo eliminar.';
        aviso.hidden = false;
        return null;
      });
      cuerpo.appendChild(el('tr', {},
        d.columnas.map((col) => el('td', { text: celda(col, f[col.campo]) })),
        el('td', {},
          el('a', { class: 'btn btn-sm btn-outline-primary', href: `/admin/${recurso}/${f.id}/editar`, text: 'Editar' }), ' ',
          borrar)));
    }
    agregar(app(), [
      el('nav', { class: 'navbar navbar-light bg-light' },
        el('a', { class: 'btn btn-link', href: '/admin', text: '← Panel' }),
        el('a', { class: 'btn btn-outline-success', href: `/admin/${recurso}/nuevo`, text: `${d.nuevo} ${d.singular.toLowerCase()}` })),
      el('section', {}, el('div', { class: 'container contendor' },
        el('h4', { class: 'intro-title text-center', text: d.plural }),
        aviso,
        el('div', { class: 'table-responsive' }, el('table', { class: 'table table-hover' },
          el('thead', {}, el('tr', {}, d.columnas.map((c) => el('th', { scope: 'col', text: c.titulo })), el('th', { scope: 'col', text: 'Acciones' }))),
          cuerpo)))),
      pie(),
    ]);
  }

  // ---------- Formulario ----------
  function campo(c, valor, fotoActual) {
    const id = `f-${c.nombre}`;
    const error = el('small', { class: 'text-danger', role: 'alert', 'data-error': c.nombre, hidden: true });
    if (c.tipo === 'checkbox') {
      return el('div', { class: 'form-group form-check' },
        el('input', { type: 'checkbox', class: 'form-check-input', id, name: c.nombre, checked: Boolean(valor) }),
        el('label', { class: 'form-check-label', for: id, text: c.etiqueta }), error);
    }
    let control;
    if (c.tipo === 'select') {
      control = el('select', { class: 'form-control', id, name: c.nombre, required: c.requerido },
        el('option', { value: '', text: 'Seleccione...' }),
        c.opciones.map((o) => el('option', { value: o.valor, selected: String(valor) === String(o.valor), text: o.texto })));
    } else if (c.tipo === 'file') {
      control = [
        fotoActual ? el('div', {}, el('img', { src: fotoActual, alt: '', width: '120px', class: 'mb-2' })) : null,
        el('input', { type: 'file', class: 'form-control-file', id, name: c.nombre, accept: 'image/jpeg,image/png,image/gif,image/webp' }),
      ];
    } else {
      control = el('input', {
        type: c.tipo, class: 'form-control', id, name: c.nombre, value: valor ?? '',
        maxlength: c.tipo === 'text' ? c.max : null,
        min: c.tipo === 'number' ? c.min : null, max: c.tipo === 'number' ? c.max : null,
        required: c.requerido,
      });
    }
    return el('div', { class: 'form-group' },
      el('label', { for: id, text: `${c.etiqueta}${c.requerido ? ' *' : ''}` }), control, error);
  }

  async function formulario(recurso, id) {
    const r = await pedir('GET', id ? `/api/admin/${recurso}/${id}` : `/api/admin/${recurso}/nuevo`);
    if (falla(r)) return;
    const d = r.datos;
    const titulo = id ? `Editar ${d.singular.toLowerCase()}` : `${d.nuevo} ${d.singular.toLowerCase()}`;
    document.title = titulo;
    const general = el('div', { class: 'alert alert-danger', role: 'alert', hidden: true });
    const form = el('form', { novalidate: false },
      d.campos.map((c) => campo(c, d.valores[c.nombre], urlSegura(d.fotoActual, null))),
      el('button', { type: 'submit', class: 'btn btn-success', text: 'Guardar' }),
      el('a', { class: 'btn btn-link', href: `/admin/${recurso}`, text: 'Cancelar' }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      for (const n of form.querySelectorAll('[data-error]')) { n.hidden = true; n.textContent = ''; }
      general.hidden = true;
      // FormData envia los campos y la foto (multipart); una casilla sin marcar no viaja (el backend la toma como false).
      const res = await pedir(id ? 'PUT' : 'POST', id ? `/api/admin/${recurso}/${id}` : `/api/admin/${recurso}`, new FormData(form));
      if (res.ok) {
        location.href = `/admin/${recurso}?m=${id ? 'actualizado' : 'creado'}`;
        return;
      }
      if (res.status === 401 || res.status === 403) { falla(res); return; }
      const errores = res.datos.errores || {};
      for (const [nombre, mensaje] of Object.entries(errores)) {
        const nodo = form.querySelector(`[data-error="${CSS.escape(nombre)}"]`);
        if (nodo) { nodo.textContent = mensaje; nodo.hidden = false; }
      }
      general.textContent = errores.general || res.datos.error || 'No se pudo guardar.';
      general.hidden = false;
    });

    agregar(app(), [
      el('nav', { class: 'navbar navbar-light bg-light' },
        el('a', { class: 'btn btn-link', href: `/admin/${recurso}`, text: `← ${d.plural}` })),
      el('section', {}, el('div', { class: 'container contendor' }, el('div', { class: 'formulario-admin' },
        el('h4', { class: 'intro-title text-center', text: titulo }), general, form))),
      pie(),
    ]);
  }

  async function iniciar() {
    await cargarSesion();
    if (!estado.usuario) return paginaError('Debe iniciar sesión');
    if (ruta === '/admin' || ruta === '/admin/') return panel();
    let m = /^\/admin\/(cartas|categorias|productos)$/.exec(ruta);
    if (m) {
      const clave = new URLSearchParams(location.search).get('m');
      return lista(m[1], Object.hasOwn(MENSAJES, clave || '') ? MENSAJES[clave] : null);
    }
    m = /^\/admin\/(cartas|categorias|productos)\/(?:nuevo|([0-9]{1,10})\/editar)$/.exec(ruta);
    if (m) return formulario(m[1], m[2] ? Number(m[2]) : null);
    return paginaError('Página no encontrada');
  }

  iniciar();
})();
