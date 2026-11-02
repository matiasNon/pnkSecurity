#!/usr/bin/env bash
# Copia el certificado y la clave TLS al volumen de Docker "pnk-prod-certs" que monta nginx.
# Uso: infra/cargar-certificado.sh <carta.crt> <carta.key>      (sin argumentos usa infra/certs/)
set -euo pipefail
export MSYS_NO_PATHCONV=1
CRT="${1:-$(dirname "$0")/certs/carta.crt}"
KEY="${2:-$(dirname "$0")/certs/carta.key}"
docker volume create pnk-prod-certs >/dev/null
docker run --rm -i -v pnk-prod-certs:/certs alpine sh -c 'cat > /certs/carta.crt && chmod 644 /certs/carta.crt' < "$CRT"
docker run --rm -i -v pnk-prod-certs:/certs alpine sh -c 'cat > /certs/carta.key && chmod 644 /certs/carta.key' < "$KEY"
echo "Certificado cargado en el volumen pnk-prod-certs"
