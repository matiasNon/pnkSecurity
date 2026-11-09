// Pagina del carrito (/restaurantes/:id/carrito): GET /api/restaurantes/:id/carrito; eliminar con DELETE.
(function () {
  'use strict';
  const { el, agregar, vaciar, moneda, urlSegura, icono, pedir, cargarSesion, paginaError, ridDeUrl } = window.PNK;
  const rid = ridDeUrl();

  function pieCarrito() {
    return el('footer', { class: 'container contendor' }, el('br'), el('hr'),
      el('div', { class: 'container' }, el('div', { class: 'footer-bottom row align-items-center text-center' },
        el('p', { class: 'footer-text m-0 col-md-12' },
          'Copyright 2020, Todos los Derechos reservados PNK, ', el('br'),
          'Sitio desarrollado para la Explotación de Vulnerabilidades Web, Laboratorio de Programación Segura I', el('br'),
          el('b', { text: 'Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena' }), el('br'), el('br')))));
  }

  function filas(items, cuerpo) {
    vaciar(cuerpo);
    for (const p of items) {
      cuerpo.appendChild(el('tr', {},
        el('th', { scope: 'row', text: p.id }),
        el('td', { text: p.nombre }),
        el('td', { text: moneda(p.precio) }),
        el('td', {}, el('a', {
          class: 'elim', id: String(p.posicion), href: '#', 'aria-label': `Eliminar ${p.nombre}`,
          onclick: async (e) => { e.preventDefault(); await pedir('DELETE', `/api/restaurantes/${rid}/carrito/items/${p.posicion}`); recargar(cuerpo); },
        }, icono('basura')))));
    }
  }

  async function recargar(cuerpo) {
    const r = await pedir('GET', `/api/restaurantes/${rid}/carrito`);
    if (r.ok) filas(r.datos.items, cuerpo);
  }

  async function iniciar() {
    if (rid === null) return paginaError('Restaurante no encontrado');
    await cargarSesion(); // antes que los datos: asi hay una sola sesion (ver carta.js)
    const r = await pedir('GET', `/api/restaurantes/${rid}/carrito`);
    if (r.status === 404) return paginaError('Restaurante no encontrado');
    if (!r.ok) return paginaError('Ha ocurrido un error. Intente nuevamente más tarde.');
    const rest = r.datos.restaurante;
    document.title = rest.nombre;

    const cuerpo = el('tbody');
    const limpiar = el('a', {
      class: 'limpiar', href: '#', text: 'Eliminar Todo',
      onclick: async (e) => { e.preventDefault(); await pedir('DELETE', `/api/restaurantes/${rid}/carrito`); recargar(cuerpo); },
    });

    agregar(vaciar(document.getElementById('app')), [
      el('section', {}, el('div', { class: 'container contendor' }, el('div', { class: 'row' },
        el('div', { class: 'col-lg-4' }, el('div', { class: 'centrado' },
          el('div', { class: 'media' }, el('img', { class: 'logosintituciones', src: '/img/logo.png', width: '170px', alt: '' })), el('br'), el('br'))),
        el('div', { class: 'col-lg-4' }, el('div', { class: 'centrado' },
          el('img', { class: 'logosintituciones', src: urlSegura(rest.foto, '/img/logo_empresa_comodin.png'), width: '170px', alt: '' }))),
        el('div', { class: 'col-lg-4' }, el('div', { class: 'carro' }, el('div', { class: 'media float-right' },
          el('a', { class: 'volver', href: `/restaurantes/${rid}`, text: 'Volver a la Carta' }), '  ', limpiar)))))),
      el('section', {}, el('div', { class: 'container contendor' }, el('div', { class: 'row' }, el('div', { class: 'col-lg-12' },
        el('h4', { class: 'intro-title centrado', text: 'Productos Agregados para Solicitar' }))))),
      el('section', {}, el('div', { class: 'container contendor' }, el('div', { class: 'row' }, el('div', { class: 'col-lg-12' },
        el('table', { class: 'table table-hover table-lg' },
          el('thead', {}, el('tr', {},
            el('th', { scope: 'col', text: 'Código' }), el('th', { scope: 'col', text: 'Producto' }),
            el('th', { scope: 'col', text: 'Precios' }), el('th', { scope: 'col', text: 'Acción' }))),
          cuerpo),
        el('div', {}, el('hr'), el('br'),
          el('h3', { class: 'price-tag text-center', text: '¡¡¡Si estas listo con tu pedido, llama al garzón para solicitarlo!!!' })))))),
      pieCarrito(),
    ]);
    filas(r.datos.items, cuerpo);
    return null;
  }

  iniciar();
})();
