'use strict';
// Consola del backend: consulta /api/estado cada 5 s y pinta el resultado. Solo textContent (nunca innerHTML).
(function () {
  const INTERVALO = 5000;
  const MAX_HISTORIAL = 12;
  const historial = [];
  const conteoNodos = new Map();
  const $ = (id) => document.getElementById(id);

  function texto(id, valor) {
    const el = $(id);
    if (el) el.textContent = valor;
  }

  function marcar(id, estado) {
    const el = $(id);
    if (el) el.dataset.estado = estado;
  }

  function duracion(seg) {
    const d = Math.floor(seg / 86400);
    const h = Math.floor((seg % 86400) / 3600);
    const m = Math.floor((seg % 3600) / 60);
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${m} min`;
    if (m > 0) return `${m} min`;
    return `${seg} s`;
  }

  function pintarHistorial(nodo) {
    historial.unshift({ nodo, hora: new Date() });
    if (historial.length > MAX_HISTORIAL) historial.pop();
    conteoNodos.set(nodo, (conteoNodos.get(nodo) || 0) + 1);

    const nodos = [...conteoNodos.keys()];
    const lista = $('historial');
    lista.replaceChildren(
      ...historial.map((h, i) => {
        const li = document.createElement('li');
        li.className = `nodo-chip color-${nodos.indexOf(h.nodo) % 4}${i === 0 ? ' nuevo' : ''}`;
        const n = document.createElement('strong');
        n.textContent = h.nodo;
        const t = document.createElement('span');
        t.textContent = h.hora.toLocaleTimeString('es-CL');
        li.append(n, t);
        return li;
      })
    );
    const partes = nodos.map((n) => `${n}: ${conteoNodos.get(n)}`);
    texto('resumen-nodos', `${nodos.length} instancia(s) distinta(s) han respondido · ${partes.join(' · ')}`);
  }

  async function actualizar() {
    try {
      const res = await fetch('/api/estado', { cache: 'no-store', credentials: 'omit' });
      const d = await res.json();

      marcar('estado-global', d.estado === 'ok' ? 'ok' : 'error');
      texto('estado-global-texto', d.estado === 'ok' ? 'Todos los sistemas operativos' : 'Servicio degradado');

      marcar('t-backend', 'ok');
      texto('v-nodo', d.nodo);
      texto('v-activo', duracion(d.activoSegundos));
      texto('v-version', `v${d.version}`);
      texto('v-node', d.node);

      const bd = d.baseDatos;
      marcar('t-bd', bd.ok ? 'ok' : 'error');
      texto('v-latencia', bd.ok ? bd.latenciaMs.toFixed(1) : '—');
      texto('v-tls', bd.ok ? (bd.tls ? 'Cifrada con TLS ✓' : 'Sin TLS') : 'Sin conexión');
      if (bd.conteos) {
        texto('c-cartas', bd.conteos.cartas);
        texto('c-categorias', bd.conteos.categorias);
        texto('c-productos', bd.conteos.productos);
      }

      const al = d.almacenamiento;
      marcar('t-efs', al.ok ? 'ok' : 'error');
      texto('v-archivos', al.ok ? al.archivos : '—');

      texto('v-hora', `Actualizado ${new Date(d.hora).toLocaleTimeString('es-CL')}`);
      pintarHistorial(d.nodo);
    } catch {
      marcar('estado-global', 'error');
      texto('estado-global-texto', 'Sin respuesta del backend');
      marcar('t-backend', 'error');
    }
  }

  actualizar();
  setInterval(() => {
    if (!document.hidden) actualizar();
  }, INTERVALO);
})();
