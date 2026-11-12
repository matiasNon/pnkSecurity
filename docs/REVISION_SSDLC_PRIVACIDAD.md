# Revisión SSDLC y privacidad: Carta Digital PNK

Revisión de seguridad de la aplicación y de protección de datos personales, basada en evidencia (código, pruebas
automatizadas y verificación en producción). Marcos: ISO/IEC 27001:2022 (Anexo A), ISO/IEC 27034, OWASP ASVS v5.0.0
(citado por capítulo `v5.0.0-Vx`; el requisito exacto debe validarse contra la fuente oficial), Ley N° 19.628 y Ley N° 21.719.

- **Fecha del análisis:** 11-11-2026. Es anterior al 01-12-2026, así que aplica la **Ley 19.628 vigente**; la **Ley 21.719**
  se evalúa como **preparación (readiness)**: sus modificaciones principales entran en vigencia el 01-12-2026.
- **Alcance:** rama `front-back-separados`, despliegue AWS us-east-1 (ALB + 2 ASG + RDS PostgreSQL 17 + EFS) detrás de
  Cloudflare (`carta.pnkcarta.me`).

## 1. Inventario de datos personales

| Dato | Ubicación | Titular | ¿Sensible? | Finalidad | Retención |
|---|---|---|---|---|---|
| Nombre, email | `usuarios` (RDS) | Clientes y admin | No | Cuenta y autenticación | Mientras exista la cuenta; supresión a solicitud (H2) |
| Hash de contraseña (scrypt) | `usuarios.password_hash` | Clientes y admin | No (secreto de autenticación) | Autenticación | Igual que la cuenta |
| Nombre público + comentario | `comentarios` | Clientes | No, pero se **publica** | Mostrar opiniones | Igual que la cuenta; al suprimirla se anonimiza |
| Carrito, token CSRF, id de usuario | `sesiones` | Visitantes | No | Funcionamiento | 30 min de inactividad / 8 h máximo |
| IP y email en eventos de seguridad | CloudWatch Logs `/carta-digital/backend` | Visitantes | No | Seguridad y auditoría | **30 días** (H7) |
| Hash de cuenta/IP | `intentos` | Visitantes | No (seudonimizado) | Anti fuerza bruta | 1 hora |

- **Encargados:** Amazon Web Services (EE. UU., us-east-1) y Cloudflare (red global). Hay **transferencia internacional**, y está
  declarada en `/privacidad` (H4).
- No hay datos sensibles (salud, biométricos, NNA) ni financieros, y no se toman decisiones automatizadas. **Criticidad de
  privacidad: baja-media.**

## 2. Hallazgos y remediación

