# QA con IA

Las pruebas funcionales fueron **generadas con IA (Claude)** a partir de los requisitos y revisadas por el equipo.

## Prompts utilizados (resumen)
1. *"A partir de las reglas de la carta digital (ver carta, carrito con maximo 50 items, comentarios con limite de tiempo, login con
   bloqueo, panel admin por restaurante), genera pruebas funcionales con Jest y Supertest. Una prueba por regla y por control de
   seguridad (SQLi, XSS, CSRF, IDOR, fuerza bruta, subida de archivos)."*
2. *"Genera un flujo de extremo a extremo con Playwright: ver carta, login fallido, carrito, comentar, cerrar sesion, crear y
   eliminar un producto como administrador, acceso denegado al panel. Guarda una captura por paso."*
3. *"Revisa las pruebas contra la matriz ASVS (docs/MATRIZ_ASVS_ISO.md) e indica controles sin cobertura."*

## Resultado (ambiente QA, BD efimera)
- Funcionales: 7 suites, **186 pruebas, 186 correctas**. Reportes: `reports/informe-qa.html`, `reports/junit.xml`.
- E2E: 10 pruebas correctas con navegador real. Capturas en `docs/evidencias/qa/`. Reportes: `reports/e2e-html/`, `reports/e2e-junit.xml`.
- Ejecutar: `npm run qa` (equivale a `bash scripts/qa.sh`).

Hallazgos que las pruebas ayudaron a corregir: dependencia `zod` con vulnerabilidad alta (actualizada a v4), ruta de subidas distinta entre
contenedor y pruebas, y el alias `app` que Chromium trata como TLD con HSTS (el alias de red en QA es `carta`).
