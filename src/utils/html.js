'use strict';
// Escape de salida HTML (ASVS v5 V1.2). EJS ya escapa con <%= %>; estas funciones se usan donde hace
// falta construir HTML a mano (saltos de linea de comentarios) sin saltarse el escape.

const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);
}

// Escapa primero y despues convierte los saltos de linea en <br>: equivale a nl2br(e($texto)).
function nl2br(texto) {
  return esc(texto).replace(/\r\n|\r|\n/g, '<br>');
}

module.exports = { esc, nl2br };
