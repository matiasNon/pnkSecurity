#!/usr/bin/env bash
# Despliegue de la carta digital en una EC2 NUEVA (Ubuntu 22.04/24.04). Se puede pegar como "User data" al lanzar la
# instancia o ejecutar a mano con sudo. NO toca la instancia de la entrega anterior (Apache + PHP).
# Security Group: entrada 22 (solo tu IP), 80 y 443 (0.0.0.0/0). El 5432 y el 3000 NO se abren.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO="https://github.com/matiasNon/pnkSecurity.git"
RAMA="produccion"
DIR="/opt/carta-digital"

# 1) Docker (repositorio oficial)
apt-get update -y && apt-get install -y ca-certificates curl git openssl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 2) Codigo de la rama
[ -d "$DIR/.git" ] && git -C "$DIR" pull --ff-only || git clone --branch "$RAMA" --single-branch "$REPO" "$DIR"
cd "$DIR"

# 3) IP publica (IMDSv2) y secretos aleatorios; .env.prod queda solo legible por root y nunca se sube al repositorio
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
if [ ! -f .env.prod ]; then
  PW=$(openssl rand -hex 24); SS=$(openssl rand -hex 32)
  ADMIN_PW="$(openssl rand -hex 10)Aa1"; CLIENTE_PW="$(openssl rand -hex 10)Bb2"
  sed -e "s/CAMBIAR_clave_larga_y_aleatoria/$PW/; s/CAMBIAR_misma_clave_que_POSTGRES_PASSWORD/$PW/" \
      -e "s/CAMBIAR_secreto_de_sesion_de_48_caracteres_o_mas/$SS/; s/CAMBIAR_ip_o_dominio/$IP/" \
      -e "s/CAMBIAR_clave_admin_larga/$ADMIN_PW/; s/CAMBIAR_clave_cliente_larga/$CLIENTE_PW/" .env.prod.example > .env.prod
  chmod 600 .env.prod
  echo "Clave del administrador (admin@gmail.com): $ADMIN_PW   <- anotarla; solo se muestra ahora"
fi

# 4) Certificado TLS autofirmado para la IP y arranque
bash infra/generar-certificado.sh "$IP"
bash infra/cargar-certificado.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
echo "Listo: https://$IP/restaurantes/1  (certificado autofirmado: el navegador pedira aceptarlo)"
