// Utilidades comunes del frontend: cliente de la API (con token CSRF), construccion segura del DOM y piezas
// repetidas (pie de pagina, iconos, pagina de error).
// Seguridad (ASVS v5 V1.2 / V3): los datos de la API se insertan SIEMPRE como texto (textContent / atributos con
// setAttribute); nunca se usa innerHTML con datos, asi un comentario con <script> se muestra como texto.
(function (global) {
  'use strict';

  const estado = { csrf: null, usuario: null };

  // --- API ---------------------------------------------------------------------------------------------
  // Devuelve { ok, status, datos }. Si el token CSRF vencio (403 codigo "csrf") pide uno nuevo y reintenta una vez.
  async function pedir(metodo, ruta, cuerpo, reintento) {
    const opciones = {
      method: metodo,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    };
    if (metodo !== 'GET') opciones.headers['X-CSRF-Token'] = estado.csrf || '';
    if (cuerpo instanceof FormData) {
      opciones.body = cuerpo; // multipart (el navegador pone el boundary)
    } else if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    let res;
    try {
      res = await fetch(ruta, opciones);
    } catch {
      return { ok: false, status: 0, datos: { error: 'No se pudo conectar con el servidor.' } };
    }
    let datos = {};
    try {
      datos = await res.json();
    } catch {
      datos = {};
    }
    if (res.status === 403 && datos.codigo === 'csrf' && !reintento && metodo !== 'GET') {
      await cargarSesion();
      return pedir(metodo, ruta, cuerpo, true);
    }
    return { ok: res.ok, status: res.status, datos };
  }

  async function cargarSesion() {
    const r = await pedir('GET', '/api/sesion');
    if (r.ok) {
      estado.csrf = r.datos.csrf;
      estado.usuario = r.datos.usuario;
    }
    return estado;
  }

  // --- DOM seguro ------------------------------------------------------------------------------------------
  // el('a', { class: 'btn', href: '/x', text: 'Hola' }, hijo1, 'texto', ...)
  function el(etiqueta, atributos, ...hijos) {
    const nodo = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(atributos || {})) {
      if (valor === null || valor === undefined || valor === false) continue;
      if (clave === 'text') nodo.textContent = String(valor);
      else if (clave === 'class') nodo.className = valor;
      else if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2), valor);
      else nodo.setAttribute(clave, valor === true ? '' : String(valor));
    }
    agregar(nodo, hijos);
    return nodo;
  }

  function agregar(nodo, hijos) {
    // flat(Infinity): las vistas anidan listas (cartas -> categorias -> [titulo, fila]).
    for (const h of hijos.flat(Infinity)) {
      if (h === null || h === undefined || h === false) continue;
      if (typeof h === 'string' || typeof h === 'number') nodo.appendChild(document.createTextNode(String(h)));
      else if (h instanceof Node) nodo.appendChild(h);
      else throw new TypeError('el(): hijo no valido');
    }
    return nodo;
  }

  function vaciar(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
    return nodo;
  }

  // Texto con saltos de linea -> nodos de texto + <br> (equivale a nl2br(e($texto)) sin tocar innerHTML).
  function conSaltos(texto) {
    const partes = String(texto ?? '').split(/\r\n|\r|\n/);
    const salida = [];
    partes.forEach((p, i) => {
      if (i > 0) salida.push(document.createElement('br'));
      salida.push(document.createTextNode(p));
    });
    return salida;
  }

  // 12500 -> "$ 12.500"
  function moneda(numero) {
    const n = Math.trunc(Number(numero)) || 0;
    return '$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Solo URLs relativas del propio sitio (las entrega la API ya validadas; se vuelve a comprobar aqui).
  function urlSegura(url, porDefecto) {
    return typeof url === 'string' && /^\/(imagenes|uploads)\/cod[0-9]{1,10}\/[A-Za-z0-9._-]{1,100}$/.test(url) ? url : porDefecto;
  }

  const ICONOS = {
    carrito: ['2em', ['M0 2.5A.5.5 0 0 1 .5 2H2a.5.5 0 0 1 .485.379L2.89 4H14.5a.5.5 0 0 1 .485.621l-1.5 6A.5.5 0 0 1 13 11H4a.5.5 0 0 1-.485-.379L1.61 3H.5a.5.5 0 0 1-.5-.5zM3.14 5l.5 2H5V5H3.14zM6 5v2h2V5H6zm3 0v2h2V5H9zm3 0v2h1.36l.5-2H12zm1.11 3H12v2h.61l.5-2zM11 8H9v2h2V8zM8 8H6v2h2V8zM5 8H3.89l.5 2H5V8zm0 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 1a2 2 0 1 1 4 0 2 2 0 0 1-4 0zm9-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 1a2 2 0 1 1 4 0 2 2 0 0 1-4 0z']],
    ubicacion: ['1em', ['M12.166 8.94C12.696 7.867 13 6.862 13 6A5 5 0 0 0 3 6c0 .862.305 1.867.834 2.94.524 1.062 1.234 2.12 1.96 3.07A31.481 31.481 0 0 0 8 14.58l.208-.22a31.493 31.493 0 0 0 1.998-2.35c.726-.95 1.436-2.008 1.96-3.07zM8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10z', 'M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']],
    telefono: ['1em', ['M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.47 17.47 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969z']],
    correo: ['1em', ['M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414.05 3.555zM0 4.697v7.104l5.803-3.558L0 4.697zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586l-1.239-.757zm3.436-.586L16 11.801V4.697l-5.803 3.546z']],
    reloj: ['1em', ['M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.970 6.970 0 0 0 8 16a6.970 6.970 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.070V1h.5a.5.5 0 0 0 0-1h-3zm1.038 3.018a6.093 6.093 0 0 1 .924 0 6 6 0 1 1-.924 0zM8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.380a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9V5.5zM0 3.5c0 .753.333 1.429.86 1.887A8.035 8.035 0 0 1 4.387 1.860 2.5 2.5 0 0 0 0 3.5zM13.5 1c-.753 0-1.429.333-1.887.86a8.035 8.035 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1z']],
    basura: ['2em', ['M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7z'], 'text-danger'],
  };

  function icono(tipo) {
    const [tam, trazos, extra] = ICONOS[tipo];
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', tam);
    svg.setAttribute('height', tam);
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('class', `bi${extra ? ' ' + extra : ''}`);
    svg.setAttribute('aria-hidden', 'true');
    for (const d of trazos) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('fill-rule', 'evenodd');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  }

  function pie() {
    return el('footer', { class: 'footer-area section-gap' }, el('br'),
      el('div', { class: 'container' },
        el('div', { class: 'footer-bottom row align-items-center text-center' },
          el('p', { class: 'footer-text m-0 col-md-12' },
            'Copyright 2020, Todos los Derechos reservados PNK, ', el('br'),
            'Sitio desarrollado para la Explotación de Vulnerabilidades Web, Laboratorio de Programación Segura I', el('br'),
            el('b', { text: 'Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena' })))));
  }

  // Reemplaza el contenido de #app por un mensaje de error (equivale a la antigua vista error.ejs).
  function paginaError(titulo) {
    document.title = titulo;
    const app = vaciar(document.getElementById('app'));
    agregar(app, [el('div', { class: 'container contendor text-center' },
      el('br'), el('br'),
      el('img', { class: 'logosintituciones', src: '/img/logo.png', width: '170px', alt: '' }),
      el('h1', { class: 'mt-4', text: titulo }),
      el('p', {}, el('a', { href: '/', text: 'Volver al inicio' })))]);
  }

  // Id del restaurante desde la URL (/restaurantes/:id[/carrito]); el backend lo vuelve a validar.
  function ridDeUrl() {
    const m = /^\/restaurantes\/([0-9]{1,10})(\/|$)/.exec(location.pathname);
    return m ? Number(m[1]) : null;
  }

  global.PNK = { estado, pedir, cargarSesion, el, agregar, vaciar, conSaltos, moneda, urlSegura, icono, pie, paginaError, ridDeUrl };
})(window);
