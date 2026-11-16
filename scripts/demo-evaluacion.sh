#!/usr/bin/env bash
# Demostracion automatica para la evaluacion: muestra, paso a paso y con explicacion, que cumple la Eva 3 y la Eva 4.
# Solo LEE (no crea ni borra nada), salvo la prueba opcional de alta disponibilidad (HA=1), que apaga 1 servidor backend.
#
#   bash scripts/demo-evaluacion.sh                       # con pausas: ENTER para pasar a la siguiente seccion
#   PAUSAS=0 bash scripts/demo-evaluacion.sh              # todo seguido
#   HA=1 bash scripts/demo-evaluacion.sh                  # ademas apaga 1 backend y muestra que el sitio no se cae
#   URL=https://carta.pnkcarta.me bash scripts/demo-evaluacion.sh
#
# Requisitos: Docker Desktop abierto, Jenkins levantado (bash scripts/jenkins-aws.sh lo deja listo) y el laboratorio de AWS encendido.
set -uo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
URL="${URL:-https://carta.academiafightclub.cl}"
STACK="${STACK:-carta-digital}"
PAUSAS="${PAUSAS:-1}"
J="http://localhost:8081"

C='\033[1;36m'; V='\033[1;32m'; R='\033[1;31m'; N='\033[0m'
titulo() { printf "\n${C}============================================================\n %s\n============================================================${N}\n" "$*"; }
decir()  { printf "${V}>> %s${N}\n" "$*"; }          # lo que se le dice al profe
cmd()    { printf "${C}\$ %s${N}\n" "$*"; }
pausa()  { [ "$PAUSAS" = "1" ] && read -r -p "   [ENTER para continuar] " _ || true; }
estado() { code="$1"; esp="$2"; [ "$code" = "$esp" ] && printf "${V}OK${N}" || printf "${R}FALLA${N}"; }
codigo() { curl -s -w '
%{http_code}' --max-time 20 "$@" | tail -n1; }   # sin -o /dev/null (falla con MSYS_NO_PATHCONV)

AWSCLI=(docker run --rm --volumes-from pnk-jenkins -e AWS_SHARED_CREDENTIALS_FILE=/var/jenkins_home/pnk-secretos/aws_credentials -e AWS_DEFAULT_REGION=us-east-1 -e AWS_PAGER= amazon/aws-cli:2.31.0)
A() { "${AWSCLI[@]}" "$@" 2>&1; }

# ------------------------------------------------------------------------------------------------------------------
titulo "1. CODIGO: frontend + backend + Docker en ramas Git (Eva 3)"
decir "El proyecto esta en GitHub, en ramas separadas por ambiente: carta-digital-node (desarrollo), qa y produccion."
cmd "git ls-remote --heads origin"
git ls-remote --heads origin 2>/dev/null | sed -E 's/^([0-9a-f]{7})[0-9a-f]+\t/\1  /' | grep -E "carta-digital-node|qa|produccion" || echo "(sin acceso a GitHub)"
decir "Frontend (HTML+JS en nginx) y backend (Node 24 + Express, API) van en contenedores distintos."
cmd "ls Dockerfile frontend/Dockerfile docker-compose*.yml"
ls Dockerfile frontend/Dockerfile docker-compose.yml docker-compose.dev.yml docker-compose.qa.yml docker-compose.prod.yml docker-compose.aws.yml 2>/dev/null
cmd "grep -h '^FROM' Dockerfile frontend/Dockerfile"
grep -h '^FROM' Dockerfile frontend/Dockerfile
decir "3 ambientes: dev, qa y prod, cada uno con su docker-compose. Produccion en AWS usa docker-compose.aws.yml."
pausa

# ------------------------------------------------------------------------------------------------------------------
titulo "2. AWS: RDS PostgreSQL + Load Balancer + Auto Scaling (Eva 3)"
if ! docker ps --format '{{.Names}}' | grep -q '^pnk-jenkins$'; then
  printf "${R}Jenkins no esta levantado: no se pueden leer los recursos de AWS. Ejecuta: bash scripts/jenkins-aws.sh${N}\n"
elif ! A cloudformation list-stacks --max-items 1 --query 'StackSummaries[0].StackName' --output text >/dev/null; then
  printf "${R}Las credenciales de AWS Academy caducaron o no estan: enciende el laboratorio y ejecuta bash scripts/jenkins-aws.sh (paso 3).${N}\n"
else
  decir "Todo se crea con UN stack de CloudFormation (infra/aws/carta-digital.yaml) lanzado por infra/aws/desplegar.sh."
  cmd "aws cloudformation describe-stacks --stack-name $STACK"
  A cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].[StackName,StackStatus]' --output text
  decir "Base de datos: Amazon RDS PostgreSQL 17, privada (no tiene IP publica), cifrada, con TLS."
  cmd "aws rds describe-db-instances"
  A rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,Engine,EngineVersion,DBInstanceStatus,PubliclyAccessible,StorageEncrypted]' --output table
  decir "Load Balancer (ALB) con reglas por ruta: /api/* y /uploads/* van al backend; todo lo demas, al frontend."
  cmd "aws elbv2 describe-load-balancers / describe-rules"
  A elbv2 describe-load-balancers --query 'LoadBalancers[].[LoadBalancerName,Scheme,Type,DNSName]' --output text
  LB=$(A elbv2 describe-load-balancers --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  for L in $(A elbv2 describe-listeners --load-balancer-arn "$LB" --query 'Listeners[].ListenerArn' --output text); do
    A elbv2 describe-rules --listener-arn "$L" --query 'Rules[].[Priority,to_string(Conditions[0].PathPatternConfig.Values)]' --output text | sed 's/	null/	(todo lo demas -> frontend)/;s/^/   regla /'
  done
  decir "Auto Scaling: 2 grupos (frontend y backend), minimo 2 instancias cada uno, repartidas en 2 zonas de disponibilidad."
  cmd "aws autoscaling describe-auto-scaling-groups"
  A autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[].[AutoScalingGroupName,MinSize,DesiredCapacity,MaxSize,length(Instances),AvailabilityZones|join(`,`,@)]' --output table
  decir "Salud de las instancias detras del balanceador (health check): todas deben decir healthy."
  for t in back front; do
    TG=$(A elbv2 describe-target-groups --names "$STACK-tg-$t" --query 'TargetGroups[0].TargetGroupArn' --output text)
    printf "   %-6s " "$t"; A elbv2 describe-target-health --target-group-arn "$TG" --query 'TargetHealthDescriptions[].TargetHealth.State' --output text
  done
  decir "Secretos (clave de BD, clave de sesion, clave inicial del admin) en AWS Secrets Manager, no en el repositorio."
  A secretsmanager list-secrets --query 'SecretList[].Name' --output text | tr '\t' '\n' | sed 's/^/   /'
fi
pausa

# ------------------------------------------------------------------------------------------------------------------
titulo "3. CLOUDFLARE: DNS + HTTPS (paso manual de la Eva 3)"
decir "El visitante entra por Cloudflare (DNS + certificado HTTPS + proxy); Cloudflare reenvia al balanceador de AWS."
cmd "curl -sI $URL/restaurantes/1"
curl -sI --max-time 20 "$URL/restaurantes/1" | grep -iE "^(HTTP|server|strict-transport|content-security|x-frame|x-content-type)" | cut -c1-110
printf "   HTTP -> HTTPS (debe ser 301): "; codigo "${URL/https:/http:}/restaurantes/1"; echo
decir "La unica parte manual es crear el CNAME en Cloudflare apuntando al nombre DNS del balanceador (docs/CLOUDFLARE.md)."
pausa

# ------------------------------------------------------------------------------------------------------------------
titulo "4. LA APLICACION FUNCIONA (Eva 3)"
for p in /restaurantes/1 /restaurantes/2 /restaurantes/7 /api/restaurantes/1 /privacidad /admin; do
  c=$(codigo "$URL$p"); printf "   %-26s %s  " "$p" "$c"; estado "$c" 200; echo
done
decir "Ahora, en el navegador: ver la carta, agregar al carrito, iniciar sesion, comentar y entrar a /admin (CRUD de productos)."
pausa

# ------------------------------------------------------------------------------------------------------------------
titulo "5. SEGURIDAD: los ataques de la version vulnerable ya no funcionan (OWASP / ASVS)"
c=$(codigo "$URL/api/restaurantes/1%20OR%201=1"); printf "   SQL injection en el id          -> %s  " "$c"; estado "$c" 404; echo
c=$(codigo "$URL/api/restaurantes/abc");           printf "   id con letras                   -> %s  " "$c"; estado "$c" 404; echo
c=$(codigo -X POST -H 'Content-Type: application/json' -d '{"texto":"x"}' "$URL/api/restaurantes/1/comentarios"); printf "   POST sin token CSRF             -> %s  " "$c"; estado "$c" 403; echo
c=$(codigo -X POST -H 'Content-Type: application/json' -d '{"email":"admin@gmail.com","password":"incorrecta"}' "$URL/api/login"); printf "   Login sin token CSRF            -> %s  " "$c"; estado "$c" 403; echo
decir "Consultas parametrizadas, validacion con zod, CSRF, CSP/HSTS, sesiones en PostgreSQL, hash de claves, limite de intentos."
pausa

# ------------------------------------------------------------------------------------------------------------------
titulo "6. JENKINS: pipeline Dev -> QA -> filtros de seguridad -> produccion (Eva 4)"
P="${JENKINS_PASSWORD:-}"; [ -n "$P" ] || { [ -f "$HOME/.pnk_jenkins_pass" ] && P="$(tr -d '\r\n' < "$HOME/.pnk_jenkins_pass")"; }
if curl -sf -u "admin:$P" "$J/api/json" >/dev/null; then
  decir "El despliegue a produccion SOLO ocurre si todas las etapas pasan; si una falla, se rechaza."
  for r in produccion qa; do
    curl -s -u "admin:$P" "$J/job/carta-digital/job/$r/lastBuild/wfapi/describe" | python -c "
import sys,json
d=json.load(sys.stdin)
print('   rama $r -> build', d['name'], d['status'], '(%.1f min)' % (d['durationMillis']/60000))
if '$r'=='produccion':
  for s in d['stages']:
    if not s['name'].startswith('Declarative'): print('      %-10s %s' % (s['status'], s['name']))" 2>/dev/null
  done
  decir "Herramientas OWASP/MITRE: Gitleaks (secretos), npm audit + OSV (CVE), Dependency-Check (CVE/CWE de NVD/MITRE), Trivy (imagenes), ZAP (ataque dinamico)."
  decir "Abrir en el navegador: $J/job/carta-digital/  (usuario admin) para mostrar el Stage View y los reportes."
else
  printf "${R}Jenkins no responde en $J. Ejecuta: bash scripts/jenkins-aws.sh${N}\n"
fi
pausa

# ------------------------------------------------------------------------------------------------------------------
if [ "${HA:-0}" = "1" ]; then
  titulo "7. ALTA DISPONIBILIDAD: se apaga 1 servidor y el sitio sigue funcionando"
  INST=$(A autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$STACK-asg-back" --query 'AutoScalingGroups[0].Instances[0].InstanceId' --output text)
  decir "Apago el backend $INST. El Auto Scaling lo reemplaza solo."
  A autoscaling terminate-instance-in-auto-scaling-group --instance-id "$INST" --no-should-decrement-desired-capacity --query 'Activity.Description' --output text
  for i in $(seq 1 12); do
    w=$(codigo "$URL/restaurantes/1"); x=$(codigo "$URL/api/restaurantes/1")
    n=$(A autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$STACK-asg-back" --query 'length(AutoScalingGroups[0].Instances[?LifecycleState==`InService`])' --output text)
    printf "   %s sitio:%s api:%s  backends InService:%s\n" "$(date +%T)" "$w" "$x" "$n"; sleep 10
  done
fi

titulo "FIN. Prueba de borrar y redesplegar (se hace aparte, en CloudShell): bash infra/aws/destruir.sh  y luego  bash infra/aws/desplegar.sh"
