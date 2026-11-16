#!/usr/bin/env bash
# Menu unico para el dia de la evaluacion. Se abre con el acceso directo del escritorio (PNK-Evaluacion.bat).
# Deja todo listo (Docker, Jenkins, credenciales de AWS) y permite: desplegar por Jenkins, mostrar la demo,
# DESTRUIR y volver a DESPLEGAR todo el ambiente de AWS, y abrir las paginas que se muestran en la evaluacion.
#
# Las credenciales del laboratorio de AWS Academy caducan con cada sesion: copiar el bloque
# (AWS Details -> AWS CLI -> Show -> Ctrl+C) y el menu lo toma solo del portapapeles cuando hace falta.
set -uo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
REPO_DIR="$(pwd)"
REPO_WIN="$(pwd -W 2>/dev/null || pwd)"
J="http://localhost:8081"
STACK="${STACK:-carta-digital}"
VOL="pnk-jenkins_jenkins_home"
IMG="amazon/aws-cli:2.31.0"

C='\033[1;36m'; V='\033[1;32m'; R='\033[1;31m'; A='\033[1;33m'; N='\033[0m'
paso()  { printf "\n${C}== %s${N}\n" "$*"; }
ok()    { printf "${V}%s${N}\n" "$*"; }
aviso() { printf "${A}%s${N}\n" "$*"; }
error() { printf "${R}%s${N}\n" "$*"; }
cn()    { curl -s "$@" >/dev/null; }                 # curl sin salida (con MSYS_NO_PATHCONV, "-o /dev/null" no funciona)
espera() { read -r -p "   [ENTER para volver al menu] " _ || true; }
abrir() { powershell.exe -NoProfile -Command "Start-Process '$1'" >/dev/null 2>&1; }

# Clave de Jenkins: ~/.pnk_jenkins_pass o se pregunta.
jenkins_clave() {
  PASS="${JENKINS_PASSWORD:-}"
  [ -n "$PASS" ] || { [ -f "$HOME/.pnk_jenkins_pass" ] && PASS="$(tr -d '\r\n' < "$HOME/.pnk_jenkins_pass")"; }
  [ -n "$PASS" ] || { read -rsp "Clave del usuario admin de Jenkins: " PASS; echo; }
}

docker_listo() {
  if ! docker info >/dev/null 2>&1; then
    echo "Abriendo Docker Desktop (puede tardar 1-2 min)..."
    powershell.exe -NoProfile -Command "Start-Process \"\$env:LOCALAPPDATA\\Programs\\DockerDesktop\\Docker Desktop.exe\"" >/dev/null 2>&1
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
  fi
  docker info >/dev/null 2>&1 || { error "Docker no responde. Abre Docker Desktop y vuelve a intentar."; return 1; }
  ok "Docker listo"
}

jenkins_listo() {
  jenkins_clave
  if ! cn -fu "admin:$PASS" "$J/api/json"; then
    echo "Levantando Jenkins..."
    JENKINS_ADMIN_PASSWORD="$PASS" docker compose -p pnk-jenkins -f docker-compose.jenkins.yml up -d --build >/dev/null 2>&1 \
      || { error "No se pudo levantar Jenkins (docker compose)."; return 1; }
    for _ in $(seq 1 60); do cn -fu "admin:$PASS" "$J/api/json" && break; sleep 5; done
  fi
  cn -fu "admin:$PASS" "$J/api/json" || { error "Jenkins no responde en $J (revisa la clave)."; return 1; }
  ok "Jenkins listo en $J  (usuario admin)"
}

# Ejecuta el cliente de AWS con las credenciales guardadas en el volumen de Jenkins.
aws_run() {
  docker run --rm -v "$VOL":/j -e AWS_SHARED_CREDENTIALS_FILE=/j/pnk-secretos/aws_credentials \
    -e AWS_DEFAULT_REGION=us-east-1 -e AWS_PAGER= "$IMG" "$@" 2>&1
}
# Valida con una consulta real (sts responde bien aunque la sesion del laboratorio ya no tenga permisos: AccessDenied).
creds_ok() { aws_run cloudformation list-stacks --max-items 1 --query 'StackSummaries[0].StackName' --output text >/dev/null; }

