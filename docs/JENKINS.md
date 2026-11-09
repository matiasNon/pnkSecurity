# Pipeline CI/CD con Jenkins (4.ª entrega)

Flujo exigido: **Desarrollo → QA (pruebas con IA) → filtro de seguridad (OWASP / MITRE) → despliegue automático a producción**.
Si una etapa falla, la pipeline **rechaza el despliegue** (producción sigue con la versión anterior) y deja el detalle en el informe.

```
Preparar ─► Desarrollo (eslint + SAST) ─► QA ambiente efímero ─► Jest/Supertest (186) ─► Playwright e2e (10)
        ─► Filtro de seguridad (en paralelo) ─► Despliegue a producción (solo si TODO es verde)
              ├─ Gitleaks            secretos en el repositorio
              ├─ npm audit + OSV     librerías con CVE alto/crítico o deprecadas (CVSS ≥ 7 bloquea)
              ├─ Librerías deprecadas  rechaza si una dependencia de producción está deprecated en npm
              ├─ OWASP Dependency-Check   cruce con la NVD (CVE/CWE de MITRE); requiere NVD API key
              ├─ Trivy               CVE y CWE de la imagen Docker (HIGH/CRITICAL con parche)
              └─ OWASP ZAP baseline  DAST contra el ambiente QA (reglas FAIL en security/zap-rules.conf)
```

## Ramas y ambientes

| Rama | Ambiente | Jenkins |
|---|---|---|
| `carta-digital-node` | Desarrollo (cambio de stack) | lint + SAST, QA con IA y filtro de seguridad; **no despliega** |
| `qa` | QA | igual que desarrollo; valida la versión antes de pasar a producción |
| `produccion` | Producción | todo lo anterior y, **solo si todo pasa**, despliegue automático |

Flujo: se programa en `carta-digital-node` → se promueve a `qa` → se promueve a `produccion`. El job de Jenkins es *multibranch*
(`jenkins/casc.yaml`): cada rama corre su propia pipeline. En AWS, `infra/aws-user-data.sh` clona la rama `produccion`.

## Plugins y herramientas

| Requisito | Qué se usa | Dónde |
|---|---|---|
| **OWASP** | OWASP Dependency-Check (plugin `dependency-check-jenkins-plugin`) y OWASP ZAP (DAST) | `Jenkinsfile`, `security/zap-rules.conf` |
| **MITRE** | Catálogos CVE y CWE de MITRE, consumidos por Dependency-Check (NVD), OSV-Scanner y Trivy. No existe un plugin oficial «MITRE» para Jenkins | informes en `reports/seguridad/` |
| SAST | `eslint-plugin-security` | `eslint.config.js` |
| Secretos | Gitleaks | `.gitleaks.toml` |
| Informes | `junit`, `htmlpublisher`, `warnings-ng`, `pipeline-stage-view` | `jenkins/plugins.txt` |
| Otros plugins | los que indique el profesor se agregan en `jenkins/plugins.txt` y se reconstruye la imagen | |

## Cómo se levanta

```bash
docker compose -p pnk-jenkins -f docker-compose.jenkins.yml up -d --build   # http://localhost:8081
```

- Jenkins se configura solo (Configuration as Code, `jenkins/casc.yaml`): usuario `admin`, contraseña por variable, job `carta-digital` ya creado.
- Los secretos de producción (`.env.prod`, `carta.crt`, `carta.key`) viven **fuera del repositorio**, en `/var/jenkins_home/pnk-secretos`.
- Para activar OWASP Dependency-Check: guardar una NVD API key gratuita en `/var/jenkins_home/pnk-secretos/nvd_api_key`; sin ella la etapa se omite.
- Notificación por correo: definir `NOTIFY_EMAIL` y un SMTP; sin eso el rechazo se informa en la consola, el Stage View y `resumen-pipeline.md`.

## Evidencia (builds reales)

| Build | Resultado | Qué demuestra |
|---|---|---|
| #1 | falló | el checkout local estaba bloqueado por Jenkins → se habilitó en la configuración |
| #2 | **rechazado** | OSV/npm audit marcaron `uuid` y Trivy 6 CVE HIGH en el `npm` incluido en la imagen → se aplicó `override` de `uuid` y se quitó npm de la imagen runtime |
| #3 | aprobado | despliegue automático a producción (HTTPS 200, HTTP→301) |
| #4 | aprobado | ZAP escanea de verdad: 0 FAIL, 5 WARN informativos, 63 PASS; informe `zap.html` archivado; producción actualizada |
| #5 | **rechazado** | commit de prueba con `lodash@4.17.15`: npm audit, OSV y Trivy lo detectan (CVE-2020-8203, CVE-2021-23337…), «Despliegue a producción» queda *skipped* |

Capturas en `docs/evidencias/jenkins/` (historial con Stage View, build aprobado, build rechazado, informe ZAP, informe QA, consola del rechazo).

## Riesgos conocidos (honestos)

- Jenkins corre como root con `docker.sock` montado: quien controle un job controla el host. Aceptable en el laboratorio; en un entorno real usar agentes aislados y un registro de imágenes.
- Certificado TLS autofirmado (sin dominio): el navegador avisa; Cloudflare se configura más adelante, cuando haya dominio (guía lista en `docs/CLOUDFLARE.md`).
- Las advertencias de ZAP (COEP, cache, comentarios) son informativas y no bloquean; las reglas `FAIL` sí.
- `npm audit --omit=dev` informa 4 vulnerabilidades *moderate*; la política bloquea solo alto/crítico (CVSS ≥ 7), las medias quedan registradas en `reports/resumen-pipeline.md`.
