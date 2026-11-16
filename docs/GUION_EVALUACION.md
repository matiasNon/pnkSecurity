# Guion de la evaluacion (Eva 3 + Eva 4)

Que mostrar y que decir, por bloques. No contiene claves. Comando de apoyo: `bash scripts/demo-evaluacion.sh` (ver abajo).

## Diagrama del recorrido (paso a paso)

```
ANTES DE LA CLASE (1 h antes)
  [1] AWS Academy: Start Lab (cuenta de Savka) ..... esperar circulo verde
  [2] Abrir https://carta.academiafightclub.cl/restaurantes/1 ... 200 (si 503: esperar 5 min)
  [3] Abrir Docker Desktop
  [4] Copiar credenciales AWS (AWS Details > AWS CLI > Show)
  [5] bash scripts/jenkins-aws.sh ............... Jenkins listo + deploy de prueba (~13 min)
  [6] PAUSAS=0 bash scripts/demo-evaluacion.sh .. todo en OK
  [7] Abrir pestanas: carta | consola AWS | Cloudflare DNS | Jenkins :8081 | GitHub (carta-digital-node)

EN LA CLASE
  [A] Contexto (1 min) --------------------------> "PHP -> Node/Express, Docker, AWS HA, Jenkins"
        |
  [B] CODIGO + DOCKER (GitHub, rama carta-digital-node)
        |      Dockerfile, frontend/Dockerfile, docker-compose dev/qa/prod/aws
        v
  [C] LA APP (navegador)
        |      carta -> carrito -> login admin -> comentar -> /admin (crear/editar con foto)
        v
  [D] AWS (script de demo, con ENTER entre secciones)
        |      CloudFormation -> RDS privada -> ALB (reglas) -> 2 ASG en 2 zonas -> Secrets Manager
        v
  [E] CLOUDFLARE
        |      usuario --HTTPS--> Cloudflare --> ALB (AWS) --> frontend / backend --> RDS
        v
  [F] ALTA DISPONIBILIDAD   (HA=1: apaga 1 backend, el sitio sigue, ASG lo repone)
        |
        v
  [G] JENKINS (Eva 4, en el navegador: http://localhost:8081)
        |      Dev(lint+SAST) -> QA(Jest+Playwright) -> Seguridad -> Deploy a produccion
        |      si UNA etapa falla -> NO se despliega
        v
  [H] BORRAR Y REDESPLEGAR (si el profe lo pide; CloudShell de Savka)
        destruir.sh -> desplegar.sh (la BD se conserva) -> actualizar CNAME en Cloudflare -> sitio 200
```

## Bloque A. Contexto (1 min)
Decir: "Tomamos la carta digital en PHP, la migramos a Node.js con Express (API) y un frontend estatico en nginx, cada uno en su contenedor. Se despliega en AWS con alta disponibilidad (balanceador, Auto Scaling, RDS PostgreSQL), con HTTPS por Cloudflare, y una pipeline en Jenkins que solo despliega a produccion si pasa los filtros de seguridad."

## Bloque B. Codigo y Docker
Mostrar: GitHub, rama `carta-digital-node`; archivos `Dockerfile`, `frontend/Dockerfile`, `docker-compose.dev|qa|prod|aws.yml`.
Decir:
- "Backend: Node 24 + Express, solo API. Frontend: HTML y JS en nginx. Contenedores separados."
- "Hay una rama por ambiente: `carta-digital-node` (desarrollo), `qa` y `produccion`."
- "El historial va del 2/11 (primera version en Node) hasta hoy: ahi se ve la migracion desde PHP."
- Si preguntan por `front-back-separados`: "es la rama de trabajo previa, ya incluida en carta-digital-node".

## Bloque C. La aplicacion
Mostrar (en este orden): carta publica -> Seleccionar un plato -> carrito -> Ingresar como admin -> comentar -> `/admin` -> crear producto con foto -> editarlo -> eliminarlo (dos clics: "Eliminar" y luego "Confirmar").
Decir: "El admin se crea con una clave aleatoria guardada en Secrets Manager; no esta en el codigo."

## Bloque D. Infraestructura AWS
Mostrar: `bash scripts/demo-evaluacion.sh` (seccion 2) o la consola (CloudFormation, RDS, EC2 > Load Balancers y Auto Scaling).
Decir:
- "Todo se crea con un solo stack de CloudFormation (`infra/aws/carta-digital.yaml`) que lanza `desplegar.sh`: es infraestructura como codigo."
- "RDS PostgreSQL 17: privada (sin IP publica), cifrada y con TLS."
- "Load Balancer: `/api/*` y `/uploads/*` van al backend; lo demas al frontend."
- "Dos grupos de Auto Scaling (frontend y backend), minimo 2 instancias en 2 zonas de disponibilidad."
- "Las fotos se guardan en EFS compartido entre las instancias del backend."
- "Claves de BD, de sesion y del admin: en Secrets Manager."

