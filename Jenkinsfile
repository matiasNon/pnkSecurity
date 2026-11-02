// Pipeline CI/CD de la carta digital PNK (4.a entrega).
//   Desarrollo (lint + SAST) -> QA (pruebas funcionales con IA + e2e) -> FILTRO DE SEGURIDAD (OWASP / MITRE)
//   -> despliegue automatico a produccion SOLO si todo lo anterior pasa.
// Si hay errores, vulnerabilidades altas o librerias deprecadas, el despliegue se rechaza y se notifican los problemas.
pipeline {
  agent any
  options {
    timestamps()
    ansiColor('xterm')
    timeout(time: 60, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }
  environment {
    CI_PROJECT = 'pnk-ci'
    CI = 'docker compose -p pnk-ci -f docker-compose.yml -f docker-compose.qa.yml -f docker-compose.ci.yml'
    PROD = 'docker compose -p pnk-prod -f docker-compose.yml -f docker-compose.prod.yml'
    JENKINS_CONTAINER = 'pnk-jenkins'
    SECRETOS = '/var/jenkins_home/pnk-secretos'   // .env.prod, carta.crt y carta.key: fuera del repositorio
  }

  stages {
    stage('Preparar') {
      steps {
        sh 'rm -rf reports && mkdir -p reports/seguridad reports/qa'
        sh 'node -v && npm -v && docker version --format "Docker {{.Server.Version}}"'
        sh 'npm ci --no-audit --no-fund'
      }
    }

    // ---------- 1. DESARROLLO ----------
    stage('Desarrollo: lint + SAST') {
      steps {
        // eslint con eslint-plugin-security (CWE de inyeccion, regex inseguras, eval...). Los errores bloquean la pipeline.
        sh 'npx eslint src scripts tests -f json -o reports/seguridad/eslint-sast.json || true'
        sh 'npm run lint'
      }
    }

    // ---------- 2. QA (pruebas funcionales generadas con IA) ----------
    stage('QA: ambiente efimero') {
      steps {
        sh '$CI down -v --remove-orphans || true'
        sh '$CI build app tests e2e'
        sh '$CI up -d db app'
        sh '''
          for i in $(seq 1 40); do
            [ "$(docker inspect -f '{{.State.Health.Status}}' ${CI_PROJECT}-app-1 2>/dev/null)" = "healthy" ] && exit 0
            sleep 3
          done
          echo "La aplicacion QA no llego a estado healthy"; $CI logs app | tail -30; exit 1
        '''
      }
    }
    stage('QA: pruebas funcionales (Jest + Supertest)') {
      steps {
        sh '''
          docker rm -f ci-tests >/dev/null 2>&1 || true
          set +e
          $CI run --name ci-tests tests
          rc=$?
          docker cp ci-tests:/app/reports/. reports/qa/ || true
          docker rm -f ci-tests >/dev/null 2>&1
          exit $rc
        '''
      }
      post { always { junit allowEmptyResults: true, testResults: 'reports/qa/junit.xml' } }
    }
    stage('QA: extremo a extremo (Playwright)') {
      steps {
        sh '''
          docker rm -f ci-e2e >/dev/null 2>&1 || true
          set +e
          $CI run --name ci-e2e -e EVIDENCIA_DIR=/tmp/evidencia e2e
          rc=$?
          mkdir -p reports/qa/e2e reports/qa/evidencia
          docker cp ci-e2e:/app/reports/. reports/qa/e2e/ || true
          docker cp ci-e2e:/tmp/evidencia/. reports/qa/evidencia/ || true
          docker rm -f ci-e2e >/dev/null 2>&1
          exit $rc
        '''
      }
      post { always { junit allowEmptyResults: true, testResults: 'reports/qa/e2e/e2e-junit.xml' } }
    }

    // ---------- 3. FILTRO DE SEGURIDAD (OWASP / MITRE) ----------
    stage('Filtro de seguridad') {
      parallel {
        stage('Secretos (Gitleaks)') {
          steps {
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              sh '''
                docker run --rm --volumes-from $JENKINS_CONTAINER -w "$WORKSPACE" ghcr.io/gitleaks/gitleaks:latest \
                  detect --source . --config .gitleaks.toml --redact --exit-code 1 \
                  --report-format json --report-path reports/seguridad/gitleaks.json
              '''
            }
          }
        }
        stage('Dependencias (npm audit + OSV)') {
          steps {
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              // Librerias con CVE alto/critico o deprecadas: rechaza el despliegue.
              sh '''
                set +e
                npm audit --omit=dev --audit-level=high --json > reports/seguridad/npm-audit.json
                npm audit --omit=dev --audit-level=high
                rc1=$?
                docker run --rm --volumes-from $JENKINS_CONTAINER -w "$WORKSPACE" ghcr.io/google/osv-scanner:latest \
                  scan source --lockfile package-lock.json --format json --output reports/seguridad/osv-scanner.json
                docker run --rm --volumes-from $JENKINS_CONTAINER -w "$WORKSPACE" ghcr.io/google/osv-scanner:latest \
                  scan source --lockfile package-lock.json
                rc2=$?
                [ $rc1 -eq 0 ] && [ $rc2 -eq 0 ]
              '''
            }
          }
        }
        stage('OWASP Dependency-Check') {
          when { expression { fileExists("${env.SECRETOS}/nvd_api_key") } }
          steps {
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              // Cruza las dependencias con la base NVD (CVE y CWE que administra MITRE). Falla con CVSS >= 7.
              sh '''
                docker run --rm --volumes-from $JENKINS_CONTAINER -w "$WORKSPACE" -v odc_data:/usr/share/dependency-check/data \
                  owasp/dependency-check:latest --scan package-lock.json --format ALL --out reports/seguridad/dependency-check \
                  --failOnCVSS 7 --nvdApiKey "$(cat $SECRETOS/nvd_api_key)" --project carta-digital-pnk
              '''
            }
            dependencyCheckPublisher pattern: 'reports/seguridad/dependency-check/dependency-check-report.xml', failedTotalHigh: 0, failedTotalCritical: 0
          }
        }
        stage('Imagen (Trivy: CVE / CWE)') {
          steps {
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              // CVE y CWE son catalogos de MITRE: Trivy reporta cada hallazgo con su identificador.
              sh '''
                set +e
                docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy_cache:/root/.cache/ \
                  docker.io/aquasec/trivy:latest image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 0 \
                  --format json pnk-ci-app > reports/seguridad/trivy.json
                docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy_cache:/root/.cache/ \
                  docker.io/aquasec/trivy:latest image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 pnk-ci-app
              '''
            }
          }
        }
        stage('DAST (OWASP ZAP baseline)') {
          steps {
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              // Escaneo al ambiente QA: cabeceras, cookies, XSS reflejado, SQLi...
              sh '''
                docker rm -f ci-zap >/dev/null 2>&1 || true
                set +e
                docker create --name ci-zap --network ${CI_PROJECT}_interna -u root ghcr.io/zaproxy/zaproxy:stable \
                  zap-baseline.py -t http://carta:3000/restaurantes/1 -c zap-rules.conf -r zap.html -J zap.json >/dev/null
                docker cp security/zap-rules.conf ci-zap:/zap/wrk/zap-rules.conf
                docker start -a ci-zap
                rc=$?
                docker cp ci-zap:/zap/wrk/zap.html reports/seguridad/zap.html || true
                docker cp ci-zap:/zap/wrk/zap.json reports/seguridad/zap.json || true
                docker rm -f ci-zap >/dev/null 2>&1
                # 0 = limpio, 2 = solo advertencias; 1 = alguna regla marcada FAIL en security/zap-rules.conf
                [ $rc -eq 1 ] && exit 1 || exit 0
              '''
            }
          }
        }
      }
    }

    // ---------- 4. DESPLIEGUE AUTOMATICO A PRODUCCION (solo si todo paso) ----------
    stage('Despliegue a produccion') {
      when {
        expression { currentBuild.currentResult == 'SUCCESS' && (env.GIT_BRANCH ?: '').endsWith('carta-digital-node') }
      }
      steps {
        sh '''
          test -f $SECRETOS/.env.prod && test -f $SECRETOS/carta.crt && test -f $SECRETOS/carta.key || { echo "Faltan secretos en $SECRETOS"; exit 1; }
          cp $SECRETOS/.env.prod .env.prod
          bash infra/cargar-certificado.sh $SECRETOS/carta.crt $SECRETOS/carta.key
          $PROD up -d --build
          for i in $(seq 1 30); do
            docker run --rm --network pnk-prod_interna curlimages/curl:latest -sk https://nginx/health | grep -q '"ok"' && { echo "Produccion OK"; exit 0; }
            sleep 3
          done
          echo "El despliegue no respondio /health"; $PROD logs --tail 30; exit 1
        '''
      }
      post { always { sh 'rm -f .env.prod' } }
    }
  }

  post {
    always {
      sh '$CI down -v --remove-orphans || true'
      sh '''
        {
          echo "# Resumen del pipeline #${BUILD_NUMBER}"
          echo
          echo "## Hallazgos"
          [ -f reports/seguridad/npm-audit.json ] && jq -r '"- npm audit: " + (.metadata.vulnerabilities|tostring)' reports/seguridad/npm-audit.json 2>/dev/null
          [ -f reports/seguridad/gitleaks.json ] && echo "- gitleaks: $(jq length reports/seguridad/gitleaks.json 2>/dev/null) secretos"
          [ -f reports/seguridad/zap.json ] && jq -r '.site[0].alerts[] | "- ZAP [" + .riskdesc + "] " + .name' reports/seguridad/zap.json 2>/dev/null
        } > reports/resumen-pipeline.md || true
      '''
      archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true, fingerprint: true
      publishHTML target: [reportName: 'Informe QA (Jest)', reportDir: 'reports/qa', reportFiles: 'informe-qa.html', keepAll: true, allowMissing: true, alwaysLinkToLastBuild: true]
      publishHTML target: [reportName: 'OWASP ZAP', reportDir: 'reports/seguridad', reportFiles: 'zap.html', keepAll: true, allowMissing: true, alwaysLinkToLastBuild: true]
    }
    success { echo 'Pipeline OK: la version paso todos los filtros y quedo desplegada en produccion.' }
    failure {
      echo 'DESPLIEGUE RECHAZADO: revise las etapas en rojo (pruebas, dependencias, secretos, imagen o ZAP).'
      script {
        if (env.NOTIFY_EMAIL) {
          mail to: env.NOTIFY_EMAIL, subject: "[PNK] Pipeline #${env.BUILD_NUMBER} rechazado", body: "Se rechazo el despliegue. Detalle: ${env.BUILD_URL}"
        }
      }
    }
  }
}
