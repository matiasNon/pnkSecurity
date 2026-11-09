// Pagina de la carta (/restaurantes/:id): datos desde GET /api/restaurantes/:id y la sesion desde GET /api/sesion.
// Diseno moderno (nov-2026): encabezado fijo con carrito, hero con el plato destacado que rota solo, pestanas tipo
// pildora y productos en tarjetas con foto. Se conserva toda la funcionalidad: login/logout, carrito, comentarios,
// enlace al panel (CRUD) para administradores.
// Seguridad: todo dato de la API se inserta como texto (el() usa textContent/setAttribute); nunca innerHTML.
(function () {
  'use strict';
  const { el, agregar, vaciar, conSaltos, moneda, urlSegura, icono, pedir, cargarSesion, estado, paginaError, ridDeUrl } = window.PNK;
  const FOTO_PRODUCTO = '/imagenes/producto.jpg';
  const ROTACION_MS = 6000;
  const sinMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rid = ridDeUrl();
  let contadorCarrito = null;

  // ---------- Encabezado fijo: logo, sesion y carrito ----------
  function formLogin() {
    const aviso = el('span', { class: 'cm-aviso', role: 'alert', hidden: true });
    const usuario = el('input', { type: 'email', class: 'form-control', name: 'email', placeholder: 'Usuario', 'aria-label': 'Correo', maxlength: 255, autocomplete: 'username', required: true });
    const clave = el('input', { type: 'password', class: 'form-control', name: 'password', placeholder: 'Contraseña', 'aria-label': 'Contraseña', maxlength: 128, autocomplete: 'current-password', required: true });
    const form = el('form', { class: 'cm-login', 'aria-label': 'Iniciar sesión' },
      usuario, clave, el('button', { type: 'submit', class: 'cm-btn cm-btn-claro', text: 'Ingresar' }));
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
    // En celular el formulario se despliega desde un boton (details/summary: accesible sin JS extra).
    const ancho = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
    return el('details', { class: 'cm-cuenta', open: ancho },
      el('summary', { class: 'cm-btn cm-btn-claro', text: 'Iniciar sesión' }),
      el('div', { class: 'cm-cuenta-panel' }, form, aviso));
  }

  function zonaSesion() {
    if (!estado.usuario) return formLogin();
    const salir = el('form', { class: 'cm-salir' }, el('button', { type: 'submit', class: 'cm-btn cm-btn-texto', text: 'Cerrar sesión' }));
    salir.addEventListener('submit', async (e) => {
      e.preventDefault();
      await pedir('POST', '/api/logout');
      location.reload();
    });
    return el('div', { class: 'cm-sesion' },
      el('span', { class: 'cm-saludo', text: `Bienvenido: ${estado.usuario.nombre}` }),
      estado.usuario.rol === 'admin' ? el('a', { class: 'cm-btn cm-btn-verde', href: '/admin', text: 'Administrar carta (CRUD)' }) : null,
      salir);
  }

  function encabezado(r) {
    contadorCarrito = el('span', { class: 'cm-contador', 'aria-label': 'productos en el carrito', text: '0' });
    return el('header', { class: 'cm-header' }, el('div', { class: 'cm-contenedor cm-header-fila' },
      el('a', { class: 'cm-logo', href: `/restaurantes/${r.id}`, 'aria-label': `Inicio de ${r.nombre}` },
        el('img', { src: '/img/logo.png', alt: 'PNK', width: '150', height: '42' })),
      el('div', { class: 'cm-header-acciones' },
        zonaSesion(),
        el('a', { class: 'cm-btn cm-btn-carrito', href: `/restaurantes/${r.id}/carrito` },
          icono('carrito'), el('span', { class: 'cm-carrito-texto', text: 'Productos Seleccionados' }), contadorCarrito))));
  }

  async function actualizarContador(animar) {
    const r = await pedir('GET', `/api/restaurantes/${rid}/carrito`);
    if (!r.ok || !contadorCarrito) return;
    contadorCarrito.textContent = String(r.datos.items.length);
    if (animar && !sinMovimiento) {
      contadorCarrito.classList.remove('cm-pulso');
      void contadorCarrito.offsetWidth; // reinicia la animacion
      contadorCarrito.classList.add('cm-pulso');
    }
  }

  // ---------- Piezas comunes ----------
  function estrellas(n) {
    const ul = el('ul', { class: 'rating-star', role: 'img', 'aria-label': `Puntuación ${n} de 5` });
    for (let i = 1; i <= 5; i++) ul.appendChild(el('li', { class: i <= n ? 'llena' : 'vacia', 'aria-hidden': 'true' }, el('i', { class: 'ti-star' })));
    return ul;
  }

  function botonSeleccionar(id, clase) {
    return el('a', {
      class: `button ${clase}`, href: '#', id: String(id), role: 'button', text: 'Seleccionar',
      onclick: (e) => { e.preventDefault(); agregarAlCarrito(id); },
    });
  }

  function tiempo(t) {
    return t ? el('span', { class: 'cm-tiempo' }, icono('reloj'), ` ${t}`) : null;
  }

  // ---------- Hero: plato destacado que rota solo (pausa al pasar el mouse o con el foco) ----------
  function hero(r, lista) {
    const info = el('div', { class: 'cm-hero-info' },
      el('h1', { class: 'cm-restaurante', text: r.nombre }),
      el('p', { class: 'cm-direccion' }, icono('ubicacion'), ` ${r.calle} #${r.numero}, ${r.comuna}`),
      el('p', { class: 'cm-contacto' },
        r.fono ? el('span', {}, icono('telefono'), ` ${r.fono}`) : null,
        r.email ? el('span', {}, icono('correo'), ` ${r.email}`) : null));

    if (lista.length === 0) {
      return el('section', { class: 'cm-hero cm-hero-simple' }, el('div', { class: 'cm-contenedor' }, info));
    }

    const diapositivas = lista.map((d, i) => el('article', {
      class: `cm-slide${i === 0 ? ' activa' : ''}`, 'data-slide': String(i), 'aria-roledescription': 'diapositiva',
      'aria-label': `${i + 1} de ${lista.length}: ${d.nombre}`, hidden: i !== 0,
    },
      el('div', { class: 'cm-slide-texto' },
        el('span', { class: 'cm-chip', text: 'Menús Destacados' }),
        el('h2', { class: 'cm-plato', text: d.nombre }),
        el('p', { class: 'cm-descripcion' }, d.descripcion, d.observaciones ? el('br') : null, d.observaciones),
        el('div', { class: 'cm-meta' }, tiempo(d.tiempo), estrellas(d.puntuacion)),
        el('div', { class: 'cm-compra' },
          el('span', { class: 'cm-precio-grande price-tag', text: moneda(d.precio) }),
          botonSeleccionar(d.id, 'cm-btn cm-btn-verde cm-btn-grande'))),
      el('div', { class: 'cm-slide-foto' },
        el('img', { src: urlSegura(d.foto, FOTO_PRODUCTO), alt: d.nombre, width: '560', height: '400', loading: i === 0 ? 'eager' : 'lazy' }))));

    const miniaturas = lista.length > 1 ? el('div', { class: 'cm-miniaturas', role: 'tablist', 'aria-label': 'Elegir plato destacado' },
      lista.map((d, i) => el('button', {
        type: 'button', class: `cm-mini${i === 0 ? ' activa' : ''}`, role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false',
        'aria-label': d.nombre, onclick: () => { mostrar(i); reiniciar(); },
      }, el('img', { src: urlSegura(d.foto, FOTO_PRODUCTO), alt: '', width: '64', height: '64' })))) : null;

    let actual = 0;
    let temporizador = null;
    function mostrar(i) {
      diapositivas[actual].classList.remove('activa');
      diapositivas[actual].hidden = true;
      actual = (i + lista.length) % lista.length;
      diapositivas[actual].hidden = false;
      // reflow para que la transicion de entrada se aplique despues de quitar hidden
      void diapositivas[actual].offsetWidth;
      diapositivas[actual].classList.add('activa');
      if (miniaturas) {
        [...miniaturas.children].forEach((b, j) => { b.classList.toggle('activa', j === actual); b.setAttribute('aria-selected', j === actual ? 'true' : 'false'); });
      }
    }
    function iniciarRotacion() {
      if (sinMovimiento || lista.length < 2 || temporizador) return;
      temporizador = setInterval(() => mostrar(actual + 1), ROTACION_MS);
    }
    function detener() { clearInterval(temporizador); temporizador = null; }
    function reiniciar() { detener(); iniciarRotacion(); }

    const carrusel = el('div', { class: 'cm-carrusel', 'aria-roledescription': 'carrusel', 'aria-label': 'Platos destacados' },
      diapositivas, miniaturas);
    carrusel.addEventListener('mouseenter', detener);
    carrusel.addEventListener('mouseleave', iniciarRotacion);
    carrusel.addEventListener('focusin', detener);
    carrusel.addEventListener('focusout', iniciarRotacion);
    iniciarRotacion();

    return el('section', { class: 'cm-hero' }, el('div', { class: 'cm-contenedor' }, info, carrusel));
  }

  // ---------- Cartas (pestanas tipo pildora) -> categorias -> tarjetas de producto ----------
  function tarjeta(it) {
    return el('article', { class: 'cm-tarjeta' },
      el('div', { class: 'cm-tarjeta-foto' },
        el('img', { src: urlSegura(it.foto, FOTO_PRODUCTO), alt: it.nombre, width: '400', height: '300', loading: 'lazy' })),
      el('div', { class: 'cm-tarjeta-cuerpo' },
        el('h4', { class: 'cm-tarjeta-nombre', text: it.nombre }),
        (it.descripcion || it.observaciones)
          ? el('p', { class: 'cm-tarjeta-desc' }, it.descripcion, it.descripcion && it.observaciones ? ' · ' : '', it.observaciones) : null,
        el('div', { class: 'cm-meta' }, tiempo(it.tiempo), estrellas(it.puntuacion)),
        el('div', { class: 'cm-tarjeta-pie' },
          el('span', { class: 'cm-precio price-tag', text: moneda(it.precio) }),
          botonSeleccionar(it.id, 'cm-btn cm-btn-azul'))));
  }

  function cartas(lista) {
    if (lista.length === 0) {
      return el('section', { class: 'cm-seccion' }, el('div', { class: 'cm-contenedor' },
        el('p', { class: 'vacio', text: 'No hay información para Mostrar' })));
    }
    // Se abre la primera carta que tenga productos (si "Vinos" esta vacia, el visitante no ve una pagina vacia).
    const tieneProductos = (c) => c.categorias.some((k) => k.items.length > 0);
    const inicial = Math.max(0, lista.findIndex(tieneProductos));

    const pestanas = el('div', { class: 'nav cm-pestanas', id: 'nav-tab', role: 'tablist' },
      lista.map((c, i) => el('a', {
        class: `nav-item nav-link cm-pestana${i === inicial ? ' active' : ''}`, id: `nav-carta-${c.id}-tab`, 'data-toggle': 'tab',
        href: `#carta-${c.id}`, role: 'tab', 'aria-controls': `carta-${c.id}`, 'aria-selected': i === inicial ? 'true' : 'false', text: c.nombre,
      })));
    const contenido = el('div', { class: 'tab-content cm-paneles', id: 'nav-tabContent' },
      lista.map((p, i) => el('div', {
        class: `tab-pane fade${i === inicial ? ' show active' : ''}`, id: `carta-${p.id}`, role: 'tabpanel', 'aria-labelledby': `nav-carta-${p.id}-tab`,
      },
      // Portada de la carta (foto subida desde el panel): banner con el nombre encima.
      urlSegura(p.foto, null) ? el('div', { class: 'cm-portada' },
        el('img', { src: urlSegura(p.foto, null), alt: '', width: '1180', height: '300', loading: i === inicial ? 'eager' : 'lazy' }),
        el('span', { class: 'cm-portada-nombre', text: p.nombre })) : null,
      p.categorias.length === 0
        ? el('p', { class: 'vacio', text: 'No hay información para Mostrar' })
        : p.categorias.map((cat) => el('div', { class: 'cm-categoria' },
          el('h3', { class: 'cm-categoria-titulo', text: cat.nombre }),
          cat.items.length > 0
            ? el('div', { class: 'cm-grilla' }, cat.items.map(tarjeta))
            : el('p', { class: 'vacio', text: 'Aún no hay productos en esta categoría.' }))))));

    return el('section', { class: 'cm-seccion', id: 'carta' }, el('div', { class: 'cm-contenedor' },
      el('div', { class: 'cm-seccion-cabecera' },
        el('h2', { class: 'cm-seccion-titulo', text: 'Nuestra carta' })),
      el('nav', { class: 'cm-nav-cartas', 'aria-label': 'Cartas' }, pestanas),
      contenido));
  }

  // ---------- Comentarios ----------
  function tarjetaComentario(c) {
    return el('div', { class: 'card cm-comentario' }, el('div', { class: 'card-body' },
      el('span', { class: 'cm-avatar', 'aria-hidden': 'true', text: String(c.usuario || '?').trim().charAt(0).toUpperCase() }),
      el('div', {}, el('b', { text: c.usuario }), el('p', { class: 'cm-comentario-texto' }, conSaltos(c.comentario)))));
  }

  function comentarios(lista) {
    const aviso = el('div', { role: 'alert', hidden: true });
    const vacio = el('p', { class: 'vacio', text: 'Todavía no hay comentarios. ¡Sé el primero en opinar!', hidden: lista.length > 0 });
    const listado = el('div', { id: 'comentarios', class: 'cm-comentarios' }, lista.map(tarjetaComentario));
    let form = el('p', { class: 'vacio', text: 'Inicia sesión arriba para dejar tu comentario.' });
    if (estado.usuario) {
      const texto = el('textarea', { class: 'form-control', rows: 4, id: 'comentario', name: 'comentario', maxlength: 1000, required: true, placeholder: '¿Qué te pareció?' });
      form = el('form', { class: 'cm-form-comentario' },
        el('label', { for: 'comentario', text: `Comentando como ${estado.usuario.nombre}` }), texto,
        el('button', { type: 'submit', class: 'cm-btn cm-btn-verde', text: 'Comentar' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await pedir('POST', `/api/restaurantes/${rid}/comentarios`, { comentario: texto.value });
        aviso.hidden = false;
        if (r.ok) {
          aviso.className = 'alert alert-success';
          aviso.textContent = 'Comentario publicado.';
          texto.value = '';
          vacio.hidden = true;
          listado.prepend(tarjetaComentario(r.datos.comentario));
        } else {
          aviso.className = `alert alert-${r.status === 429 || r.status === 401 ? 'warning' : 'danger'}`;
          aviso.textContent = r.status === 401 ? 'Su sesión expiró. Inicie sesión e intente comentar nuevamente.'
            : (r.datos.error || 'No se pudo publicar el comentario. Intente nuevamente.');
        }
      });
    }
    return el('section', { class: 'cm-seccion cm-seccion-suave' }, el('div', { class: 'cm-contenedor cm-dos-columnas' },
      el('div', {}, el('h2', { class: 'cm-seccion-titulo', text: 'Comentarios' }), aviso, form),
      el('div', {}, vacio, listado)));
  }

  function pieModerno() {
    return el('footer', { class: 'cm-pie' }, el('div', { class: 'cm-contenedor' },
      el('img', { src: '/img/logo.png', alt: 'PNK', width: '120', height: '34', class: 'cm-pie-logo' }),
      el('p', {}, 'Copyright 2020, Todos los Derechos reservados PNK.', el('br'),
        'Sitio desarrollado para la Explotación de Vulnerabilidades Web, Laboratorio de Programación Segura I', el('br'),
        el('b', { text: 'Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena' }))));
  }

  // ---------- Carrito ----------
  async function agregarAlCarrito(id) {
    const r = await pedir('POST', `/api/restaurantes/${rid}/carrito/items`, { iditems: id });
    const texto = document.getElementById('modal-texto');
    texto.textContent = r.ok ? 'El producto seleccionado, ha sido agregado sin problemas!!!'
      : (r.datos.error || 'No se pudo agregar el producto.');
    window.jQuery('#myModal').modal('show');
    if (r.ok) actualizarContador(true);
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
      encabezado(d.restaurante), hero(d.restaurante, d.destacados), cartas(d.cartas), comentarios(d.comentarios), pieModerno(),
    ]);
    actualizarContador(false);
    return null;
  }

  iniciar();
})();
