# Carta digital PNK — Node.js + Express + PostgreSQL (3.ª entrega)

Reescritura de la carta digital de pnkSecurity (PHP + MySQL) con otro stack, manteniendo la misma gráfica y funciones:
ver la carta, comentar y agregar al carrito; y un panel para administrar cartas, categorías y productos.
Proyecto de **Programación Segura** — INACAP La Serena. Equipo: Matías Nonque y Savka Carvajal.

- **Stack:** Node.js 24, Express (MVC con vistas EJS), PostgreSQL 17, Docker, nginx (TLS).
- **Código seguro:** ISO/IEC 27001:2022, ISO/IEC 27034 y OWASP ASVS v5 → [matriz de controles](docs/MATRIZ_ASVS_ISO.md).
- **QA con IA:** 186 pruebas funcionales + 10 e2e → [docs/qa](docs/qa/README.md).
- **Migración MySQL → PostgreSQL:** [docs/MIGRACION.md](docs/MIGRACION.md). **Cloudflare (se configura después, al tener dominio):** [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).

## Estructura (MVC)
```
src/models/       consultas SQL parametrizadas        src/views/   plantillas EJS (carta, carrito, admin)
src/controllers/  lógica de cada ruta                  src/routes/  rutas públicas y /admin
src/middleware/   CSP, sesión, CSRF, auth, subidas     src/services/ scrypt, throttle en BD, log de seguridad
db/migrations/    001 esquema, 002 datos, 003 seguridad    scripts/  migrate, seed-usuarios, qa.sh
```

## Los tres ambientes
| Ambiente | Comando | Características |
|---|---|---|
| **Desarrollo** | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` → http://localhost:3000 | código montado con recarga, PostgreSQL en `127.0.0.1:5433`, `.env.dev` |
| **QA** | `npm run qa` | BD efímera, ejecuta pruebas funcionales y e2e, deja reportes y capturas |
| **Producción** | copiar `.env.prod.example` a `.env.prod`, `bash infra/generar-certificado.sh <IP>`, `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` | nginx TLS 1.2/1.3 en 80/443, app y BD sin puertos publicados, FS de solo lectura, secretos obligatorios |

Cuentas de demostración (solo dev/QA): `admin@gmail.com` / `admin01` (administra el restaurante 1), `alondra@gmail.com` / `alondra01` (cliente),
`admin.bahia@gmail.com` / `bahia01` (administra el restaurante 2). En producción las claves salen de `.env.prod`.

## Rutas
`GET /restaurantes/:id` · `GET /restaurantes/:id/carrito` · `POST|DELETE /restaurantes/:id/carrito/...` · `POST /restaurantes/:id/comentarios` ·
`POST /login` · `POST /logout` · `/admin/{cartas,categorias,productos}` · `GET /health`. Los enlaces antiguos `/index.php?id=N` redirigen.

## Despliegue en AWS
EC2 nueva (Ubuntu) con Security Group 22 (solo tu IP), 80 y 443; ejecutar `infra/aws-user-data.sh` (instala Docker, clona esta rama,
genera secretos y certificado, levanta producción). La instancia de la entrega anterior (Apache + PHP) no se modifica.

## Pipeline Jenkins (4.ª entrega)
Ramas: `carta-digital-node` (desarrollo), `qa` y `produccion`; solo `produccion` despliega.
`Jenkinsfile`: Desarrollo (eslint + SAST) → QA con IA (Jest/Supertest + Playwright) → filtro de seguridad (Gitleaks, npm audit + OSV,
OWASP Dependency-Check, Trivy con CVE/CWE de MITRE, OWASP ZAP) → despliegue automático a producción **solo si todo pasa**;
si hay errores o librerías vulnerables/deprecadas el despliegue se rechaza. Detalle, plugins, evidencia y riesgos en
[`docs/JENKINS.md`](docs/JENKINS.md); capturas en `docs/evidencias/jenkins/`.

```bash
docker compose -p pnk-jenkins -f docker-compose.jenkins.yml up -d --build   # http://localhost:8081
```
