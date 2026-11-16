# Cambios del 16/11/2026 y como revertirlos

Registro de lo que se toco la madrugada de la evaluacion. No contiene claves.

## 1. Cloudflare - cuenta M3684410 (dominio academiafightclub.cl)  <- ESTE es el que hay que revertir
Se uso por una sola vez porque `pnkcarta.me` esta en la cuenta de Cloudflare de Savka y no se pudo editar.

| Que | Valor |
|---|---|
| Cuenta | M3684410@gmail.com (zona `academiafightclub.cl`, plan Free) |
| Registro creado | Tipo **CNAME**, nombre **`carta`**, destino `carta-digital-alb-869533467.us-east-1.elb.amazonaws.com`, **Proxied** (nube naranja), TTL Auto |
| URL resultante | https://carta.academiafightclub.cl/restaurantes/1 |
| NO se cambio | Modo SSL/TLS (ya era **Full**), los 3 registros existentes (TXT, Worker apex y Worker www), ni ninguna otra configuracion |

**Como revertir:** Cloudflare -> `academiafightclub.cl` -> DNS -> Records -> fila `carta` (CNAME) -> Edit -> **Delete**.
Despues se comprueba que `https://academiafightclub.cl/` siga respondiendo igual (no se toco).

**Cuando vuelva `pnkcarta.me`:** Savka (o quien tenga esa cuenta) edita el CNAME `carta` de `pnkcarta.me` al mismo destino del ALB.
Ademas conviene redesplegar con `DOMINIO=carta.pnkcarta.me bash infra/aws/desplegar.sh` (esta vez se desplego sin dominio, asi que la app usa
el nombre del balanceador como nombre publico).

## 2. AWS (cuenta del laboratorio de Savka, us-east-1)
1. **Disco raiz sin cifrar** (`infra/aws/carta-digital.yaml`, commit `9608c4f`): las plantillas de lanzamiento tenian `Encrypted: true` y los Auto Scaling Groups
   fallaban con `Client.InternalError` desde el 13/11. Se aplico al stack con un change set (`quitar-cifrado-disco`). Para revertir: volver a poner
   `Encrypted: true` en las dos lineas de `BlockDeviceMappings` (no recomendado: vuelve el fallo).
2. **Prueba de borrar y redesplegar** (7 min destruir + 9 min desplegar): el stack `carta-digital`, la RDS y el certificado de ACM se borraron y se
   recrearon. Cambio la direccion del balanceador (de `carta-digital-alb-79429219` a `carta-digital-alb-869533467`), la clave de admin (nueva en Secrets Manager)
   y se perdieron los datos de la base anterior (comentarios).
3. **Instancias de prueba**: se lanzaron y se terminaron 2 `t3.micro` sueltas (`prueba-cifrado-true-borrar` y `prueba-cifrado-false-borrar`). No queda nada.
4. **Prueba de alta disponibilidad**: se termino a proposito 1 instancia backend; el Auto Scaling la reemplazo solo y el sitio no tuvo ninguna peticion fallida.

## 3. GitHub (`matiasNon/pnkSecurity`, ramas `carta-digital-node`, `qa`, `produccion`)
- `78f80b2` Jenkins: despliegue AWS con --volumes-from, solo ramas qa/produccion, `scripts/jenkins-aws.sh`.
- `9608c4f` AWS: disco raiz sin cifrar.
- `f974316` Jenkins: Dependency-Check usa la base local si la API de NVD esta caida (`--noupdate`).
- `ff954b4` `jenkins-aws.sh`: agrega `[default]` a las credenciales y permite `SKIP_CREDS=1`.
Para revertir uno: `git revert <commit>` y push (no usar `--force`).

## 4. Jenkins (en este PC)
- Se recreo el contenedor `pnk-jenkins` apuntando a GitHub (antes apuntaba a un repo local de prueba). Las credenciales de AWS Academy viven solo en el
  volumen `pnk-jenkins_jenkins_home` (carpeta `pnk-secretos`) y caducan con el laboratorio.
- Builds `produccion` #8 (abortado a proposito), #9 (OK) y el de la verificacion posterior al redespliegue.

## 5. En el PC (fuera del repo)
- Carpeta `Desktop\c` (122 MB): clon de prueba creado por error. Se puede borrar.
- La politica de Windows `DisableLocation=1` NO se toco.
- Archivos temporales con credenciales de AWS: borrados.

## 6. Pendiente de limpieza tras la evaluacion
- Borrar el CNAME `carta` de `academiafightclub.cl` (punto 1).
- Rotar las claves que aparecieron en los chats pegados.
