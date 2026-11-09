'use strict';
const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');

module.exports = [
  { ignores: ['node_modules/', 'frontend/public/vendors/', 'reports/', 'coverage/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  // SAST ligero (CWE: inyeccion, regex inseguras, eval, rutas dinamicas): se ejecuta en el filtro de seguridad de Jenkins.
  security.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Las expresiones con caracteres de control son intencionales: sanean entradas (NUL, secuencias de control).
      'no-control-regex': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    },
  },
  // Frontend: scripts clasicos del navegador (sin modulos), servidos por nginx.
  {
    files: ['frontend/public/js/app/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
];
