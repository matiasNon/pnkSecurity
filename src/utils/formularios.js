'use strict';
// Esquemas zod de los formularios del panel de administracion (ASVS v5 V2: validacion de entradas).
// Lista blanca de formato y rango; lo que no cumple se rechaza, no se "limpia".

const { z } = require('zod');

const SIN_CONTROL = /^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*$/;

const texto = (max, { min = 0 } = {}) =>
  z.string().trim().min(min).max(max).regex(SIN_CONTROL, 'Caracteres no permitidos');

// Nombres (una sola linea): ademas rechaza saltos de linea y tabuladores (CR/LF), que nunca son legitimos en un nombre
// y servirian para falsear registros o cabeceras si el valor llegara a usarse fuera de la app (pentest 11-11-2026).
const UNA_LINEA = /^[^\x00-\x1F\x7F]*$/;
const linea = (max, { min = 1 } = {}) =>
  z.string().trim().min(min).max(max).regex(UNA_LINEA, 'Caracteres no permitidos');

// Casilla de verificacion HTML: llega "on" si esta marcada y no llega si no.
const casilla = z.preprocess((v) => v === 'on' || v === '1' || v === 'true', z.boolean());

const enteroEntre = (min, max) =>
  z.string().trim().regex(/^[0-9]{1,10}$/, 'Debe ser un numero entero').transform(Number)
    .refine((n) => n >= min && n <= max, `Debe estar entre ${min} y ${max}`);

// Numero opcional: vacio -> null.
const enteroOpcional = (min, max) =>
  z.preprocess((v) => (v === '' || v == null ? null : v), enteroEntre(min, max).nullable());

const textoOpcional = (max) =>
  z.preprocess((v) => (v == null || String(v).trim() === '' ? null : v), texto(max).nullable());

const esquemaCarta = z.object({
  nombre: linea(45),
  orden: enteroOpcional(0, 9999),
  visible: casilla,
});

const esquemaCategoria = z.object({
  nombre: linea(100),
  orden: enteroOpcional(0, 9999),
  visible: casilla,
  carta_id: enteroEntre(1, 2147483647),
});

const esquemaItem = z.object({
  nombre: linea(100),
  descripcion: textoOpcional(300),
  tiempo: textoOpcional(100),
  observaciones: textoOpcional(300),
  precio: enteroEntre(0, 10000000),
  puntuacion: enteroOpcional(0, 5).transform((n) => n ?? 0),
  orden: enteroOpcional(0, 9999),
  visible: casilla,
  destacado: casilla,
  categoria_id: enteroEntre(1, 2147483647),
});

// Devuelve { datos } o { errores: { campo: mensaje } } para volver a mostrar el formulario.
function validar(esquema, entrada) {
  const r = esquema.safeParse(entrada || {});
  if (r.success) return { datos: r.data };
  const errores = {};
  for (const i of r.error.issues) {
    const campo = i.path[0] || 'general';
    if (errores[campo]) continue;
    // Los mensajes por defecto de zod estan en ingles: los tipos faltantes o invalidos se explican en espanol.
    errores[campo] = ['invalid_type', 'invalid_value'].includes(i.code) ? 'Campo obligatorio o con formato invalido' : i.message;
  }
  return { errores };
}

module.exports = {
  linea, esquemaCarta, esquemaCategoria, esquemaItem, validar };
