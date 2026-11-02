# nginx con la configuracion incluida en la imagen (asi no depende de rutas del host, necesario cuando despliega Jenkins).
# El certificado TLS NO va en la imagen: se monta desde el volumen "pnk-prod-certs" (infra/cargar-certificado.sh).
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY proxy.conf /etc/nginx/proxy.conf
