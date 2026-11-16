// Pagina de seleccion de restaurante (/restaurantes): lista todos los restaurantes con su foto, direccion y numero de cartas,
// con buscador por nombre. Solo lectura (GET /api/restaurantes). Cada tarjeta lleva a la carta publica (/restaurantes/:id).
// Seguridad: todo dato se inserta como texto (el() usa textContent/setAttribute); las imagenes pasan por urlSegura().
(function () {
  'use strict';
  const { el, agregar, vaciar, pedir, cargarSesion, urlSegura, estado } = window.PNK;
  const LOGO_VACIO = '/img/logo_empresa_comodin.png';
  const app = document.getElementById('app');

  function encabezado() {
    const u = estado.usuario;
    return el('header', { class: 'cm-header' }, el('div', { class: 'cm-contenedor cm-header-fila' },
      el('a', { class: 'cm-logo', href: '/restaurantes', 'aria-label': 'Inicio: lista de restaurantes' },
        el('img', { src: '/img/logo.png', alt: 'PNK', width: '150', height: '42' })),
      el('div', { class: 'cm-header-acciones' },
        u ? el('span', { class: 'cm-saludo', text: `Hola, ${u.nombre}` }) : null,
        u && u.rol === 'admin' ? el('a', { class: 'cm-btn cm-btn-verde', href: '/admin', text: 'Administrar mi carta' }) : null)));
  }

  function direccion(r) {
    return [`${r.calle || ''} ${r.numero || ''}`.trim(), r.comuna].filter(Boolean).join(', ');
  }

  function tarjeta(r) {
    const foto = urlSegura(r.foto, LOGO_VACIO);
    const img = el('img', { src: foto, alt: `Foto de ${r.nombre}`, loading: 'lazy', width: '400', height: '240' });
    // Si la foto no existe en el servidor (restaurantes sin imagen propia) se usa el logo generico.
    img.addEventListener('error', () => { if (!img.src.endsWith(LOGO_VACIO)) img.src = LOGO_VACIO; }, { once: true });
    const hay = r.cartas > 0;
    return el('article', { class: `rs-tarjeta${hay ? '' : ' rs-sin-cartas'}` },
      el('a', { class: 'rs-foto', href: `/restaurantes/${r.id}`, tabindex: '-1', 'aria-hidden': 'true' }, img),
      el('div', { class: 'rs-cuerpo' },
        el('span', { class: `rs-etiqueta${hay ? '' : ' vacia'}`, text: hay ? `${r.cartas} ${r.cartas === 1 ? 'carta' : 'cartas'}` : 'Sin cartas aún' }),
        el('h2', { class: 'rs-nombre', text: r.nombre }),
        el('p', { class: 'rs-direccion' }, el('i', { class: 'ti-location-pin', 'aria-hidden': 'true' }), ' ', direccion(r) || 'Dirección no informada'),
        el('a', { class: 'cm-btn cm-btn-verde rs-ver', href: `/restaurantes/${r.id}`, 'aria-label': `Ver la carta de ${r.nombre}`, text: 'Ver carta' })));
  }

  function pintar(lista, restaurantes, filtro) {
    const q = filtro.trim().toLowerCase();
    const visibles = restaurantes.filter((r) => r.nombre.toLowerCase().includes(q));
    vaciar(lista);
    if (visibles.length === 0) {
      agregar(lista, [el('p', { class: 'rs-vacio', text: 'No hay restaurantes que coincidan con tu búsqueda.' })]);
      return;
    }
    agregar(lista, visibles.map(tarjeta));
  }

  function pagina(restaurantes) {
    const lista = el('div', { class: 'rs-grilla' });
    const buscador = el('input', {
      type: 'search', class: 'rs-buscador', id: 'buscar', placeholder: 'Buscar restaurante…', autocomplete: 'off', 'aria-label': 'Buscar restaurante por nombre',
    });
    buscador.addEventListener('input', () => pintar(lista, restaurantes, buscador.value));
    pintar(lista, restaurantes, '');
    agregar(vaciar(app), [
      encabezado(),
      el('main', { class: 'rs-main' },
        el('section', { class: 'rs-hero' }, el('div', { class: 'cm-contenedor' },
          el('span', { class: 'rs-chip', text: 'Carta digital' }),
          el('h1', { text: 'Elige tu restaurante' }),
          el('p', { text: 'Mira la carta de cada local, arma tu pedido y cuéntanos qué te pareció.' }),
          el('div', { class: 'rs-buscar' }, buscador))),
        el('section', { class: 'cm-contenedor rs-lista', 'aria-label': 'Restaurantes' },
          el('p', { class: 'rs-conteo', text: `${restaurantes.length} ${restaurantes.length === 1 ? 'restaurante' : 'restaurantes'}` }),
          lista)),
      el('footer', { class: 'cm-pie' }, el('div', { class: 'cm-contenedor' },
        el('p', {}, 'Copyright 2020, Todos los Derechos reservados PNK. ', el('b', { text: 'Inacap Sede La Serena' })))),
    ]);
  }

  async function iniciar() {
    await cargarSesion();
    const r = await pedir('GET', '/api/restaurantes');
    if (!r.ok || !Array.isArray(r.datos.restaurantes)) {
      window.PNK.paginaError('No pudimos cargar los restaurantes');
      return;
    }
    pagina(r.datos.restaurantes);
  }

  iniciar();
})();
