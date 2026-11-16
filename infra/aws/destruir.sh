#!/usr/bin/env bash
# Borra la APLICACION creada por desplegar.sh (instancias, ALB, Security Groups), el certificado y los logs.
# NUNCA toca la base de datos: RDS, el EFS de fotos y los secretos viven en el stack <STACK>-datos y se conservan,
# de modo que el siguiente despliegue no recrea RDS y es mucho mas corto. Este script no tiene ninguna opcion para
# borrarlos (si algun dia hay que eliminarlos, se hace a mano desde la consola de CloudFormation, borrando <STACK>-datos).
# Un stack antiguo (con la BD dentro del mismo stack) NO se borra aqui: borrarlo destruiria la BD.
# Uso: bash infra/aws/destruir.sh   (pide confirmacion; SI=1 para no preguntar)
set -euo pipefail

STACK="${STACK:-carta-digital}"
DATOS="${STACK}-datos"
REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""

existe() { aws cloudformation describe-stacks --stack-name "$1" >/dev/null 2>&1; }

# Stack de la version antigua: trae RDS adentro, asi que borrarlo destruiria la base de datos.
if existe "$STACK" && aws cloudformation describe-stack-resource --stack-name "$STACK" --logical-resource-id BaseDatos >/dev/null 2>&1; then
  echo "El stack '$STACK' es de la version antigua (incluye la base de datos): borrarlo destruiria los datos."
  echo "Este script no lo borra. Migralo o borralo a mano desde la consola de CloudFormation si aceptas perder la BD."
  exit 1
fi

if [ "${SI:-0}" != "1" ]; then
  read -r -p "Se borrara el stack '$STACK' en $REGION (la base de datos de '$DATOS' se conserva). Escribe BORRAR para continuar: " r
  [ "$r" = "BORRAR" ] || { echo "Cancelado"; exit 1; }
fi

inicio=$(date +%s)
echo "== Borrando el stack $STACK"
aws cloudformation delete-stack --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --stack-name "$STACK"

if existe "$DATOS"; then
  echo "== Se conservan los datos ($DATOS): base de datos, fotos y claves"
fi

echo "== Borrando el certificado de ACM"
CERT=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='carta-digital.local'].CertificateArn | [0]" --output text)
[ "$CERT" != "None" ] && [ -n "$CERT" ] && aws acm delete-certificate --certificate-arn "$CERT" && echo "Eliminado $CERT"

echo "== Borrando el grupo de registros de CloudWatch (si existe)"
aws logs delete-log-group --log-group-name "/$STACK/backend" 2>/dev/null && echo "Eliminado /$STACK/backend" || true

echo "Aplicacion eliminada en $(( ($(date +%s) - inicio) / 60 )) min (la base de datos se conserva)"
