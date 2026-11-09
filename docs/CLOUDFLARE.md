# Cloudflare como capa de seguridad (tunel rapido listo; WAF al tener dominio)

## Opcion A: Cloudflare Tunnel rapido (sin dominio ni cuenta)

`docker-compose.cloudflare.yml` agrega un contenedor `cloudflared` que abre una conexion **saliente** hacia Cloudflare y entrega una URL
`https://<palabras>.trycloudflare.com` con certificado valido; el trafico pasa por la red de Cloudflare antes de llegar a nginx.

```bash
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloudflare.yml"
$C up -d --build
$C logs cloudflared | grep trycloudflare      # muestra la URL publica
```

- nginx toma la IP real del visitante de `CF-Connecting-IP` **solo** si la conexion viene de la red interna de Docker (no es falsificable desde internet).
- `--no-tls-verify` se usa solo entre `cloudflared` y nginx (misma red interna, certificado autofirmado).
- Limitaciones: la URL cambia al reiniciar y el tunel rapido no ofrece WAF ni reglas de tasa de Cloudflare (eso requiere dominio, opcion B).

## Opcion B: dominio propio (WAF, SSL Full strict, reglas)


Cloudflare solo protege dominios que pasan por sus servidores DNS. Como el proyecto se despliega **solo con IP publica de AWS**
(sin dominio), el proxy no se puede activar todavia. La aplicacion ya esta lista; al contar con un dominio se hace asi:

1. Alta del dominio en Cloudflare y cambio de los NS en el registrador.
2. DNS: registro `A  carta  ->  IP de la EC2` con **Proxy activado** (nube naranja).
3. SSL/TLS -> modo **Full (strict)**; Origin Server -> crear un *Certificado de Origen* y reemplazar `infra/certs/carta.crt` y
   `carta.key` (el autofirmado deja de ser necesario). Activar *Always Use HTTPS* y *Min TLS 1.2*.
4. En el `.env.prod`: `PUBLIC_HOST=carta.midominio.cl`. La app ya fuerza HTTPS y envia HSTS.
5. Security Group de AWS: permitir 80/443 solo desde los rangos de IP de Cloudflare (https://www.cloudflare.com/ips/), de modo
   que nadie pueda saltarse el WAF yendo directo a la IP.
6. Seguridad -> WAF: reglas administradas de OWASP, *Bot Fight Mode* y una regla de limitacion de tasa (p. ej. `/login`:
   10 peticiones por minuto por IP; complementa los limites de nginx y de la propia app).
7. IP real del visitante: nginx debe tomar `CF-Connecting-IP` (modulo `realip` con los rangos de Cloudflare) para que los
   contadores de intentos de la app sigan contando por IP de cliente y no por IP de Cloudflare.

Hasta entonces, las capas activas son: nginx (TLS 1.2/1.3 + limitacion de tasa), la app (CSP, CSRF, limitacion de intentos)
y el Security Group de AWS.
