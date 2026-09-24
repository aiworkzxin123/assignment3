'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'data/', 'docs/', 'hosted/', '.claude/'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-shadow': 'warn',
      'no-param-reassign': 'warn',
      'no-nested-ternary': 'warn',
      'no-return-assign': 'warn',
      // Complexity and length rules stay at `warn` until the refactors in #7 and #8 land.
      complexity: ['warn', 10],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-len': ['warn', { code: 140, ignoreStrings: true, ignoreTemplateLiterals: true }],
      'max-statements-per-line': ['warn', { max: 1 }],
    },
  },
  {
    files: ['server.js', 'src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, L: 'readonly' } },
  },
];
