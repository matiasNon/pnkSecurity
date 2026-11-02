'use strict';
// Validacion de entradas. Equivale a entero_get()/entero_post() de la version PHP: solo digitos,
// rango 1..2147483647 (integer de PostgreSQL). Cualquier otra cosa (1 OR 1=1, 1e2, 0x10, " 5 ") -> null.

const MAX_INT = 2147483647;

function entero(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const s = String(valor);
  if (!/^[0-9]{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_INT ? n : null;
}

// Ruta relativa de una imagen solo si el nombre es seguro; si no, null (equivale a ruta_foto() de PHP).
function rutaFoto(restauranteId, foto) {
  if (typeof foto !== 'string') return null;
  if (!/^[A-Za-z0-9._-]{1,100}\.(jpe?g|png|gif|webp)$/i.test(foto) || foto.includes('..')) return null;
  return `/imagenes/cod${Number(restauranteId)}/${foto}`;
}

// Formato de moneda chilena: 12500 -> "$ 12.500".
function monedaChilena(numero) {
  const n = Math.trunc(Number(numero)) || 0;
  return '$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

module.exports = { entero, rutaFoto, monedaChilena, MAX_INT };
