#!/usr/bin/env bash
# Borra TODO el ambiente creado por desplegar.sh (instancias, ALB, RDS, EFS, secretos, Security Groups) y el certificado.
# ATENCION: la base de datos de RDS se elimina sin respaldo final (para poder repetir la prueba de despliegue).
# Uso: bash infra/aws/destruir.sh   (pide confirmacion; SI=1 para no preguntar)
set -euo pipefail

STACK="${STACK:-carta-digital}"
REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""

if [ "${SI:-0}" != "1" ]; then
  read -r -p "Se borrara el stack '$STACK' y su base de datos en $REGION. Escribe BORRAR para continuar: " r
  [ "$r" = "BORRAR" ] || { echo "Cancelado"; exit 1; }
fi

inicio=$(date +%s)
echo "== Borrando el stack $STACK (RDS tarda ~5 min en eliminarse)"
aws cloudformation delete-stack --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --stack-name "$STACK"

echo "== Borrando el certificado de ACM"
CERT=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='carta-digital.local'].CertificateArn | [0]" --output text)
[ "$CERT" != "None" ] && [ -n "$CERT" ] && aws acm delete-certificate --certificate-arn "$CERT" && echo "Eliminado $CERT"

echo "Ambiente eliminado en $(( ($(date +%s) - inicio) / 60 )) min"
