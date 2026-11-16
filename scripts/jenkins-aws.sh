#!/usr/bin/env bash
# Deja a Jenkins listo y despliega la rama "produccion" en AWS con un solo comando.
#
# ANTES de ejecutarlo: en AWS Academy abre el laboratorio -> "AWS Details" -> "AWS CLI: Show" y COPIA (Ctrl+C) el bloque que
# empieza con [default]. Las credenciales del laboratorio caducan con cada sesion: hay que repetir esto en cada sesion.
#   bash scripts/jenkins-aws.sh
#
# Que hace: abre Docker y Jenkins si estan apagados -> guarda las credenciales del portapapeles dentro del volumen de
# Jenkins (nunca en el repositorio) -> comprueba que sirven y que existe el stack -> lanza la pipeline de "produccion"
# (Dev -> QA -> filtro de seguridad -> reemplazo escalonado de los dos Auto Scaling Groups) y espera el resultado.
# Variables opcionales: JENKINS_PASSWORD (si no, se lee de ~/.pnk_jenkins_pass o se pregunta), STACK (carta-digital).
set -uo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
J="http://localhost:8081"
STACK="${STACK:-carta-digital}"
VOL="pnk-jenkins_jenkins_home"
paso() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
cn() { curl -s "$@" >/dev/null; }   # curl sin salida (con MSYS_NO_PATHCONV, "-o /dev/null" no funciona)
fallo() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*"; exit 1; }

# --- clave de Jenkins ---
PASS="${JENKINS_PASSWORD:-}"
[ -n "$PASS" ] || { [ -f "$HOME/.pnk_jenkins_pass" ] && PASS="$(tr -d '\r\n' < "$HOME/.pnk_jenkins_pass")"; }
[ -n "$PASS" ] || { read -rsp "Clave del usuario admin de Jenkins: " PASS; echo; }
U="admin:$PASS"

paso "1/6 Docker"
if ! docker info >/dev/null 2>&1; then
  echo "Abriendo Docker Desktop..."
  powershell.exe -NoProfile -Command "Start-Process \"\$env:LOCALAPPDATA\\Programs\\DockerDesktop\\Docker Desktop.exe\"" >/dev/null 2>&1
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
fi
docker info >/dev/null 2>&1 || fallo "Docker no responde. Abre Docker Desktop y vuelve a ejecutar."
echo "Docker listo"

paso "2/6 Jenkins"
if ! cn -u "$U" "$J/api/json"; then
  JENKINS_ADMIN_PASSWORD="$PASS" docker compose -p pnk-jenkins -f docker-compose.jenkins.yml up -d --build >/dev/null 2>&1 \
    || fallo "No se pudo levantar Jenkins (docker compose)."
  for _ in $(seq 1 60); do cn -u "$U" "$J/api/json" && break; sleep 5; done
fi
cn -u "$U" "$J/api/json" || fallo "Jenkins no responde en $J (revisa la clave)."
echo "Jenkins listo en $J"

paso "3/6 Credenciales de AWS (portapapeles)"
if [ "${SKIP_CREDS:-0}" = "1" ]; then
  echo "Se usan las credenciales ya guardadas en Jenkins (SKIP_CREDS=1)"
else
  CRED="$(powershell.exe -NoProfile -Command Get-Clipboard 2>/dev/null | tr -d '\r')"
  for k in aws_access_key_id aws_secret_access_key aws_session_token; do
    printf '%s' "$CRED" | grep -q "$k" || fallo "El portapapeles no tiene el bloque de AWS ($k falta). Copia el bloque de AWS Academy -> AWS Details -> AWS CLI: Show."
  done
  # Solo se guardan las 3 lineas de claves y se agrega siempre la cabecera [default] (a veces se copia sin ella).
  { echo "[default]"; printf '%s\n' "$CRED" | grep -E '^aws_(access_key_id|secret_access_key|session_token)'; } \
    | docker run --rm -i -v "$VOL":/j alpine sh -c 'cat > /j/pnk-secretos/aws_credentials && chmod 600 /j/pnk-secretos/aws_credentials' \
    || fallo "No se pudieron guardar las credenciales en Jenkins."
  docker run --rm -v "$VOL":/j alpine sh -c "echo $STACK > /j/pnk-secretos/aws_stack"
  powershell.exe -NoProfile -Command "Set-Clipboard -Value ' '" >/dev/null 2>&1   # limpia el portapapeles
  echo "Credenciales guardadas en Jenkins (portapapeles limpiado)"
