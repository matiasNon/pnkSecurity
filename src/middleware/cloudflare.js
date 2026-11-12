'use strict';
// IP real del visitante detras de Cloudflare (Cloudflare -> ALB -> backend).
// Con TRUST_PROXY=1, req.ip es quien se conecto al ALB: si el sitio pasa por Cloudflare, esa es la IP de un nodo de
// Cloudflare, compartida por muchos visitantes. Eso arruina los limites por IP (un atacante podria bloquear el login de
// otros) y los registros de seguridad (ASVS v5 V16, ISO 27001 A.8.15/A.8.16).
// Se usa CF-Connecting-IP SOLO si la conexion viene de verdad de un rango publicado por Cloudflare; si alguien llega
// directo al ALB y envia esa cabecera falsificada, se ignora.
// Rangos: https://www.cloudflare.com/ips-v4 y /ips-v6 (verificados el 11-11-2026; revisar al actualizar dependencias).

const net = require('node:net');

const RANGOS_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const RANGOS_V6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

const cloudflare = new net.BlockList();
for (const r of RANGOS_V4) { const [ip, p] = r.split('/'); cloudflare.addSubnet(ip, Number(p), 'ipv4'); }
for (const r of RANGOS_V6) { const [ip, p] = r.split('/'); cloudflare.addSubnet(ip, Number(p), 'ipv6'); }

function esDeCloudflare(ip) {
  if (!ip) return false;
  const limpia = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const tipo = net.isIPv4(limpia) ? 'ipv4' : net.isIPv6(limpia) ? 'ipv6' : null;
  return tipo !== null && cloudflare.check(limpia, tipo);
}

function ipRealCloudflare(cfg) {
  if (!cfg.confiarCloudflare) return (req, res, next) => next();
  return (req, res, next) => {
    const cabecera = req.get('cf-connecting-ip');
    const visitante = cabecera ? cabecera.trim() : '';
    if (visitante && net.isIP(visitante) && esDeCloudflare(req.ip)) {
      // req.ip es un getter de Express: se redefine solo para esta peticion.
      Object.defineProperty(req, 'ip', { value: visitante, configurable: true, enumerable: true });
    }
    next();
  };
}

module.exports = { ipRealCloudflare, esDeCloudflare };
