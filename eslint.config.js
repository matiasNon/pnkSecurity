'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'public/', 'reports/', 'coverage/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
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
];
