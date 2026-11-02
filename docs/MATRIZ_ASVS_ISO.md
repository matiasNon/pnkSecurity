# Matriz de controles: ASVS v5.0 / ISO 27001:2022 / ISO 27034

Cada control indica donde esta en el codigo y que prueba lo verifica (carpeta `tests/`). Referencia a nivel de capitulo de ASVS v5.

| Riesgo / requisito | ASVS v5 | ISO 27001 (Anexo A) | Implementacion | Prueba |
|---|---|---|---|---|
| Inyeccion SQL | V1 Codificacion y saneamiento, V2 Validacion | A.8.28 Codificacion segura | Consultas parametrizadas (`src/models`); ids validados como enteros (`utils/validar.js`) | `carta.test.js` (11 cargas en `:id`), e2e SQLi |
| XSS | V1, V3 Front-end | A.8.28 | EJS escapa por defecto; `nl2br` escapa antes; CSP sin inline (`middleware/seguridad.js`) | `comentarios.test.js`, `cabeceras.test.js`, e2e |
| CSRF | V3 | A.8.26 Requisitos de seguridad de apps | Token por sesion con `timingSafeEqual` (`middleware/csrf.js`); SameSite=Strict | `carrito`, `auth`, `comentarios`, `admin` |
| Autenticacion | V6 Autenticacion | A.5.17, A.8.5 | scrypt, mensajes genericos, hash senuelo, regeneracion de sesion (`controllers/auth.js`) | `auth.test.js`, `unidades.test.js` |
| Fuerza bruta / spam | V6, V2 Logica de negocio | A.8.5, A.8.6 | Limites en BD: 5 par, 25 cuenta, 20 IP en 15 min; 10 s y 30/h en comentarios (`services/throttle.js`) | `auth.test.js`, `comentarios.test.js` |
| Sesiones | V7 Sesiones | A.8.5 | Cookie HttpOnly/SameSite/Secure, 30 min inactividad, 8 h maximo, almacen en PostgreSQL | `cabeceras.test.js`, `auth.test.js` |
| Control de acceso / IDOR | V8 Autorizacion | A.5.15, A.8.3 | Rol admin; todas las consultas del panel acotadas a `restaurante_id` de la sesion (`models/admin.js`) | `admin.test.js` (IDOR) |
| Subida de archivos | V5 Archivos | A.8.26 | Tipo por contenido, 2 MB, nombre aleatorio, volumen aparte (`middleware/subidas.js`) | `admin.test.js` (5 casos) |
| Cabeceras / TLS | V3, V12 Comunicacion segura | A.8.24 Criptografia, A.8.20 Redes | Helmet, HSTS, nginx TLS 1.2/1.3, redireccion HTTPS por configuracion | `cabeceras.test.js` |
| Configuracion y secretos | V13 Configuracion | A.8.9 Gestion de configuracion | Variables de entorno validadas; prod no arranca con secretos debiles (`config/env.js`) | `unidades.test.js` |
| Datos en reposo | V14 Proteccion de datos | A.8.24 | Contrasenas con hash; BD sin puertos publicados; `.env.prod` fuera del repo | revision |
| Registro y errores | V16 Registro y errores | A.8.15, A.8.28 | Eventos `login_*`, `comentario_*`, `admin_*` en JSON; errores genericos al usuario (`middleware/errores.js`) | `carta.test.js` (404 sin detalle) |
| Dependencias | V15 Codigo seguro | A.8.8 Vulnerabilidades tecnicas | `npm audit --omit=dev --audit-level=high` sin hallazgos altos; imagen `node:24-alpine`, usuario no root | `npm run audit` |
| Contenedor | V13 | A.8.9 | Multi-etapa, usuario `node`, FS de solo lectura, `cap_drop: ALL`, `no-new-privileges` (`docker-compose.prod.yml`) | verificacion en prod |

ISO 27034: los controles son los "ONF" (Organization Normative Framework) de la aplicacion; los niveles de confianza se verifican
con el entorno QA (`scripts/qa.sh`) antes de pasar a produccion. Pendiente de la entrega 4: ejecutarlos en una pipeline Jenkins con
los plugins OWASP/MITRE.
