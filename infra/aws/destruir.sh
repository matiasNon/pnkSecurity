#!/usr/bin/env bash
# Borra la APLICACION creada por desplegar.sh (instancias, ALB, Security Groups), el certificado y los logs.
# La BASE DE DATOS, el EFS de fotos y los secretos viven en el stack <STACK>-datos y SE CONSERVAN (asi el siguiente
# despliegue no recrea RDS y es mucho mas corto). Para borrar tambien los datos: TODO=1 (sin respaldo final).
# Si el stack es de la version antigua (BD incluida), se borra completo como antes.
# Uso: bash infra/aws/destruir.sh   (pide confirmacion; SI=1 para no preguntar)   |   TODO=1 bash infra/aws/destruir.sh
set -euo pipefail

STACK="${STACK:-carta-digital}"
DATOS="${STACK}-datos"
TODO="${TODO:-0}"
REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""

existe() { aws cloudformation describe-stacks --stack-name "$1" >/dev/null 2>&1; }
LEGADO=0
if existe "$STACK" && aws cloudformation describe-stack-resource --stack-name "$STACK" --logical-resource-id BaseDatos >/dev/null 2>&1; then LEGADO=1; fi
if [ "$LEGADO" = 1 ] || [ "$TODO" = 1 ]; then QUE="el stack '$STACK' Y su base de datos"; else QUE="el stack '$STACK' (la base de datos de '$DATOS' se conserva)"; fi

if [ "${SI:-0}" != "1" ]; then
  read -r -p "Se borrara $QUE en $REGION. Escribe BORRAR para continuar: " r
  [ "$r" = "BORRAR" ] || { echo "Cancelado"; exit 1; }
fi

inicio=$(date +%s)
echo "== Borrando el stack $STACK$([ "$LEGADO" = 1 ] && echo ' (version antigua: incluye RDS, ~5 min)')"
aws cloudformation delete-stack --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --stack-name "$STACK"

if [ "$TODO" = 1 ] && existe "$DATOS"; then
  echo "== Borrando los datos ($DATOS): RDS, EFS y secretos (RDS tarda ~5 min)"
  aws cloudformation delete-stack --stack-name "$DATOS"
  aws cloudformation wait stack-delete-complete --stack-name "$DATOS"
elif existe "$DATOS"; then
  echo "== Se conservan los datos ($DATOS): base de datos, fotos y claves"
fi

echo "== Borrando el certificado de ACM"
CERT=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='carta-digital.local'].CertificateArn | [0]" --output text)
[ "$CERT" != "None" ] && [ -n "$CERT" ] && aws acm delete-certificate --certificate-arn "$CERT" && echo "Eliminado $CERT"

echo "== Borrando el grupo de registros de CloudWatch (si existe)"
aws logs delete-log-group --log-group-name "/$STACK/backend" 2>/dev/null && echo "Eliminado /$STACK/backend" || true

echo "Ambiente eliminado en $(( ($(date +%s) - inicio) / 60 )) min"