# Si las credenciales no sirven, las toma del portapapeles (bloque de AWS Academy) y las guarda en el volumen de Jenkins.
creds_listas() {
  paso "Credenciales de AWS"
  if creds_ok; then ok "Las credenciales guardadas sirven"; return 0; fi
  aviso "Las credenciales no estan o caducaron. Buscando en el portapapeles..."
  local CRED k
  CRED="$(powershell.exe -NoProfile -Command Get-Clipboard 2>/dev/null | tr -d '\r')"
  for k in aws_access_key_id aws_secret_access_key aws_session_token; do
    if ! printf '%s' "$CRED" | grep -q "$k"; then
      error "No hay credenciales en el portapapeles. Enciende el laboratorio, abre AWS Details -> AWS CLI -> Show, COPIA el bloque (Ctrl+C) y repite."
      return 1
    fi
  done
  { echo "[default]"; printf '%s\n' "$CRED" | grep -E '^aws_(access_key_id|secret_access_key|session_token)'; } \
    | docker run --rm -i -v "$VOL":/j alpine sh -c 'mkdir -p /j/pnk-secretos && cat > /j/pnk-secretos/aws_credentials && chmod 600 /j/pnk-secretos/aws_credentials' \
    || { error "No se pudieron guardar las credenciales."; return 1; }
  docker run --rm -v "$VOL":/j alpine sh -c "echo $STACK > /j/pnk-secretos/aws_stack"
  powershell.exe -NoProfile -Command "Set-Clipboard -Value ' '" >/dev/null 2>&1   # limpia el portapapeles
  if creds_ok; then ok "Credenciales nuevas guardadas (portapapeles limpiado)"; return 0; fi
  error "AWS rechazo las credenciales. ¿El laboratorio esta encendido? Copia el bloque de nuevo."
  return 1
}

estado_stack() {
  local e; e="$(aws_run cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null)"
  case "$e" in *CREATE_COMPLETE*|*UPDATE_COMPLETE*|*ROLLBACK_COMPLETE*|*_IN_PROGRESS*|*FAILED*) echo "$e" ;; *) echo "NO_EXISTE" ;; esac
}