| # | Hallazgo | Marco | Riesgo | Estado | Implementación | Evidencia |
|---|---|---|---|---|---|---|
| H1 | Sin aviso de privacidad | Ley 19.628 (información al titular); 21.719 (transparencia) | Medio | **Corregido** | Página `/privacidad` (datos, finalidad, base de licitud, retención, encargados, derechos), enlace en el pie y aviso en el formulario de comentarios | e2e `Privacidad`; captura `qa/12-privacidad-mis-datos.png` |
| H2 | Sin mecanismo para ejercer derechos | Ley 19.628 arts. 12 y ss.; 21.719 (portabilidad) | Medio | **Corregido** | `GET /api/mi-cuenta/datos` (acceso y portabilidad en JSON), `PATCH /api/mi-cuenta` (rectificación, también en los comentarios), `DELETE /api/mi-cuenta` (supresión con re-autenticación, palabra de confirmación, límite de intentos y anonimización de comentarios) | `cuenta.test.js` (15 pruebas) |
| H3 | Retención indefinida | Proporcionalidad; ISO A.5.34 | Bajo-Medio | **Corregido / documentado** | Retención definida por dato (tabla 1); supresión a solicitud; logs 30 días; intentos 1 h; sesiones 8 h | `/privacidad` §2; `throttle.js`; `sesion.js` |
| H4 | Transferencia internacional no declarada | 21.719 | Bajo-Medio | **Corregido** | Declarada en `/privacidad` §3 | e2e `Privacidad` |
| H5 | La app usaba el usuario maestro de RDS | ASVS `v5.0.0-V13`; ISO A.8.2, A.8.3 | Medio | **Corregido** | `scripts/preparar-bd.js` (con el maestro, solo al arrancar) migra y crea el rol `carta_app`: sin SUPERUSER/CREATEDB/CREATEROLE, sin ser dueño de tablas, solo DML, `schema_migrations` de solo lectura. Clave en Secrets Manager (`SecretoBdApp`) | Local: `DROP TABLE items` -> "must be owner"; e2e 12/12 con `carta_app`; consola `/api/` muestra "Mínimo privilegio ✓" |
| H6 | EFS sin TLS en tránsito | ASVS `v5.0.0-V12`; ISO A.8.24 | Bajo | **Corregido (con respaldo)** | NFS dentro de un túnel TLS (stunnel, mismo esquema que amazon-efs-utils) que verifica la cadena y el host de EFS; si no levanta, monta NFS directo dentro de la VPC y la consola lo indica | Prueba de stunnel en Ubuntu 24.04 (host correcto conecta, host incorrecto rechazado); consola "En tránsito" |
| H7 | Logs solo en la instancia, sin retención | ASVS `v5.0.0-V16`; ISO A.8.15 | Bajo-Medio | **Corregido (con respaldo)** | `docker-compose.aws-logs.yml` (driver awslogs) y grupo `/carta-digital/backend` con retención de 30 días; si el laboratorio no lo permite, usa json-file con rotación | user-data paso 6c; `destruir.sh` borra el grupo |
| H8 | Backup de 1 día y sin protección de borrado en RDS | ISO A.8.13 | Bajo | **Riesgo aceptado** | Necesario para la prueba académica de borrar y redesplegar en 5-10 min. En un ambiente real: backups de 7+ días, `DeletionProtection: true` y snapshot final | `carta-digital.yaml` |
| H9 | Matriz de controles desactualizada | ISO 27034 (evidencia) | Bajo | **Corregido** | `docs/MATRIZ_ASVS_ISO.md` reescrita | este commit |
| H10 | Detrás de Cloudflare, la IP registrada y limitada era la del nodo de Cloudflare | ASVS `v5.0.0-V16`, `v5.0.0-V6`; ISO A.8.16 | Medio | **Corregido** | `middleware/cloudflare.js`: usa `CF-Connecting-IP` solo si la conexión viene de un rango oficial de Cloudflare (cabecera falsificada desde fuera = ignorada) | `cloudflare.test.js` (12 pruebas) |

## 3. Security / Privacy Gate

| Gate | Resultado | Condición |
|---|---|---|
| Seguridad de la aplicación | **Aprobado** | 266 pruebas Jest + 13 Playwright; filtro de seguridad del pipeline (Gitleaks, npm audit/OSV, Dependency-Check, Trivy, ZAP) |
| Privacidad (Ley 19.628 vigente) | **Aprobado** | H1-H4 corregidos |
| Preparación Ley 21.719 (01-12-2026) | **Aprobado con observaciones** | Falta formalizar: registro de actividades de tratamiento, procedimiento de notificación de brechas a la Agencia y contrato/DPA con los encargados (documentos de gestión, fuera del código) |

## 4. Riesgos residuales

- La supresión de cuentas de **administrador** se gestiona por el responsable (no se autoelimina), para no dejar el restaurante sin gestor.
- El túnel TLS de EFS y CloudWatch Logs tienen respaldo automático para no afectar la disponibilidad. Si se activa el respaldo,
  la consola `/api/` lo deja visible.
- Los rangos de Cloudflare están fijos en el código: hay que revisarlos al actualizar dependencias (fuente: cloudflare.com/ips).
