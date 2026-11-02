#!/usr/bin/env bash
# Ejecuta el ambiente QA completo: pruebas funcionales (Jest + Supertest) y de extremo a extremo (Playwright)
# sobre una BD efimera. Deja los reportes en reports/ y las capturas en docs/evidencias/qa/.
set -u
cd "$(dirname "$0")/.."
C="docker compose -p pnk-qa -f docker-compose.yml -f docker-compose.qa.yml"
mkdir -p reports docs/evidencias/qa

$C down -v --remove-orphans >/dev/null 2>&1
echo "== 1/2 Pruebas funcionales (Jest + Supertest) =="
$C run --build --rm tests; rc_tests=$?
echo "== 2/2 Pruebas de extremo a extremo (Playwright) =="
$C run --build --rm e2e; rc_e2e=$?
$C down -v --remove-orphans >/dev/null 2>&1

echo
echo "Funcionales: $([ $rc_tests -eq 0 ] && echo OK || echo FALLO)   E2E: $([ $rc_e2e -eq 0 ] && echo OK || echo FALLO)"
echo "Reportes: reports/informe-qa.html, reports/junit.xml, reports/e2e-html/, reports/e2e-junit.xml"
[ $rc_tests -eq 0 ] && [ $rc_e2e -eq 0 ]
