#!/usr/bin/env bash
# Crea TODO el ambiente de la carta digital en AWS con un solo comando:
#   VPC por defecto -> certificado HTTPS en ACM -> stack CloudFormation (Security Groups por capa, RDS PostgreSQL 17,
#   EFS, Secrets Manager, ALB con reglas por ruta, 2 Launch Templates y 2 Auto Scaling Groups: frontend y backend)
#   -> cada instancia clona la rama, construye su imagen y levanta su contenedor.
# Al terminar deja la direccion fija del ambiente (nombre DNS del ALB) en infra/aws/salida.env: la usan los demas
# scripts y es el destino del CNAME de Cloudflare. Cambia solo si se borra y se vuelve a crear el stack.
# Uso (en AWS CloudShell, region us-east-1):
#   git clone --branch produccion https://github.com/matiasNon/pnkSecurity.git && cd pnkSecurity
#   bash infra/aws/desplegar.sh                     # rama produccion
#   RAMA=qa DOMINIO=carta.midominio.me bash infra/aws/desplegar.sh
# Borrar todo: bash infra/aws/destruir.sh
set -euo pipefail

STACK="${STACK:-carta-digital}"
REGION="${AWS_REGION:-us-east-1}"
RAMA="${RAMA:-produccion}"   # para esta version separada: RAMA=front-back-separados
DOMINIO="${DOMINIO:-}"
REPO="${REPO:-https://github.com/matiasNon/pnkSecurity.git}"
PLANTILLA="$(cd "$(dirname "$0")" && pwd)/carta-digital.yaml"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""

paso() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
inicio=$(date +%s)

paso "1/5 Verificando credenciales de AWS"
aws sts get-caller-identity --query Arn --output text

paso "2/5 Red: VPC por defecto y dos subredes en zonas distintas"
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
[ "$VPC" != "None" ] || { echo "No hay VPC por defecto en $REGION"; exit 1; }
# us-east-1a y us-east-1b soportan t3.micro y db.t3.micro (us-east-1e no).
mapfile -t SUBREDES < <(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true Name=availability-zone,Values="${REGION}a","${REGION}b","${REGION}c" \
  --query 'sort_by(Subnets,&AvailabilityZone)[].SubnetId' --output text | tr '\t' '\n' | head -2)
[ "${#SUBREDES[@]}" -eq 2 ] || { echo "Se necesitan 2 subredes en zonas distintas"; exit 1; }
echo "VPC $VPC  subredes ${SUBREDES[*]}"

paso "3/5 Certificado HTTPS para el balanceador (ACM)"
CERT=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='carta-digital.local'].CertificateArn | [0]" --output text)
if [ "$CERT" = "None" ] || [ -z "$CERT" ]; then
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  # Autofirmado: sin dominio no hay CA publica. Con Cloudflare (modo Full) el visitante ve el certificado de Cloudflare.
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout "$TMP/k.pem" -out "$TMP/c.pem" \
    -subj "/C=CL/O=PNK Carta Digital/CN=carta-digital.local" -addext "subjectAltName=DNS:carta-digital.local" 2>/dev/null
  CERT=$(aws acm import-certificate --certificate fileb://"$TMP/c.pem" --private-key fileb://"$TMP/k.pem" \
    --tags Key=Proyecto,Value=carta-digital --query CertificateArn --output text)
  echo "Certificado importado: $CERT"
else
  echo "Se reutiliza el certificado existente: $CERT"
fi

# Version menor vigente de PostgreSQL 17 en RDS (las antiguas se retiran y ya no se pueden crear).
PG=$(aws rds describe-db-engine-versions --engine postgres --engine-version 17 --default-only \
  --query 'DBEngineVersions[0].EngineVersion' --output text)
echo "PostgreSQL en RDS: $PG"

paso "4/5 Creando el stack $STACK (RDS tarda ~6-8 min; las instancias construyen la app en paralelo)"
aws cloudformation deploy --stack-name "$STACK" --template-file "$PLANTILLA" --no-fail-on-empty-changeset \
  --tags Proyecto=carta-digital \
  --parameter-overrides VpcId="$VPC" Subred1="${SUBREDES[0]}" Subred2="${SUBREDES[1]}" \
    CertificadoArn="$CERT" VersionPostgres="$PG" Rama="$RAMA" RepoUrl="$REPO" DominioPublico="$DOMINIO"

salida() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
TG_FRONT=$(salida GrupoFrontendArn)
TG_BACK=$(salida GrupoBackendArn)
DNS=$(salida DnsBalanceador)

# Direccion fija del ambiente para los demas scripts (y para el CNAME de Cloudflare).
SALIDA_ENV="$(cd "$(dirname "$0")" && pwd)/salida.env"
cat > "$SALIDA_ENV" <<ENV
# Generado por desplegar.sh el $(date '+%Y-%m-%d %H:%M'). No contiene secretos.
STACK=$STACK
REGION=$REGION
RAMA=$RAMA
ALB_DNS=$DNS
PUBLIC_HOST=${DOMINIO:-$DNS}
URL=https://${DOMINIO:-$DNS}/restaurantes/1
ASG_FRONTEND=$(salida AsgFrontendNombre)
ASG_BACKEND=$(salida AsgBackendNombre)
TG_FRONTEND=$TG_FRONT
TG_BACKEND=$TG_BACK
ENV

sanas() { aws elbv2 describe-target-health --target-group-arn "$1" \
  --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" --output text; }

paso "5/5 Esperando el health check del balanceador (frontend /salud, backend /api/health)"
for i in $(seq 1 60); do
  F=$(sanas "$TG_FRONT"); B=$(sanas "$TG_BACK")
  echo "  sanas -> frontend: $F   backend: $B"
  [ "$F" -ge 1 ] && [ "$B" -ge 1 ] && [ $((F + B)) -ge 4 ] && break
  sleep 20
done

# Comprobacion de punta a punta a traves del ALB (-k: el certificado es autofirmado hasta Cloudflare).
verificar() { printf '  %-28s ' "$1"; curl -sk -o /dev/null -m 10 -w '%{http_code}\n' "https://$DNS$1"; }
echo "Enrutamiento del ALB:"
verificar /restaurantes/1        # frontend (HTML)
verificar /api/health            # backend + RDS
verificar /api/restaurantes/1    # backend (JSON)
printf '  %-28s ' "http:// -> https://"; curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}\n' "http://$DNS/restaurantes/1"

ADMIN=$(aws secretsmanager get-secret-value --secret-id "$(salida SecretoAdminArn)" --query SecretString --output text \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])')
min=$(( ($(date +%s) - inicio) / 60 ))

cat <<FIN

============================================================
 Carta digital desplegada en ${min} min
 URL:            $(salida Url)
 Balanceador:    $DNS   (direccion fija; CNAME para Cloudflare)
 Guardado en:    infra/aws/salida.env
 Base de datos:  $(salida EndpointBd)   (privada, TLS)
 Admin:          admin@gmail.com   clave: ${ADMIN}
                 (anotarla; tambien queda en Secrets Manager)
 El certificado es autofirmado: el navegador pedira aceptarlo
 hasta configurar Cloudflare (docs/CLOUDFLARE.md).
============================================================
FIN
