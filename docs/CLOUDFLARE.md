# Cloudflare: DNS y HTTPS para la carta digital (paso manual)

Estado al 11-11-2026: **activo** en `https://carta.pnkcarta.me` (dominio `pnkcarta.me`, Namecheap con GitHub Student Pack;
plan Free de Cloudflare). Es el único paso que no hace `infra/aws/desplegar.sh`, tal como pide el requisito.

```
Visitante --HTTPS (cert. Let's Encrypt de Cloudflare)--> Cloudflare --HTTPS (modo Full)--> ALB --> frontend / backend
```

## 1. Configuración (una sola vez)

1. **Cloudflare -> Add a domain** -> `pnkcarta.me` -> plan **Free**. La importación de registros puede dejar los antiguos
   (GitHub Pages, correo): no afectan a la carta.
2. **DNS -> Records -> Add record**
   - Type `CNAME`, Name `carta`, Target = DNS del ALB (`ALB_DNS` en `infra/aws/salida.env`, por ejemplo
     `carta-digital-alb-1105003705.us-east-1.elb.amazonaws.com`), **Proxied** (nube naranja).
3. **Overview -> nameservers asignados** (en esta cuenta: `carter.ns.cloudflare.com` y `lila.ns.cloudflare.com`).
4. **Namecheap -> Domain List -> Manage -> Nameservers -> Custom DNS** -> pegar los dos -> guardar (✓ verde).
   La propagación en el registro `.me` tomó unos 5 minutos; Cloudflare activó la zona unos minutos después.
5. **SSL/TLS -> Overview -> Full** (no "Full (strict)": el ALB usa un certificado autofirmado importado en ACM y con strict
   Cloudflare respondería con el error 526).
6. **SSL/TLS -> Edge Certificates -> Always Use HTTPS: ON**.

## 2. Verificación

```bash
dig +short NS pnkcarta.me @a0.nic.me          # carter / lila .ns.cloudflare.com
dig +short carta.pnkcarta.me                  # IP de Cloudflare (104.21.x / 172.67.x), no la del ALB
curl -sI https://carta.pnkcarta.me/           # server: cloudflare, strict-transport-security
curl -sI http://carta.pnkcarta.me/            # 301 -> https
curl -s https://carta.pnkcarta.me/api/estado  # backend ok, baseDatos.tls = true
```

Resultado del 11-11-2026: certificado válido (Let's Encrypt), HTTP->HTTPS 301, HSTS, `/api/health` 200, `/admin` 200,
`/api/admin/*` 401 sin sesión, cookie `Secure; HttpOnly; SameSite=Strict`.

Si el PC no resuelve el nombre recién creado (caché negativa): `resolvectl flush-caches`.

## 3. Al recrear el ambiente (prueba de borrar y volver a desplegar)

`destruir.sh` + `desplegar.sh` crean un **ALB nuevo con otro nombre DNS**. Lo único que hay que hacer es editar el CNAME
`carta` en Cloudflare con el nuevo `ALB_DNS` de `infra/aws/salida.env`. Nameservers, SSL y "Always Use HTTPS" no cambian.
Para que la app redirija al dominio: `DOMINIO=carta.pnkcarta.me bash infra/aws/desplegar.sh`.

## 4. IP real del visitante

Con Cloudflare delante, quien se conecta al ALB es un nodo de Cloudflare. La app (`TRUST_CLOUDFLARE=1` en
`docker-compose.aws.yml`) toma la IP del visitante desde `CF-Connecting-IP` **solo si** la conexión viene de un rango oficial de
Cloudflare (`src/middleware/cloudflare.js`); así los límites por IP y los registros de seguridad siguen siendo útiles, y la
cabecera no se puede falsificar llegando directo al ALB.

## 5. Mejoras opcionales (no requeridas)

- **Full (strict):** crear un *Origin Certificate* en Cloudflare e importarlo a ACM en vez del autofirmado.
- **Cerrar el acceso directo al ALB:** permitir 443 en su Security Group solo desde los rangos de Cloudflare
  (https://www.cloudflare.com/ips/). Lo debe aplicar el responsable de AWS.
- **WAF / reglas de tasa** del plan Free (Security -> WAF), por ejemplo para `/api/login`.

## Alternativa sin dominio

`docker-compose.cloudflare.yml` (túnel rápido `*.trycloudflare.com`) sigue disponible para el ambiente con una sola EC2;
la URL cambia en cada reinicio y no ofrece WAF.
