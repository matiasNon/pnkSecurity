# Matriz de controles: ASVS v5.0 / ISO 27001:2022 / ISO 27034 / Ley 19.628

Cada control indica dónde está implementado y qué prueba lo verifica (carpeta `tests/`). ASVS se cita por capítulo
(`v5.0.0-Vx`). Arquitectura evaluada: frontend nginx (estático) + backend API REST Node/Express + RDS PostgreSQL 17 + EFS,
detrás de un ALB con 2 Auto Scaling Groups y Cloudflare. Revisión de privacidad y hallazgos: `docs/REVISION_SSDLC_PRIVACIDAD.md`.

| Riesgo / requisito | ASVS v5 | ISO 27001 (Anexo A) | Implementación | Prueba / evidencia |
|---|---|---|---|---|
| Inyección SQL | V1, V2 | A.8.28 | Consultas parametrizadas (`src/models`); ids validados como enteros (`utils/validar.js`) | `carta.test.js`, `carrito.test.js` (SQLi en ids y cantidades) |
| XSS | V1, V3 | A.8.28 | API solo JSON; el frontend pinta con `textContent` (nunca `innerHTML`); CSP sin inline en frontend y consola | `comentarios.test.js`, e2e (comentario con `<script>` se ve como texto) |
| CSRF | V3 | A.8.26 | Token por sesión (`X-CSRF-Token`, `timingSafeEqual`); escrituras solo JSON (415 si no); SameSite=Strict | `carrito`, `auth`, `comentarios`, `admin`, `cuenta` (403 sin token) |
| Autenticación | V6 | A.5.17, A.8.5 | scrypt, mensajes genéricos, hash señuelo, regeneración de sesión | `auth.test.js`, `unidades.test.js` |
| Fuerza bruta / abuso | V2, V6 | A.8.5, A.8.16 | Límites en BD (par, cuenta, IP); IP real detrás de Cloudflare solo desde sus rangos (`middleware/cloudflare.js`) | `auth.test.js`, `cuenta.test.js` (429), `cloudflare.test.js` |
| Sesiones | V7 | A.8.5 | Cookie Secure/HttpOnly/SameSite=Strict, 30 min de inactividad, 8 h máximo, almacén en PostgreSQL (sirve con varias instancias) | `cabeceras.test.js`; curl en producción |
| Control de acceso / IDOR | V8 | A.5.15, A.8.3 | Rol admin verificado en BD en cada petición; panel acotado a `restaurante_id`; "mi cuenta" usa solo la sesión | `admin.test.js`, `cuenta.test.js`, e2e (cliente no entra al CRUD) |
| Lógica de negocio del carrito | V2 | A.8.26 | Precio y nombre siempre desde la BD; cantidad 1..50 y máximo 50 unidades por carrito | `carrito.test.js` (21 casos de UPDATE) |
| Subida de archivos | V5 | A.8.26 | Tipo por contenido, 2 MB, nombre aleatorio, volumen EFS aparte | `admin.test.js` |
| Comunicaciones | V12 | A.8.20, A.8.24 | Cloudflare (Let's Encrypt) -> ALB HTTPS -> RDS TLS con la CA verificada (`pg_stat_ssl`); EFS por túnel TLS; HSTS | Consola `/api/` en vivo; `cabeceras.test.js` |
| Configuración y secretos | V13 | A.8.9 | Secrets Manager (5 secretos); prod no arranca con secretos débiles; consola sin datos sensibles | `unidades.test.js`, `estado.test.js` |
| Mínimo privilegio en BD | V13 | A.8.2, A.8.3 | Rol `carta_app` solo DML, sin dueño de tablas; migraciones con el maestro solo al arrancar (`scripts/preparar-bd.js`) | e2e 12/12 con `carta_app`; `DROP` denegado; consola "Mínimo privilegio ✓" |
| Datos en reposo | V14 | A.8.24 | RDS, EFS y EBS cifrados; contraseñas con hash | `carta-digital.yaml` |
| Privacidad y derechos del titular | V14 | A.5.34 | `/privacidad` (Ley 19.628; preparación 21.719); acceso/portabilidad, rectificación y supresión con anonimización | `cuenta.test.js`, e2e `Privacidad` |
| Registro y errores | V16 | A.8.15, A.8.28 | Eventos JSON (`AUTH`, `SEC`, `PRIV`); errores genéricos; CloudWatch con retención de 30 días | `carta.test.js`, `estado.test.js` (503 sin detalle) |
| Dependencias y contenedor | V15 | A.8.8, A.8.9 | Pipeline: Gitleaks, npm audit + OSV, Dependency-Check, Trivy, ZAP; `node:24-alpine` sin npm, usuario no root, FS de solo lectura, `cap_drop: ALL` | `Jenkinsfile`; `docker-compose.aws.yml` |
| Disponibilidad | — | A.8.14 | ALB + 2 ASG en 2 zonas; reemplazo escalonado (`actualizar.sh`) sin cortar el servicio | Consola `/api/` (balanceo en vivo) |

**ISO 27034:** los controles de esta matriz forman el Marco Normativo de la Aplicación (ANF), derivado del marco de la
organización (ONF). El nivel de confianza se verifica en cada cambio con el ambiente QA efímero (`scripts/qa.sh` / etapas QA del
`Jenkinsfile`) antes de pasar a producción.
