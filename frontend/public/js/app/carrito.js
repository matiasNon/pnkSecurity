// Pagina del carrito (/restaurantes/:id/carrito): CRUD completo contra la API. Leer = GET, cambiar cantidad = PATCH
// (botones - / +), eliminar = DELETE (agregar = POST, desde la carta).
// Diseño moderno (carta-moderna.css + carrito-moderno.css): mismo encabezado y pie que la carta.
(function () {
  'use strict';
  const { el, agregar, vaciar, moneda, urlSegura, icono, pedir, cargarSesion, paginaError, ridDeUrl } = window.PNK;
  const rid = ridDeUrl();

  function encabezado(rest) {
    return el('header', { class: 'cm-header' }, el('div', { class: 'cm-contenedor cm-header-fila' },
      el('a', { class: 'cm-logo', href: `/restaurantes/${rid}`, 'aria-label': `Inicio de ${rest.nombre}` },
        el('img', { src: '/img/logo.png', alt: 'PNK', width: '150', height: '42' })),
      el('div', { class: 'cm-header-acciones' },
        el('a', { class: 'cm-btn cm-btn-claro volver', href: `/restaurantes/${rid}` },
          el('i', { class: 'ti-arrow-left', 'aria-hidden': 'true' }), ' Volver a la Carta'))));
  }

  function pieModerno() {
    return el('footer', { class: 'cm-pie' }, el('div', { class: 'cm-contenedor' },
      el('img', { src: '/img/logo.png', alt: 'PNK', width: '120', height: '34', class: 'cm-pie-logo' }),
      el('p', {}, 'Copyright 2020, Todos los Derechos reservados PNK.', el('br'),
        'Sitio desarrollado para la Explotación de Vulnerabilidades Web, Laboratorio de Programación Segura I', el('br'),
        el('b', { text: 'Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena' }))));
  }

  // Pinta las filas, el total, el contador y el aviso del garzon (solo si hay productos).
  function filas(items, ui) {
    vaciar(ui.cuerpo);
    const unidades = items.reduce((s, p) => s + p.cantidad, 0);
    const suma = moneda(items.reduce((s, p) => s + p.precio * p.cantidad, 0));
    ui.total.textContent = suma;
    ui.totalResumen.textContent = suma;
    ui.cantidad.textContent = unidades === 1 ? '1 producto' : `${unidades} productos`;
    ui.listo.classList.toggle('car-oculto', items.length === 0);
    ui.aviso.textContent = '';
    if (items.length === 0) {
      ui.cuerpo.appendChild(el('tr', { class: 'car-fila-vacia' }, el('td', { colspan: 5 },
        el('div', { class: 'car-vacio' },
          el('i', { class: 'ti-shopping-cart car-vacio-icono', 'aria-hidden': 'true' }),
          el('p', { class: 'vacio', text: 'Tu carrito está vacío. Vuelve a la carta y elige tus productos.' }),
          el('a', { class: 'cm-btn cm-btn-verde', href: `/restaurantes/${rid}`, text: 'Ver la carta' })))));
    }
    for (const p of items) {
      const cambiar = (delta) => async (e) => {
        e.preventDefault();
        const r = await pedir('PATCH', `/api/restaurantes/${rid}/carrito/items/${p.posicion}`, { cantidad: p.cantidad + delta });
        if (r.status === 409) ui.aviso.textContent = 'El carrito alcanzó el máximo de 50 productos.';
        recargar(ui, r.status === 409);
      };
      const precio = el('td', { class: 'car-precio', text: moneda(p.precio * p.cantidad) });
      if (p.cantidad > 1) precio.appendChild(el('small', { class: 'car-unitario', text: `${moneda(p.precio)} c/u` }));
      ui.cuerpo.appendChild(el('tr', {},
        el('th', { scope: 'row', class: 'car-codigo' }, el('span', { class: 'car-chip', text: `#${p.id}` })),
        el('td', { class: 'car-nombre', text: p.nombre }),
        el('td', { class: 'car-cant' }, el('div', { class: 'car-stepper', role: 'group', 'aria-label': `Cantidad de ${p.nombre}` },
          el('button', {
            type: 'button', class: 'car-paso menos', 'aria-label': `Quitar uno de ${p.nombre}`,
            disabled: p.cantidad <= 1 ? 'disabled' : undefined, onclick: cambiar(-1), text: '−',
          }),
          el('output', { class: 'car-num', 'aria-live': 'polite', text: String(p.cantidad) }),
          el('button', {
            type: 'button', class: 'car-paso mas', 'aria-label': `Agregar uno más de ${p.nombre}`,
            onclick: cambiar(1), text: '+',
          }))),
        precio,
        el('td', { class: 'car-accion' }, el('a', {
          class: 'elim car-eliminar', id: String(p.posicion), href: '#', role: 'button', 'aria-label': `Eliminar ${p.nombre}`,
          onclick: async (e) => { e.preventDefault(); await pedir('DELETE', `/api/restaurantes/${rid}/carrito/items/${p.posicion}`); recargar(ui); },
        }, icono('basura')))));
    }
  }

  async function recargar(ui, mantenerAviso) {
    const aviso = ui.aviso.textContent;
    const r = await pedir('GET', `/api/restaurantes/${rid}/carrito`);
    if (r.ok) filas(r.datos.items, ui);
    if (mantenerAviso) ui.aviso.textContent = aviso;
  }

  async function iniciar() {
    if (rid === null) return paginaError('Restaurante no encontrado');
    await cargarSesion(); // antes que los datos: asi hay una sola sesion (ver carta.js)
    const r = await pedir('GET', `/api/restaurantes/${rid}/carrito`);
    if (r.status === 404) return paginaError('Restaurante no encontrado');
    if (!r.ok) return paginaError('Ha ocurrido un error. Intente nuevamente más tarde.');
    const rest = r.datos.restaurante;
    document.title = `Tu pedido · ${rest.nombre}`;

    const ui = {
      cuerpo: el('tbody'),
      total: el('td', { class: 'price-tag car-total', text: moneda(0) }),
      totalResumen: el('span', { class: 'car-resumen-total', text: moneda(0) }),
      cantidad: el('span', { class: 'car-cantidad', text: '0 productos' }),
      listo: el('p', { class: 'car-listo' }, el('i', { class: 'ti-bell', 'aria-hidden': 'true' }),
        ' ¿Listo con tu pedido? Llama al garzón para solicitarlo.'),
      aviso: el('p', { class: 'car-aviso', role: 'status' }),
    };
    ui.limpiar = el('a', {
      class: 'limpiar cm-btn car-btn-limpiar', href: '#', text: 'Eliminar Todo',
      onclick: async (e) => { e.preventDefault(); await pedir('DELETE', `/api/restaurantes/${rid}/carrito`); recargar(ui); },
    });

    const titulo = el('section', { class: 'car-titulo' }, el('div', { class: 'cm-contenedor car-titulo-fila' },
      el('img', { class: 'car-foto-rest', src: urlSegura(rest.foto, '/img/logo_empresa_comodin.png'), alt: '', width: '72', height: '72' }),
      el('div', {},
        el('span', { class: 'cm-chip', text: 'Tu pedido' }),
        el('h1', { class: 'car-h1', text: 'Productos Agregados para Solicitar' }),
        el('p', { class: 'car-sub', text: rest.nombre }))));

    const tabla = el('div', { class: 'car-tarjeta' }, el('div', { class: 'table-responsive' },
      el('table', { class: 'table car-tabla' },
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col', text: 'Código' }), el('th', { scope: 'col', text: 'Producto' }),
          el('th', { scope: 'col', class: 'car-cant', text: 'Cantidad' }), el('th', { scope: 'col', text: 'Precio' }), el('th', { scope: 'col', class: 'car-accion', text: 'Acción' }))),
        ui.cuerpo,
        el('tfoot', {}, el('tr', { class: 'fila-total' }, el('td', {}), el('th', { scope: 'row', text: 'Total' }), el('td', {}), ui.total, el('td', {}))))));

    const resumen = el('aside', { class: 'car-resumen', 'aria-label': 'Resumen del pedido' },
      el('h2', { class: 'car-resumen-titulo', text: 'Resumen' }),
      el('div', { class: 'car-resumen-linea' }, el('span', { text: 'Cantidad' }), ui.cantidad),
      el('div', { class: 'car-resumen-linea car-resumen-linea-total' }, el('span', { text: 'Total' }), ui.totalResumen),
      ui.listo,
      ui.aviso,
      el('div', { class: 'car-resumen-acciones' },
        el('a', { class: 'cm-btn cm-btn-verde', href: `/restaurantes/${rid}`, text: 'Seguir eligiendo' }),
        ui.limpiar));

    agregar(vaciar(document.getElementById('app')), [
      encabezado(rest),
      titulo,
      el('main', { class: 'cm-seccion car-main' }, el('div', { class: 'cm-contenedor car-grilla' }, tabla, resumen)),
      pieModerno(),
    ]);
    filas(r.datos.items, ui);
    return null;
  }

  iniciar();
})();
