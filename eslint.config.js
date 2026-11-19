'use strict';
// Regras para todo o código do projeto (bot, addon, plugins, scripts e testes).
// Antes valiam só para uma lista de arquivos; o resto não era conferido.
const NODE = {
  console: 'readonly', process: 'readonly', Buffer: 'readonly', global: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  setImmediate: 'readonly', clearImmediate: 'readonly', queueMicrotask: 'readonly', structuredClone: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', performance: 'readonly', crypto: 'readonly',
  fetch: 'readonly', Response: 'readonly', Request: 'readonly', Headers: 'readonly', FormData: 'readonly',
  Blob: 'readonly', File: 'readonly', WebAssembly: 'readonly', atob: 'readonly', btoa: 'readonly',
};
const COMMONJS = { require: 'readonly', module: 'writable', exports: 'writable', __dirname: 'readonly', __filename: 'readonly' };
const rules = {
  'no-undef': 'error',
  // `_nome` marca um parâmetro que existe só para mostrar a assinatura; `{ tirar, ...resto }` é o jeito de omitir uma chave.
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
};

module.exports = [
  { ignores: ['**/node_modules/**', 'data/**', 'logs/**', 'storage/**', 'sessions/**', 'updates/**', 'tmp/**', 'auth/**', 'backups/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  { files: ['**/*.js', '**/*.cjs'], languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...NODE, ...COMMONJS } }, rules },
  // O addon da Alcateia é ESM ("type": "module" em addons/alcateia/package.json).
  { files: ['addons/alcateia/**/*.js', '**/*.mjs'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: NODE }, rules },
];
