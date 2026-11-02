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
    const tipo = detectarTipo(req.file.buffer);
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

module.exports = { crearSubidas, detectarTipo };