# Corre destruir.sh / desplegar.sh dentro de un contenedor (necesitan bash, openssl, python3, curl y aws).
infra_run() {   # $1 = destruir.sh | desplegar.sh
  docker run --rm -v "$REPO_WIN":/work -v "$VOL":/j \
    -e AWS_SHARED_CREDENTIALS_FILE=/j/pnk-secretos/aws_credentials -e AWS_DEFAULT_REGION=us-east-1 -e AWS_PAGER= \
    -e SI=1 -e DOMINIO="${DOMINIO:-}" -e RAMA="${RAMA:-produccion}" --entrypoint bash "$IMG" -c '
      dnf install -y -q openssl >/dev/null 2>&1
      rm -rf /tmp/w && mkdir -p /tmp/w && cp -r /work/infra /tmp/w/infra
      sed -i "s/\x0d\$//" /tmp/w/infra/aws/*.sh
      bash /tmp/w/infra/aws/"$1"; rc=$?
      [ -f /tmp/w/infra/aws/salida.env ] && cp /tmp/w/infra/aws/salida.env /work/infra/aws/salida.env
      exit $rc' _ "$1"
}

preguntar_dominio() {
  echo "Dominio publico para la app (si el sitio se ve por un dominio de Cloudflare, ponlo aqui)."
  read -r -p "   Dominio [ENTER = sin dominio, como en el ensayo]: " d
  DOMINIO="$d"; export DOMINIO
}

fin_despliegue() {
  local dns=""
  [ -f infra/aws/salida.env ] && dns="$(grep '^ALB_DNS=' infra/aws/salida.env | cut -d= -f2-)"
  if [ -n "$dns" ]; then
    printf '%s' "$dns" | clip.exe 2>/dev/null
    echo
    ok "Balanceador NUEVO: $dns   (ya esta copiado al portapapeles)"
    aviso "Falta 1 paso manual: en Cloudflare edita el CNAME 'carta' y pega ese destino."
    read -r -p "   ¿Abrir Cloudflare DNS ahora? [s/N] " r
    case "$r" in s|S) abrir "https://dash.cloudflare.com/6a5935dfb1f5d636c613b12ecc96bbb1/academiafightclub.cl/dns/records";; esac
  fi
}

opcion_preparar() {
  paso "Preparando: Docker + Jenkins + credenciales"
  docker_listo && jenkins_listo && creds_listas && { echo; ok "TODO LISTO. Stack: $(estado_stack)"; }
}

opcion_jenkins_deploy() {
  paso "Lanzando el despliegue por Jenkins (~13 min)"
  # El menu ya valida/guarda las credenciales; jenkins-aws.sh no debe volver a pedirlas del portapapeles (ya esta limpio).
  docker_listo && jenkins_listo && creds_listas && SKIP_CREDS=1 bash scripts/jenkins-aws.sh
}

opcion_demo() {
  docker_listo && jenkins_listo && bash scripts/demo-evaluacion.sh
}

opcion_demo_ha() {
  docker_listo && jenkins_listo && HA=1 bash scripts/demo-evaluacion.sh
}

opcion_destruir_desplegar() {
  paso "DESTRUIR y volver a DESPLEGAR todo el ambiente de AWS"
  docker_listo && creds_listas || return
  echo "Stack actual: $(estado_stack)"
  aviso "Se BORRA la aplicacion '$STACK' (servidores y balanceador) y luego se vuelve a crear."
  aviso "La base de datos RDS, las fotos (EFS) y las claves se CONSERVAN en '$STACK-datos'. Los scripts no las borran nunca."
  aviso "Cambia la direccion del balanceador: al terminar hay que editar el CNAME 'carta' en Cloudflare."
  read -r -p "   Escribe BORRAR para continuar: " r
  [ "$r" = "BORRAR" ] || { echo "Cancelado."; return; }
  preguntar_dominio
  local t0=$(date +%s)
  paso "1/2 Destruyendo"
  infra_run destruir.sh || { error "Fallo la destruccion."; return; }
  paso "2/2 Desplegando"
  infra_run desplegar.sh || { error "Fallo el despliegue."; return; }
  ok "Destruir + desplegar terminado en $(( ($(date +%s) - t0) / 60 )) min"
  fin_despliegue
}

opcion_solo_desplegar() {
  paso "Desplegar (crear) el ambiente de AWS"
  docker_listo && creds_listas || return
  local e; e="$(estado_stack)"
  [ "$e" = "NO_EXISTE" ] || { aviso "Ya existe un stack ($e). Para recrearlo usa la opcion 6."; return; }
  preguntar_dominio
  local t0=$(date +%s)
  infra_run desplegar.sh || { error "Fallo el despliegue."; return; }
  ok "Desplegado en $(( ($(date +%s) - t0) / 60 )) min"
  fin_despliegue
}

opcion_abrir() {
  paso "Abriendo las paginas de la evaluacion"
  abrir "https://carta.academiafightclub.cl/restaurantes/1"
  abrir "$J/job/carta-digital/job/produccion/"
  abrir "https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks"
  abrir "https://dash.cloudflare.com/6a5935dfb1f5d636c613b12ecc96bbb1/academiafightclub.cl/dns/records"
  abrir "https://github.com/matiasNon/pnkSecurity/tree/carta-digital-node"
  ok "Listo (se abren en tu navegador)."
}

while true; do
  clear 2>/dev/null || true
  printf "${C}============================================================\n  PNK SECURITY - Menu de la evaluacion (Eva 3 + Eva 4)\n============================================================${N}\n"
  cat <<'MENU'
  Orden de la evaluacion (de arriba hacia abajo):
  1) Preparar todo       (Docker + Jenkins + credenciales de AWS)
  2) Abrir las paginas de la evaluacion en el navegador
  3) Mostrar la demo          (infraestructura, seguridad, Jenkins)
  4) Demo + alta disponibilidad (apaga 1 servidor y el sitio sigue)
  5) Desplegar por Jenkins    (pipeline completa a produccion, ~13 min)
  6) DESTRUIR y DESPLEGAR la app en AWS (la BD se conserva, pide confirmacion)
  7) Solo DESPLEGAR            (si el ambiente no existe)
  0) Salir
MENU
  read -r -p "Opcion: " op || exit 0
  case "$op" in
    1) opcion_preparar; espera;;
    2) opcion_abrir; espera;;
    3) opcion_demo; espera;;
    4) opcion_demo_ha; espera;;
    5) opcion_jenkins_deploy; espera;;
    6) opcion_destruir_desplegar; espera;;
    7) opcion_solo_desplegar; espera;;
    0|q|Q) exit 0;;
    *) aviso "Opcion no valida"; sleep 1;;
  esac
done
