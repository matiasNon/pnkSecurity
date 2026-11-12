'use strict';
// CRUD desde la consola del backend: usa la MISMA API del panel (/api/admin/:recurso) con sesion de administrador.
// Muestra cada peticion HTTP (metodo, ruta, estado) para evidenciar el CRUD del backend. DOM seguro: solo textContent.
(function () {
  const RECURSOS = [
    { id: 'cartas', titulo: 'Cartas' },
    { id: 'categorias', titulo: 'Categorías' },
    { id: 'productos', titulo: 'Productos' },
  ];
  const estado = { csrf: '', usuario: null, recurso: 'cartas', confirmar: null };
  const $ = (id) => document.getElementById(id);
  const moneda = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') n.textContent = String(v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const h of hijos.flat(Infinity)) {
      if (h === null || h === undefined || h === false) continue;
      n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    }
    return n;
  }

  // Registro visible de las peticiones (ultimas 8).
  function registrar(metodo, ruta, status) {
    const lista = $('crud-log');
    const ok = status >= 200 && status < 300;
    lista.prepend(el('li', { class: ok ? 'ok' : 'error' },
      el('span', { class: `metodo ${metodo.toLowerCase()}`, text: metodo }),
      el('code', { text: ruta }),
      el('strong', { text: status || 'sin red' })));
    while (lista.children.length > 8) lista.lastChild.remove();
  }

  async function pedir(metodo, ruta, cuerpo) {
    const op = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (metodo !== 'GET') op.headers['X-CSRF-Token'] = estado.csrf;
    if (cuerpo instanceof FormData) op.body = cuerpo;
    else if (cuerpo !== undefined) {
      op.headers['Content-Type'] = 'application/json';
      op.body = JSON.stringify(cuerpo);
    }
    let res;
    try {
      res = await fetch(ruta, op);
    } catch {
      registrar(metodo, ruta, 0);
      return { ok: false, status: 0, datos: { error: 'No se pudo conectar con el servidor.' } };
    }
    let datos = {};
    try { datos = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
    if (metodo !== 'GET' || ruta.startsWith('/api/admin')) registrar(metodo, ruta, res.status);
    return { ok: res.ok, status: res.status, datos };
  }

  async function cargarSesion() {
    const r = await pedir('GET', '/api/sesion');
    if (r.ok) {
      estado.csrf = r.datos.csrf || '';
      estado.usuario = r.datos.usuario || null;
    }
  }

  const esAdmin = () => estado.usuario && estado.usuario.rol === 'admin';

  // ---------- Login ----------
  function vistaLogin(mensaje) {
    const email = el('input', { type: 'email', id: 'crud-email', autocomplete: 'username', required: true, maxlength: 100 });
    const clave = el('input', { type: 'password', id: 'crud-clave', autocomplete: 'current-password', required: true, maxlength: 128 });
    const aviso = el('p', { class: 'crud-error', role: 'alert', text: mensaje || '' });
    const form = el('form', { class: 'crud-login' },
      el('p', { class: 'nota', text: 'El CRUD requiere sesión de administrador (rol admin, verificado en la BD).' }),
      el('label', { for: 'crud-email', text: 'Correo' }), email,
      el('label', { for: 'crud-clave', text: 'Contraseña' }), clave,
      aviso,
      el('button', { type: 'submit', class: 'boton primario', text: 'Ingresar' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await pedir('POST', '/api/login', { email: email.value, password: clave.value });
      clave.value = '';
      if (!r.ok) {
        aviso.textContent = r.status === 429 ? 'Demasiados intentos. Espere un momento.' : 'Usuario o contraseña incorrectos.';
        return;
      }
      estado.csrf = r.datos.csrf || estado.csrf;
      estado.usuario = r.datos.usuario || null;
      if (!esAdmin()) return vistaLogin('La cuenta no tiene rol de administrador.');
      return vistaCrud();
    });
    $('crud').replaceChildren(form);
  }

  // ---------- CRUD ----------
  function barra() {
    const pestañas = el('div', { class: 'crud-pestanas', role: 'tablist' },
      RECURSOS.map((r) => el('button', {
        type: 'button', role: 'tab', class: 'crud-pestana', 'aria-selected': String(r.id === estado.recurso),
        text: r.titulo, onclick: () => { estado.recurso = r.id; vistaCrud(); },
      })));
    const salir = el('button', {
      type: 'button', class: 'boton', text: 'Cerrar sesión',
      onclick: async () => { await pedir('POST', '/api/logout'); await cargarSesion(); vistaLogin(); },
    });
    return el('div', { class: 'crud-barra' }, pestañas,
      el('div', { class: 'crud-usuario' }, el('span', { text: `${estado.usuario.nombre} · admin` }), salir));
  }

  function celda(fila, col) {
    const v = fila[col.campo];
    if (col.tipo === 'bool') return el('span', { class: `prot ${v ? 'csrf' : 'publico'}`, text: v ? 'Sí' : 'No' });
    if (col.tipo === 'moneda') return moneda.format(Number(v) || 0);
    return v === null || v === undefined ? '—' : String(v);
  }

  async function vistaCrud(mensaje) {
    const caja = $('crud');
    const r = await pedir('GET', `/api/admin/${estado.recurso}`);
    if (r.status === 401 || r.status === 403) { await cargarSesion(); return vistaLogin('La sesión expiró.'); }
    if (!r.ok) return caja.replaceChildren(el('p', { class: 'crud-error', text: 'No se pudo cargar la lista.' }));
    const d = r.datos;
    const conFoto = d.multipart;

    const cuerpo = el('tbody', {}, d.filas.length === 0
      ? el('tr', {}, el('td', { colspan: d.columnas.length + 3, class: 'nota', text: 'Sin registros.' }))
      : d.filas.map((f) => el('tr', {},
        el('td', {}, el('code', { text: `#${f.id}` })),
        conFoto ? el('td', {}, f.fotoUrl ? el('img', { class: 'crud-mini', src: f.fotoUrl, alt: '', width: 40, height: 40 }) : '—') : null,
        d.columnas.map((c) => el('td', {}, celda(f, c))),
        el('td', { class: 'crud-acciones' },
          el('button', { type: 'button', class: 'boton chico', text: 'Editar', onclick: () => vistaFormulario(f.id) }),
          el('button', {
            type: 'button', class: `boton chico peligro${estado.confirmar === f.id ? ' confirmar' : ''}`,
            text: estado.confirmar === f.id ? '¿Confirmar?' : 'Eliminar',
            onclick: async () => {
              if (estado.confirmar !== f.id) { estado.confirmar = f.id; return vistaCrud(); }
              estado.confirmar = null;
              const res = await pedir('DELETE', `/api/admin/${estado.recurso}/${f.id}`);
              return vistaCrud(res.ok ? 'Registro eliminado (borrado lógico).' : (res.datos.error || 'No se pudo eliminar.'));
            },
          })))));

    caja.replaceChildren(
      barra(),
      el('div', { class: 'crud-cabeza' },
        el('h3', { text: `${d.plural} (${d.filas.length})` }),
        el('button', { type: 'button', class: 'boton primario', text: `+ ${d.nuevo} ${d.singular.toLowerCase()}`, onclick: () => vistaFormulario(null) })),
      mensaje ? el('p', { class: 'crud-ok', role: 'status', text: mensaje }) : null,
      el('div', { class: 'tabla-envoltura' }, el('table', { class: 'endpoints crud-tabla' },
        el('thead', {}, el('tr', {}, el('th', { text: 'ID' }), conFoto ? el('th', { text: 'Foto' }) : null,
          d.columnas.map((c) => el('th', { text: c.titulo })), el('th', { text: 'Acciones' }))),
        cuerpo)));
    return null;
  }

  function campo(c, valores) {
    const id = `crud-${c.nombre}`;
    const v = valores[c.nombre];
    let input;
    if (c.tipo === 'select') {
      input = el('select', { id, name: c.nombre, required: c.requerido },
        el('option', { value: '', text: '— Seleccione —' }),
        c.opciones.map((o) => el('option', { value: o.valor, selected: String(o.valor) === String(v), text: o.texto })));
    } else if (c.tipo === 'checkbox') {
      input = el('input', { id, name: c.nombre, type: 'checkbox', value: '1', checked: Boolean(v) });
      return el('div', { class: 'crud-campo check' }, input, el('label', { for: id, text: c.etiqueta }),
        el('p', { class: 'crud-error', 'data-campo': c.nombre }));
    } else if (c.tipo === 'file') {
      input = el('input', { id, name: c.nombre, type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp' });
    } else {
      input = el('input', {
        id, name: c.nombre, type: c.tipo, required: c.requerido, maxlength: c.max && c.tipo === 'text' ? c.max : undefined,
        min: c.tipo === 'number' ? c.min : undefined, max: c.tipo === 'number' ? c.max : undefined,
        step: c.tipo === 'number' ? 'any' : undefined, value: v === null || v === undefined ? '' : String(v),
      });
    }
    return el('div', { class: 'crud-campo' }, el('label', { for: id, text: c.etiqueta + (c.requerido ? ' *' : '') }), input,
      el('p', { class: 'crud-error', 'data-campo': c.nombre }));
  }

  async function vistaFormulario(id) {
    const r = await pedir('GET', id ? `/api/admin/${estado.recurso}/${id}` : `/api/admin/${estado.recurso}/nuevo`);
    if (!r.ok) return vistaCrud(r.datos.error || 'No se pudo abrir el registro.');
    const d = r.datos;
    const aviso = el('p', { class: 'crud-error', role: 'alert' });
    const form = el('form', { class: 'crud-form', novalidate: true },
      el('div', { class: 'crud-grilla' }, d.campos.map((c) => campo(c, d.valores))),
      d.fotoActual ? el('p', { class: 'nota' }, 'Foto actual: ', el('img', { class: 'crud-mini', src: d.fotoActual, alt: '', width: 40, height: 40 })) : null,
      aviso,
      el('div', { class: 'crud-botones' },
        el('button', { type: 'submit', class: 'boton primario', text: id ? 'Guardar cambios (PUT)' : 'Crear (POST)' }),
        el('button', { type: 'button', class: 'boton', text: 'Cancelar', onclick: () => vistaCrud() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      for (const p of form.querySelectorAll('[data-campo]')) p.textContent = '';
      const res = await pedir(id ? 'PUT' : 'POST', id ? `/api/admin/${estado.recurso}/${id}` : `/api/admin/${estado.recurso}`, new FormData(form));
      if (res.ok) return vistaCrud(res.datos.mensaje || (id ? 'Cambios guardados.' : 'Registro creado.'));
      if (res.datos.errores) {
        for (const [k, msg] of Object.entries(res.datos.errores)) {
          const p = form.querySelector(`[data-campo="${CSS.escape(k)}"]`);
          if (p) p.textContent = String(msg);
        }
      }
      aviso.textContent = res.datos.error || 'No se pudo guardar.';
      return null;
    });
    $('crud').replaceChildren(barra(),
      el('div', { class: 'crud-cabeza' }, el('h3', { text: id ? `Editar ${d.singular.toLowerCase()} #${id}` : `${d.nuevo} ${d.singular.toLowerCase()}` })),
      form);
    return null;
  }

  async function iniciar() {
    if (!$('crud')) return;
    await cargarSesion();
    if (esAdmin()) vistaCrud();
    else vistaLogin();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
