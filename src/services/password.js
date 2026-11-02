'use strict';
// Hash de contrasenas con scrypt (node:crypto, sin dependencias externas). ASVS v5 V6.2 / ISO 27001 A.8.5.
// Formato almacenado: scrypt$N$r$p$salBase64$hashBase64

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const N = 16384;
const R = 8;
const P = 1;
const LARGO = 64;

async function hashPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(password, sal, LARGO, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64'), hash.toString('base64')].join('$');
}

async function verificarPassword(password, almacenado) {
  const partes = String(almacenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, 'base64');
  const sal = Buffer.from(salB64, 'base64');
  const calculado = await scrypt(password, sal, esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(calculado, esperado);
}

// Hash senuelo: si la cuenta no existe se verifica contra el igualmente, para que el tiempo de
// respuesta no revele que correos estan registrados (enumeracion de usuarios).
let senuelo = null;
async function verificarSenuelo(password) {
  if (!senuelo) senuelo = await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verificarPassword(password, senuelo);
  return false;
}

module.exports = { hashPassword, verificarPassword, verificarSenuelo };
