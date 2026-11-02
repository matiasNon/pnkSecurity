#!/usr/bin/env bash
# Genera un certificado TLS autofirmado para la IP o el host indicado (sin dominio no hay CA publica).
# Uso: infra/generar-certificado.sh 3.230.214.61    (o un nombre de host)
# Con dominio y Cloudflare se reemplaza por un Certificado de Origen de Cloudflare (ver docs/CLOUDFLARE.md).
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash en Windows reescribe los argumentos que empiezan con /
HOST="${1:?Uso: $0 <ip-o-host>}"
DIR="$(dirname "$0")/certs"
mkdir -p "$DIR"
if [[ "$HOST" =~ ^[0-9.]+$ ]]; then SAN="IP:$HOST"; else SAN="DNS:$HOST"; fi
openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout "$DIR/carta.key" -out "$DIR/carta.crt" \
  -subj "/C=CL/O=PNK Carta Digital/CN=$HOST" -addext "subjectAltName=$SAN"
chmod 600 "$DIR/carta.key"
echo "Certificado generado en $DIR (valido 365 dias para $HOST)"
