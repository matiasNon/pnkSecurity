'use strict';
// Subida de fotos del panel (ASVS v5 V5 "File handling", ISO 27034 ONF):
//  - solo un archivo, tamano maximo configurable, en memoria (no se escribe nada antes de validar sesion y CSRF);
//  - el tipo se decide por los primeros bytes del archivo (no por el nombre ni por el Content-Type del cliente);
//  - el archivo se guarda con nombre aleatorio y extension derivada del tipo detectado, en un directorio aparte
//    del codigo (volumen de Docker) servido solo como imagen.

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');

function detectarTipo(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Validacion de ESTRUCTURA (ASVS v5 V5: el contenido debe ser consistente con el tipo), no solo de la firma inicial:
// un archivo que empieza como JPEG pero es un script o HTML ("poliglota") se rechaza. Sin dependencias nativas.
// Solo secuencias largas (5+ caracteres): en datos binarios aleatorios su probabilidad es despreciable (sin falsos positivos).
const MARCADO_PELIGROSO = /<\?php|<script|<html|<svg|<iframe|<body|javascript:/i;

function estructuraValida(tipo, buf) {
  const n = buf.length;
  if (tipo === 'jpg') {
    // SOI al inicio y una cadena de segmentos bien formada hasta el inicio de los datos (SOS). No se exige el EOI al
    // final: algunos celulares agregan metadatos despues de el.
    let i = 2;
    while (i + 4 <= n && buf[i] === 0xff) {
      const marca = buf[i + 1];
      if (marca === 0xda) return true; // inicio de los datos de la imagen
      const largo = buf.readUInt16BE(i + 2);
      if (largo < 2) return false;
      i += 2 + largo;
    }
    return false;
  }
  if (tipo === 'png') {
    // Primer bloque IHDR de 13 bytes y bloque IEND al final.
    return n > 45 && buf.subarray(12, 16).toString('latin1') === 'IHDR' && buf.readUInt32BE(8) === 13
      && buf.subarray(n - 8, n - 4).toString('latin1') === 'IEND';
  }
  if (tipo === 'gif') return n > 13 && buf[n - 1] === 0x3b; // terminador del GIF
  if (tipo === 'webp') {
    // El tamano declarado en la cabecera RIFF coincide con el archivo y hay un bloque VP8/VP8L/VP8X.
    return n > 20 && buf.readUInt32LE(4) + 8 === n && /^VP8[ LX]$/.test(buf.subarray(12, 16).toString('latin1'));
  }
  return false;
}

function imagenValida(buf) {
  const tipo = detectarTipo(buf);
  if (!tipo || !estructuraValida(tipo, buf)) return null;
  if (MARCADO_PELIGROSO.test(buf.toString('latin1'))) return null;
  return tipo;
}

function crearSubidas(cfg) {
  const carga = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: cfg.UPLOAD_MAX_BYTES, files: 1, fields: 20, fieldSize: 4096, parts: 25 },
  }).single('foto');

  // Envoltorio: traduce los errores de multer a un mensaje legible (req.errorSubida).
  function recibir(req, res, next) {
    carga(req, res, (err) => {
      if (err) {
        req.errorSubida = err.code === 'LIMIT_FILE_SIZE'
          ? `La foto supera el maximo de ${Math.round(cfg.UPLOAD_MAX_BYTES / 1024 / 1024)} MB`
          : 'No se pudo procesar el archivo enviado';
      }
      next();
    });
  }

  // Valida el archivo recibido y lo guarda. Devuelve el nombre guardado, null si no se envio foto,
  // o lanza Error con un mensaje apto para mostrar al usuario si el archivo es invalido.
  async function guardarFoto(req, restauranteId) {
    if (req.errorSubida) throw new Error(req.errorSubida);
    if (!req.file || req.file.size === 0) return null;
    const tipo = imagenValida(req.file.buffer);
    if (!tipo) throw new Error('La foto debe ser una imagen JPG, PNG, GIF o WEBP valida');
    const nombre = `${crypto.randomBytes(16).toString('hex')}.${tipo}`;
    const dir = path.resolve(cfg.UPLOAD_DIR, `cod${Number(restauranteId)}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, nombre), req.file.buffer, { flag: 'wx', mode: 0o644 });
    return nombre;
  }

  // Borra una foto subida por el panel. Solo actua sobre nombres generados por guardarFoto()
  // (32 hex + extension); las fotos del volcado original viven en public/ y no se tocan.
  async function borrarFoto(restauranteId, nombre) {
    if (typeof nombre !== 'string' || !/^[a-f0-9]{32}\.(jpg|png|gif|webp)$/.test(nombre)) return;
    await fs.unlink(path.join(path.resolve(cfg.UPLOAD_DIR, `cod${Number(restauranteId)}`), nombre)).catch(() => {});
  }

  return { recibir, guardarFoto, borrarFoto };
}

module.exports = { imagenValida, crearSubidas, detectarTipo };
