'use strict';
// Pruebas de extremo a extremo (navegador real). BASE_URL apunta al ambiente a probar:
//   dev  -> http://localhost:3000 (por defecto)    qa -> http://app:3000 (dentro de docker-compose.qa.yml)
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1, // los flujos comparten la BD y los limites por IP
  fullyParallel: false,
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/e2e-junit.xml' }],
    ['html', { outputFolder: 'reports/e2e-html', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    ignoreHTTPSErrors: true, // el certificado de produccion es autofirmado
    viewport: { width: 1280, height: 900 },
    locale: 'es-CL',
    trace: 'retain-on-failure',
  },
});