fi

paso "4/6 Comprobando AWS"
AWSCLI=(docker run --rm --volumes-from pnk-jenkins -e AWS_SHARED_CREDENTIALS_FILE=/var/jenkins_home/pnk-secretos/aws_credentials -e AWS_DEFAULT_REGION=us-east-1 -e AWS_PAGER= amazon/aws-cli:2.31.0)
"${AWSCLI[@]}" sts get-caller-identity --query '[Account,Arn]' --output text || fallo "AWS rechazo las credenciales (¿el laboratorio esta encendido? copia las credenciales de nuevo)."
ESTADO="$("${AWSCLI[@]}" cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null)"
[ -n "$ESTADO" ] && [ "$ESTADO" != "None" ] || fallo "No existe el stack '$STACK' en esta cuenta. Deben ser las credenciales de la cuenta que creo el ambiente (la de Savka)."
echo "Stack $STACK: $ESTADO"

paso "5/6 Lanzando la pipeline de produccion"
crumb() { rm -f /tmp/jk_cj; R="$(curl -s -u "$U" -c /tmp/jk_cj "$J/crumbIssuer/api/json")"; F="$(printf '%s' "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d['crumbRequestField']+':'+d['crumb'])")"; }
ultimo() { curl -sg -u "$U" "$J/job/carta-digital/job/produccion/api/json?tree=lastBuild[number]" | python -c "import sys,json;d=json.load(sys.stdin).get('lastBuild');print(d['number'] if d else 0)"; }
crumb
ANTES="$(ultimo)"
cn -u "$U" -b /tmp/jk_cj -H "$F" -X POST "$J/job/carta-digital/build?delay=0"   # busca commits nuevos en GitHub
sleep 25
AHORA="$(ultimo)"
if [ "$AHORA" = "$ANTES" ]; then
  cn -u "$U" -b /tmp/jk_cj -H "$F" -X POST "$J/job/carta-digital/job/produccion/build"
  sleep 15
  AHORA="$(ultimo)"
fi
echo "Build produccion #$AHORA en marcha: $J/job/carta-digital/job/produccion/$AHORA/"

paso "6/6 Esperando el resultado (tarda ~10 min de pruebas + el reemplazo de las instancias)"
for _ in $(seq 1 360); do
  R="$(curl -sg -u "$U" "$J/job/carta-digital/job/produccion/$AHORA/api/json?tree=building,result" | python -c "import sys,json;d=json.load(sys.stdin);print(d['building'],d['result'])" 2>/dev/null)"
  case "$R" in False*) break;; esac
  printf '.'; sleep 10
done
echo
RES="${R#False }"
curl -s -u "$U" "$J/job/carta-digital/job/produccion/$AHORA/consoleText" | grep -E "Produccion \(AWS|Fallo la actualizacion|DESPLIEGUE RECHAZADO|Finished:" | sort -u
ALB="$("${AWSCLI[@]}" cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?contains(OutputKey,'Balanceador')||contains(OutputKey,'Url')].OutputValue" --output text 2>/dev/null)"
echo
if [ "$RES" = "SUCCESS" ]; then
  printf '\033[1;32mLISTO: produccion desplegada en AWS.\033[0m  %s   %s\n' "${URL_PUBLICA:-https://carta.academiafightclub.cl/restaurantes/1}" "$ALB"
else
  printf '\033[1;31mResultado: %s. Revisa la consola: %s/job/carta-digital/job/produccion/%s/console\033[0m\n' "$RES" "$J" "$AHORA"
  exit 1
fi
