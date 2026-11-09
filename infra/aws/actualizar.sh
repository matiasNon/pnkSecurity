#!/usr/bin/env bash
# Actualiza la app en AWS sin cortar el servicio: reemplaza las instancias de un ASG de a una (rolling replace).
# Cada instancia nueva clona la rama del stack desde GitHub al arrancar, asi que toma el ultimo commit pusheado.
# Se usa en vez de "instance refresh" porque AWS Academy lo bloquea con una SCP (autoscaling:StartInstanceRefresh).
# Uso (CloudShell o Jenkins):
#   bash infra/aws/actualizar.sh frontend      # solo el frontend
#   bash infra/aws/actualizar.sh backend       # solo el backend
#   bash infra/aws/actualizar.sh               # ambos (primero backend, despues frontend)
set -euo pipefail

STACK="${STACK:-carta-digital}"
REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
CAPAS="${*:-backend frontend}"
ESPERA_MAX="${ESPERA_MAX:-900}"   # segundos maximos por instancia (el backend construye su imagen al arrancar)

salida() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
sanas() { aws elbv2 describe-target-health --target-group-arn "$1" \
  --query "TargetHealthDescriptions[?TargetHealth.State=='healthy'].Target.Id" --output text; }

reemplazar_capa() {
  local capa=$1 asg tg deseadas
  case "$capa" in
    frontend) asg=$(salida AsgFrontendNombre); tg=$(salida GrupoFrontendArn) ;;
    backend)  asg=$(salida AsgBackendNombre);  tg=$(salida GrupoBackendArn) ;;
    *) echo "Capa desconocida: $capa (usar frontend o backend)"; exit 1 ;;
  esac
  deseadas=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$asg" \
    --query 'AutoScalingGroups[0].DesiredCapacity' --output text)
  local viejas
  viejas=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$asg" \
    --query "AutoScalingGroups[0].Instances[?LifecycleState=='InService'].InstanceId" --output text)
  echo "== $capa ($asg): $deseadas instancias deseadas; se reemplazan: $viejas"

  for id in $viejas; do
    # Antes de sacar una, deben estar todas sanas (asi siempre queda al menos una atendiendo).
    local t=0
    until [ "$(sanas "$tg" | wc -w)" -ge "$deseadas" ]; do
      [ $t -ge "$ESPERA_MAX" ] && { echo "  $capa no tiene $deseadas instancias sanas; se detiene"; exit 1; }
      sleep 15; t=$((t + 15))
    done
    echo "  Reemplazando $id ..."
    aws autoscaling terminate-instance-in-auto-scaling-group --instance-id "$id" \
      --no-should-decrement-desired-capacity --query 'Activity.StatusCode' --output text
    # Esperar a que el reemplazo este sano (y la vieja ya no figure como sana).
    t=0
    while :; do
      local s; s=$(sanas "$tg")
      if [ "$(echo "$s" | wc -w)" -ge "$deseadas" ] && ! grep -qw "$id" <<<"$s"; then break; fi
      [ $t -ge "$ESPERA_MAX" ] && { echo "  El reemplazo de $id no quedo sano en ${ESPERA_MAX}s"; exit 1; }
      printf '  esperando... sanas: %s\n' "${s:-ninguna}"
      sleep 20; t=$((t + 20))
    done
    echo "  OK: $id reemplazada"
  done
}

inicio=$(date +%s)
for capa in $CAPAS; do reemplazar_capa "$capa"; done

DNS=$(salida DnsBalanceador)
echo "Verificacion a traves del ALB:"
for ruta in /restaurantes/1 /api/health /api/restaurantes/1; do
  printf '  %-22s %s\n' "$ruta" "$(curl -sk -o /dev/null -m 10 -w '%{http_code}' "https://$DNS$ruta")"
done
echo "Actualizado en $(( ($(date +%s) - inicio) / 60 )) min: https://$DNS/restaurantes/1"
