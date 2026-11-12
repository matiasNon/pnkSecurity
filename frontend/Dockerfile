# syntax=docker/dockerfile:1
# FRONTEND de la carta digital: nginx sin privilegios (usuario 101, puerto 8080) sirviendo solo archivos estaticos.
# Dos variantes (mismo contenido, distinta red):
#   aws   -> solo estaticos; el balanceador (ALB) envia /api/* y /uploads/* directo al Auto Scaling Group del backend.
#   local -> ademas reenvia /api y /uploads al servicio "backend" de docker compose (dev, QA, CI y EC2 unica).

FROM nginxinc/nginx-unprivileged:1.30-alpine AS aws
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/cabeceras.inc /etc/nginx/cabeceras.inc
COPY public /usr/share/nginx/html
USER root
# Parches del sistema al construir (Trivy en el pipeline bloquea CVE HIGH/CRITICAL con arreglo disponible): la imagen
# queda al dia aunque la base en cache sea antigua. Procedimiento de parcheo: reconstruir y redesplegar (actualizar.sh).
RUN apk upgrade --no-cache \
 && mkdir -p /etc/nginx/extra && chmod -R a+rX,go-w /usr/share/nginx/html /etc/nginx
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/salud || exit 1

FROM aws AS local
COPY nginx/api-local.conf /etc/nginx/extra/api-local.conf
