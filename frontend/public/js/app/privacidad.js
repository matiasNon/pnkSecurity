// Pagina /privacidad: panel "Mis datos" con los derechos del titular sobre su cuenta.
// GET /api/mi-cuenta/datos (acceso/portabilidad), PATCH /api/mi-cuenta (rectificacion), DELETE /api/mi-cuenta (supresion).
(function () {
  'use strict';
  const { el, pedir, cargarSesion, estado } = window.PNK;
  const panel = document.getElementById('panel-cuenta');

  function sinSesion() {
    panel.replaceChildren(
      el('p', { text: 'Para ver, corregir, descargar o eliminar tus datos, primero inicia sesión.' }),
      el('a', { class: 'cm-btn cm-btn-verde', href: '/restaurantes/1#ingresar', text: 'Iniciar sesión' }));
  }

  function conSesion() {
    const u = estado.usuario;
    const aviso = el('p', { class: 'pv-aviso', role: 'status' });
    const mensaje = (texto, error) => { aviso.textContent = texto; aviso.classList.toggle('pv-error', Boolean(error)); };

    // Acceso / portabilidad
    const descargar = el('a', {
      class: 'cm-btn cm-btn-verde', href: '/api/mi-cuenta/datos?descargar=1', download: 'mis-datos-carta-digital.json',
      text: 'Descargar mis datos (JSON)',
    });

    // Rectificacion
    const nombre = el('input', { id: 'pv-nombre', class: 'pv-input', type: 'text', maxlength: 100, required: true, value: u.nombre, autocomplete: 'name' });
    const formNombre = el('form', { class: 'pv-form' },
      el('label', { for: 'pv-nombre', text: 'Nombre (se muestra en tus comentarios)' }), nombre,
      el('button', { type: 'submit', class: 'cm-btn cm-btn-claro pv-btn', text: 'Guardar nombre' }));
    formNombre.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await pedir('PATCH', '/api/mi-cuenta', { nombre: nombre.value });
      if (r.ok) { estado.usuario = r.datos.usuario; mensaje('Nombre actualizado.'); } else mensaje(r.datos.error || 'No se pudo actualizar.', true);
    });

    // Supresion
    let formEliminar;
    if (u.rol === 'admin') {
      formEliminar = el('p', { class: 'pv-nota', text: 'Las cuentas de administrador no se eliminan desde aquí: solicítalo al responsable del servicio.' });
    } else {
      const clave = el('input', { id: 'pv-clave', class: 'pv-input', type: 'password', required: true, maxlength: 128, autocomplete: 'current-password' });
      const confirmar = el('input', { id: 'pv-confirmar', class: 'pv-input', type: 'text', required: true, maxlength: 8, autocomplete: 'off', placeholder: 'ELIMINAR' });
      formEliminar = el('form', { class: 'pv-form pv-peligro' },
        el('p', { class: 'pv-nota', text: 'Se borra tu cuenta y tus comentarios quedan como «Usuario eliminado». No se puede deshacer.' }),
        el('label', { for: 'pv-clave', text: 'Tu contraseña' }), clave,
        el('label', { for: 'pv-confirmar', text: 'Escribe ELIMINAR para confirmar' }), confirmar,
        el('button', { type: 'submit', class: 'cm-btn pv-btn pv-btn-peligro', text: 'Eliminar mi cuenta' }));
      formEliminar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await pedir('DELETE', '/api/mi-cuenta', { password: clave.value, confirmar: confirmar.value });
        clave.value = '';
        if (r.ok) {
          estado.usuario = null;
          panel.replaceChildren(el('p', { class: 'pv-aviso', role: 'status', text: 'Tu cuenta fue eliminada. Gracias por usar la Carta Digital.' }),
            el('a', { class: 'cm-btn cm-btn-verde', href: '/restaurantes/1', text: 'Volver a la carta' }));
        } else {
          mensaje(r.datos.error || 'No se pudo eliminar la cuenta.', true);
        }
      });
    }

    panel.replaceChildren(
      el('p', {}, 'Sesión iniciada como ', el('b', { text: u.nombre }), '.'),
      aviso,
      el('div', { class: 'pv-acciones' },
        el('div', { class: 'pv-accion' }, el('h3', { text: 'Acceso y portabilidad' }),
          el('p', { class: 'pv-nota', text: 'Todos los datos de tu cuenta y tus comentarios, en un archivo legible por máquina.' }), descargar),
        el('div', { class: 'pv-accion' }, el('h3', { text: 'Rectificación' }), formNombre),
        el('div', { class: 'pv-accion' }, el('h3', { text: 'Supresión' }), formEliminar)));
  }

  async function iniciar() {
    await cargarSesion();
    if (estado.usuario) conSesion(); else sinSesion();
  }
  iniciar();
})();
