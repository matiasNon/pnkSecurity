// Pagina de la carta (/restaurantes/:id): datos desde GET /api/restaurantes/:id y la sesion desde GET /api/sesion.
(function () {
  'use strict';
  const { el, agregar, vaciar, conSaltos, moneda, urlSegura, icono, pie, pedir, cargarSesion, estado, paginaError, ridDeUrl } = window.PNK;
  const FOTO_PRODUCTO = '/imagenes/producto.jpg';

  const rid = ridDeUrl();

  // ---------- Barra de sesion (login / bienvenida / cerrar sesion) ----------
  function barraSesion() {
    const nav = el('nav', { class: 'navbar navbar-light bg-light', id: 'barra-sesion' });
    if (!estado.usuario) {
      const aviso = el('span', { class: 'text-danger ml-3', role: 'alert', hidden: true });
      const usuario = el('input', { type: 'email', class: 'form-control', name: 'email', placeholder: 'Usuario', maxlength: 255, autocomplete: 'username', required: true });
      const clave = el('input', { type: 'password', class: 'form-control', name: 'password', placeholder: 'Contraseña', maxlength: 128, autocomplete: 'current-password', required: true });
      const form = el('form', { class: 'form-inline barra-login', 'aria-label': 'Iniciar sesión' },
        el('div', { class: 'input-group' },
          el('div', { class: 'input-group-prepend' }, el('span', { class: 'input-group-text', 'aria-hidden': 'true', text: '@' })),
          usuario),
        clave,
        el('button', { type: 'submit', class: 'btn btn-outline-primary', text: 'Ingresar' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await pedir('POST', '/api/login', { email: usuario.value, password: clave.value });
        if (r.ok) {
          estado.usuario = r.datos.usuario;
          estado.csrf = r.datos.csrf;
          location.reload();
          return;
        }
        clave.value = '';
        aviso.textContent = r.datos.error || 'No se pudo iniciar sesión.';
        aviso.hidden = false;
      });
      return agregar(nav, [form, aviso]);
    }
    const salir = el('form', { class: 'form-inline' },
      el('button', { type: 'submit', class: 'btn btn-link', text: 'Cerrar sesión' }));
    salir.addEventListener('submit', async (e) => {
      e.preventDefault();
      await pedir('POST', '/api/logout');
      location.reload();
    });
    return agregar(nav, [
      el('span', { class: 'barra-saludo', text: `Bienvenido: ${estado.usuario.nombre}` }),
      estado.usuario.rol === 'admin' ? el('a', { class: 'btn btn-success my-2 my-sm-0', href: '/admin', text: 'Administrar carta (CRUD)' }) : null,
      salir,
    ]);
  }

  // ---------- Encabezado del restaurante ----------
  function encabezado(r) {
    const contacto = [];
    if (r.fono) contacto.push(icono('telefono'), ` ${r.fono} `);
    if (r.email) contacto.push(icono('correo'), ` ${r.email}`);
    return el('section', {},
      el('div', { class: 'container contendor' },
        el('div', { class: 'row' },
          el('div', { class: 'col-lg-4' }, el('div', { class: 'centrado' }, el('div', { class: 'media' },
            el('img', { class: 'logosintituciones', src: '/img/logo.png', width: '190px', alt: '' })))),
          el('div', { class: 'col-lg-4' }, el('div', { class: 'centrado' }, el('div', { class: 'media' },
            el('img', { class: 'logosintituciones', src: urlSegura(r.foto, '/img/logo_empresa_comodin.png'), width: '170px', alt: '' })))),
          el('div', { class: 'col-lg-4' }, el('div', { class: 'carro' }, el('div', { class: 'media float-right' },
            el('a', { class: 'button_carrito', href: `/restaurantes/${r.id}/carrito` }, icono('carrito'), ' Productos Seleccionados'))))),
        el('div', { class: 'row' }, el('div', { class: 'col-lg-12' }, el('div', { class: 'text-center' },
          el('h4', { text: r.nombre }),
          el('h5', {}, icono('ubicacion'), ` ${r.calle} #${r.numero}, ${r.comuna}`),
          el('h5', {}, contacto))))));
  }

  // Siempre 5 estrellas: las de la puntuacion en dorado y el resto apagadas (antes solo se dibujaban las llenas).
  function estrellas(n) {
    const ul = el('ul', { class: 'rating-star', role: 'img', 'aria-label': `Puntuación ${n} de 5` });
    for (let i = 1; i <= 5; i++) ul.appendChild(el('li', { class: i <= n ? 'llena' : 'vacia', 'aria-hidden': 'true' }, el('i', { class: 'ti-star' })));
    return ul;
  }

  function botonSeleccionar(id, clase) {
    return el('a', { class: clase, href: '#', id: String(id), text: 'Seleccionar', onclick: (e) => { e.preventDefault(); agregarAlCarrito(id); } });
  }

  function tiempo(t) {
    return t ? [icono('reloj'), ` ${t}`] : [];
  }

  // ---------- Destacados (carrusel) ----------
  function destacados(lista) {
    if (lista.length === 0) return null;
    const carrusel = el('div', { class: 'owl-carousel owl-theme featured-carousel' },
      lista.map((d) => el('div', { class: 'featured-item' },
        el('img', { class: 'card-img rounded-0', width: '350px', height: '235px', src: urlSegura(d.foto, FOTO_PRODUCTO), alt: '' }),
        el('div', { class: 'item-body' },
          el('h3', { text: d.nombre }),
          el('p', {}, d.descripcion, el('br'), d.observaciones, el('br'), tiempo(d.tiempo)),
          el('div', { class: 'd-flex justify-content-between' },
            estrellas(d.puntuacion),
            el('h3', { class: 'price-tag', text: moneda(d.precio) })),
          botonSeleccionar(d.id, 'button sin-margen')))));
    return el('section', { class: 'destacados' }, el('div', { class: 'container contendor' },
      el('div', { class: 'section-intro' }, el('h4', { class: 'intro-title', text: 'Menús Destacados' })),
      carrusel));
  }

  // ---------- Cartas (pestanas) -> categorias -> productos ----------
  function sinInformacion(texto) {
    return el('div', { class: 'row' }, el('div', { class: 'col-lg-12' }, el('div', { class: 'text-center' }, el('h4', { text: texto }))));
  }

  function producto(it, varios) {
    return el('div', { class: varios ? 'col-lg-6' : 'col-lg-12' },
      el('div', { class: 'media align-items-center food-card' },
        el('img', { class: 'mr-3 mr-sm-4', src: urlSegura(it.foto, FOTO_PRODUCTO), alt: '', width: '120px' }),
        el('div', { class: 'media-body' },
          el('div', { class: 'd-flex justify-content-between food-card-title' },
            el('h4', { text: it.nombre }),
            el('h3', { class: 'price-tag', text: moneda(it.precio) })),
          el('p', {}, it.descripcion, el('br'), it.observaciones),
          it.tiempo ? el('p', {}, tiempo(it.tiempo)) : null,
          estrellas(it.puntuacion),
          botonSeleccionar(it.id, 'button float-right'))));
  }

  function cartas(lista) {
    const paneles = lista.length > 0 ? lista : [{ id: 0, nombre: '', categorias: [] }];
    const pestanas = el('div', { class: 'nav nav-tabs nav-fill', id: 'nav-tab', role: 'tablist' },
      lista.map((c, i) => el('a', {
        class: `nav-item nav-link${i === 0 ? ' active' : ''}`, id: `nav-carta-${c.id}-tab`, 'data-toggle': 'tab', href: `#carta-${c.id}`,
        role: 'tab', 'aria-controls': `carta-${c.id}`, 'aria-selected': i === 0 ? 'true' : 'false', text: c.nombre,
      })));
    const contenido = el('div', { class: 'tab-content py-3 px-3 px-sm-0', id: 'nav-tabContent' },
      paneles.map((p, i) => el('div', {
        class: `tab-pane fade${i === 0 ? ' show active' : ''}`, id: `carta-${p.id}`, role: 'tabpanel', 'aria-labelledby': `nav-carta-${p.id}-tab`,
      }, p.categorias.length === 0
        ? sinInformacion('No hay información para Mostrar')
        : p.categorias.map((cat) => [
          el('div', { class: 'section-intro mb-20px' }, el('h4', { class: 'intro-title', text: cat.nombre })),
          el('div', { class: 'row' }, cat.items.length > 0
            ? cat.items.map((it) => producto(it, cat.items.length > 1))
            : el('div', { class: 'col-lg-12' }, el('p', { class: 'vacio', text: 'Aún no hay productos en esta categoría.' }))),
        ]))));
    return el('section', {}, el('div', { class: 'container contendor' }, el('div', { class: 'container' },
      el('div', { class: 'row' }, el('div', { class: 'col-lg-12' }, el('nav', {}, pestanas), contenido)))));
  }

  // ---------- Comentarios ----------
  function tarjetaComentario(c) {
    return [el('div', { class: 'card bg-light' }, el('div', { class: 'card-body' },
      el('b', { text: c.usuario }), el('br'), conSaltos(c.comentario))), el('br')];
  }

  function comentarios(lista) {
    const aviso = el('div', { role: 'alert', hidden: true });
    const vacio = el('p', { class: 'vacio', text: 'Todavía no hay comentarios. ¡Sé el primero en opinar!', hidden: lista.length > 0 });
    const listado = el('div', { id: 'comentarios' }, lista.map(tarjetaComentario));
    let form = el('p', { class: 'vacio', text: 'Inicia sesión arriba para dejar tu comentario.' });
    if (estado.usuario) {
      const texto = el('textarea', { class: 'form-control', rows: 5, id: 'comentario', name: 'comentario', maxlength: 1000, required: true });
      form = el('form', {},
        el('div', { class: 'form-group' },
          el('label', { for: 'usuario', text: 'Nombre:' }),
          el('input', { type: 'text', class: 'form-control', id: 'usuario', value: estado.usuario.nombre, readonly: true })),
        el('div', { class: 'form-group' }, el('label', { for: 'comentario', text: 'Comentario:' }), texto),
        el('button', { type: 'submit', class: 'btn btn-success fa-align-right', text: 'Comentar' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await pedir('POST', `/api/restaurantes/${rid}/comentarios`, { comentario: texto.value });
        aviso.hidden = false;
        if (r.ok) {
          aviso.className = 'alert alert-success';
          aviso.textContent = 'Comentario publicado.';
          texto.value = '';
          vacio.hidden = true;
          agregar(listado, tarjetaComentario(r.datos.comentario));
        } else {
          aviso.className = `alert alert-${r.status === 429 || r.status === 401 ? 'warning' : 'danger'}`;
          aviso.textContent = r.status === 401 ? 'Su sesión expiró. Inicie sesión e intente comentar nuevamente.'
            : (r.datos.error || 'No se pudo publicar el comentario. Intente nuevamente.');
        }
      });
    }
    return el('section', {}, el('div', { class: 'container contendor' }, el('div', { class: 'container' },
      el('div', { class: 'row' }, el('div', { class: 'col-lg-12' },
        el('div', { class: 'section-intro' }, el('h4', { class: 'intro-title', text: 'Comentarios' }), aviso, form),
        el('br'), vacio, listado, el('hr'))))));
  }

  // ---------- Carrito ----------
  async function agregarAlCarrito(id) {
    const r = await pedir('POST', `/api/restaurantes/${rid}/carrito/items`, { iditems: id });
    const texto = document.getElementById('modal-texto');
    texto.textContent = r.ok ? 'El producto seleccionado, ha sido agregado sin problemas!!!'
      : (r.datos.error || 'No se pudo agregar el producto.');
    window.jQuery('#myModal').modal('show');
  }

  function iniciarCarrusel() {
    const $ = window.jQuery;
    if (!$ || !$.fn.owlCarousel || !$('.featured-carousel').length) return;
    $('.featured-carousel').owlCarousel({
      loop: false, margin: 30, items: 1, nav: true, dots: false, responsiveClass: true,
      navText: ["<div class='left-arrow'><i class='ti-angle-left'></i></div>", "<div class='right-arrow'><i class='ti-angle-right'></i></div>"],
      responsive: { 768: { items: 2 }, 1100: { items: 3 } },
    });
  }

  async function iniciar() {
    if (rid === null) return paginaError('Restaurante no encontrado');
    // Primero la sesion (crea la cookie) y despues los datos: en paralelo, sin cookie, nacerian dos sesiones distintas
    // y el token CSRF quedaria de la que no se guardo (el primer login responderia 403).
    await cargarSesion();
    const carta = await pedir('GET', `/api/restaurantes/${rid}`);
    if (carta.status === 404) return paginaError('Restaurante no encontrado');
    if (!carta.ok) return paginaError('Ha ocurrido un error. Intente nuevamente más tarde.');
    const d = carta.datos;
    document.title = d.restaurante.nombre;
    agregar(vaciar(document.getElementById('app')), [
      barraSesion(), encabezado(d.restaurante), destacados(d.destacados), cartas(d.cartas), comentarios(d.comentarios), pie(),
    ]);
    iniciarCarrusel();
    return null;
  }

  iniciar();
})();