## Bloque E. Cloudflare (parte manual)
Mostrar: Cloudflare > DNS > registro CNAME `carta` apuntando al nombre del balanceador (Proxied) y SSL/TLS en Full. `curl -sI` con las cabeceras.
Decir: "Cloudflare da el DNS, el certificado HTTPS y el proxy. Es el unico paso manual (docs/CLOUDFLARE.md). Hay redireccion HTTP -> HTTPS y cabeceras de seguridad (HSTS, CSP)."

## Bloque F. Alta disponibilidad
Mostrar: `HA=1 bash scripts/demo-evaluacion.sh` (seccion 7) o terminar una instancia backend en EC2.
Decir: "Apagamos un servidor: el sitio sigue respondiendo y el Auto Scaling lanza uno nuevo solo."

## Bloque G. Jenkins (Eva 4) - se ve en el navegador
Abrir `http://localhost:8081` (usuario `admin`). Paginas, en este orden:

| Que mostrar | Direccion |
|---|---|
| Job con las ramas | `http://localhost:8081/job/carta-digital/` |
| Stage View de produccion (etapas en verde) | `http://localhost:8081/job/carta-digital/job/produccion/` |
| Un build concreto (ej. #11) | `.../job/produccion/11/` |
| Consola (log completo) | `.../job/produccion/11/console` |
| Resumen de hallazgos | `.../job/produccion/11/artifact/reports/resumen-pipeline.md` |
| Informe QA | `.../job/produccion/11/artifact/reports/qa/informe-qa.html` |
| OWASP ZAP (ataque dinamico) | `.../job/produccion/11/artifact/reports/seguridad/zap.html` |
| OWASP Dependency-Check (CVE/CWE) | `.../job/produccion/11/artifact/reports/seguridad/dependency-check/dependency-check-report.html` |
| Resultados de pruebas | `.../job/produccion/11/testReport/` |

Si un informe HTML se ve sin estilos (Jenkins lo restringe por seguridad), mostrar las capturas de `docs/evidencias/jenkins/` (incluye el rechazo por lodash vulnerable).
Decir:
- "Etapas: lint + SAST, QA efimero (Jest/Supertest y Playwright), Gitleaks (secretos), npm audit + OSV (CVE), librerias deprecadas, Dependency-Check (NVD/MITRE), Trivy (imagenes) y ZAP (DAST)."
- "El despliegue a produccion es automatico, pero solo si TODAS las etapas pasan; si no, la pipeline lo rechaza. Lo probamos metiendo lodash vulnerable (build 5 rechazado, evidencia 03)."
- "El reemplazo de instancias es escalonado, sin bajar el sitio."

## Bloque H. Borrar y redesplegar (limite 10 min)
En CloudShell de Savka, con el repo clonado:
Mas facil: `bash scripts/menu-evaluacion.sh` -> opcion 6 (pide escribir BORRAR). O a mano:
1. `bash infra/aws/destruir.sh` (borra solo la APLICACION: balanceador, instancias y Auto Scaling)
2. `DOMINIO=<dominio> bash infra/aws/desplegar.sh`
3. Actualizar el CNAME de Cloudflare al NUEVO nombre del balanceador (lo imprime el script).
4. Abrir el sitio: los datos siguen ahi y las claves de admin no cambian (estan en Secrets Manager).
La base de datos (RDS), el EFS de fotos y las claves viven en el stack aparte `carta-digital-datos`: `destruir.sh` nunca lo toca,
asi que solo la primera vez se crea la RDS (~8 min) y despues el ciclo completo ronda los 9 min.
Decir: "Un comando crea todo: red, base de datos, balanceador, Auto Scaling, EFS y secretos; y borrar la app no borra los datos."

## Si algo falla
| Sintoma | Que hacer |
|---|---|
| Sitio 503 | Lab recien encendido: esperar 5 min; si no, ver Auto Scaling y mostrar capturas de `docs/evidencias/` |
| Credenciales AWS caducadas | Copiarlas de nuevo y `bash scripts/jenkins-aws.sh` |
| Dependency-Check falla por NVD | Ya usa la base local (`--noupdate`) |
| Dominio no responde | Abrir directo el nombre del balanceador (advertencia de certificado: es normal) |

## Despues
Borrar el CNAME `carta` de `academiafightclub.cl`, cambiar claves expuestas, borrar el producto de prueba (ver `docs/REVERTIR_CAMBIOS_16NOV.md`).

---

# Como esta hecho (para mostrarlo y explicarlo)

Si el profe pregunta "como lo implementaron", se abre el archivo indicado y se explica con las palabras de la columna "Que decir".

## Jenkins: se ve en el navegador (http://localhost:8081) y se explica con 4 archivos

| Que abrir | Que decir |
|---|---|
| `docker-compose.jenkins.yml` | "Jenkins corre en un contenedor Docker (puerto 8081). Se le monta el socket de Docker para que la pipeline pueda construir y probar los contenedores de la app." |
| `jenkins/Dockerfile` + `jenkins/plugins.txt` | "La imagen es Jenkins LTS con los plugins necesarios ya instalados (pipeline, multibranch, git, HTML publisher, JUnit)." |
| `jenkins/casc.yaml` | "Jenkins se configura como codigo (Configuration as Code): crea el usuario admin y el job `carta-digital`, un multibranch que lee las ramas `qa` y `produccion` de GitHub. Nada se configura a mano en la interfaz." |
| `Jenkinsfile` | "Es la pipeline: etapas Preparar -> Desarrollo (lint + SAST) -> QA efimero (Jest/Supertest y Playwright) -> Filtro de seguridad (Gitleaks, npm audit + OSV, deprecadas, Dependency-Check, Trivy, ZAP) -> Despliegue a produccion. El despliegue solo corre en la rama `produccion` y solo si todas las anteriores pasaron." |

Como se ve en la pagina de Jenkins: entrar a `http://localhost:8081/job/carta-digital/` -> rama `produccion` -> **Stage View** (cada columna es una etapa del Jenkinsfile) -> un build -> **Console** (el log de cada comando). Las claves de AWS y de NVD no estan en el repo: viven en el volumen de Jenkins (`pnk-secretos`).

Los pasos para levantarlo estan en `docs/JENKINS.md` (seccion "Como se levanta") y en el script `scripts/jenkins-aws.sh`.

## Cloudflare: se ve en la pagina del panel (dash.cloudflare.com) y se explica con `docs/CLOUDFLARE.md`

Recorrido en el panel, en este orden:
1. **DNS -> Records:** el registro **CNAME `carta`**, destino = nombre DNS del balanceador de AWS, con la **nube naranja (Proxied)**. Decir: "Esto hace que Cloudflare reciba al visitante y reenvie a AWS."
2. **SSL/TLS -> Overview:** modo **Full**. Decir: "El visitante ve el certificado de Cloudflare; entre Cloudflare y AWS tambien va cifrado. No usamos Full (strict) porque el balanceador tiene un certificado autofirmado; mejora opcional en la seccion 5 del documento."
3. **SSL/TLS -> Edge Certificates -> Always Use HTTPS:** activado. Decir: "Por eso HTTP responde 301 hacia HTTPS."
4. (Opcional) En una terminal: `curl -sI https://carta.academiafightclub.cl/restaurantes/1` muestra `Server: cloudflare`, HSTS y CSP.

Flujo para dibujar en la pizarra:
```
Visitante --HTTPS--> Cloudflare (DNS + cert + proxy) --HTTPS--> ALB (AWS) --> frontend (nginx) / backend (Node) --> RDS
```
Al borrar y redesplegar, el balanceador nuevo tiene otro nombre: solo se edita el destino del CNAME (nameservers y SSL no cambian).

## AWS: se ve en la consola de AWS y se explica con `infra/aws/carta-digital.yaml`
Consola (region N. Virginia): **CloudFormation** (stack `carta-digital`, pestanas Resources y Template), **RDS**, **EC2 -> Load Balancers** (Listeners y reglas), **EC2 -> Auto Scaling Groups**, **Secrets Manager**. Decir: "Cada recurso de la consola esta declarado en el YAML; el script `desplegar.sh` lo crea con un comando."

## Cuando un cambio es "magia": lo que si hice hoy y como explicarlo
- **Disco sin cifrar en las instancias:** los Auto Scaling no podian lanzar servidores (`Client.InternalError`). Se quito `Encrypted: true` del disco raiz en las plantillas de lanzamiento; RDS y EFS siguen cifrados.
- **Jenkins sigue funcionando aunque caiga NVD:** si la API de NVD responde 503, Dependency-Check usa su base local (`--noupdate`).
- **Subdominio prestado:** se uso `carta.academiafightclub.cl` solo porque `pnkcarta.me` esta en la cuenta de Savka; es un CNAME mas, reversible (`docs/REVERTIR_CAMBIOS_16NOV.md`).
