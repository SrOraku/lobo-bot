'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { ensureDependencies } = require('../src/bootstrap');

function fixture(t, { lock = 'valid' } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-bootstrap-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const manifest = {
    name: 'lobo-bootstrap-test', version: '1.0.0',
    dependencies: { dotenv: '^16.4.5', pino: '^8.19.0' },
    devDependencies: { nodemon: '^3.1.0' },
  };
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify(manifest));
  if (lock !== 'missing') {
    const content = lock === 'valid' ? {
      name: manifest.name, version: manifest.version, lockfileVersion: 3,
      packages: {
        '': manifest,
        'node_modules/dotenv': { version: '16.4.5' },
        'node_modules/pino': { version: '8.19.0' },
        'node_modules/nodemon': { version: '3.1.0' },
      },
    } : lock;
    fs.writeFileSync(path.join(rootDir, 'package-lock.json'), typeof content === 'string' ? content : JSON.stringify(content));
  }
  const installed = new Set();
  const resolutions = [];
  const calls = [];
  const logs = [];
  const options = {
    rootDir,
    resolve(name, options) {
      resolutions.push({ name, options });
      if (!installed.has(name)) {
        const error = new Error(`Cannot find module '${name}'`);
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      }
      return path.join(rootDir, 'node_modules', name, 'index.js');
    },
    spawn(...args) {
      calls.push(args);
      installed.add('dotenv');
      installed.add('pino');
      return { status: 0 };
    },
    log(message) { logs.push(message); },
  };
  return { rootDir, manifest, installed, resolutions, calls, logs, options };
}

test('dependências presentes não executam npm e são resolvidas a partir da raiz', t => {
  const f = fixture(t);
  f.installed.add('dotenv');
  f.installed.add('pino');

  assert.equal(ensureDependencies(f.options), true);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.resolutions, [
    { name: 'dotenv', options: { paths: [f.rootDir] } },
    { name: 'pino', options: { paths: [f.rootDir] } },
  ]);
});

test('lock coerente executa npm ci uma vez com flags de produção e revalida dependências', t => {
  const f = fixture(t);
  f.installed.add('pino');

  assert.equal(ensureDependencies(f.options), true);
  assert.deepEqual(f.calls, [[
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['ci', '--omit=dev', '--no-audit', '--no-fund'],
    { cwd: f.rootDir, stdio: 'inherit', shell: false },
  ]]);
  assert.equal(f.resolutions.length, 4);
  assert.equal(f.resolutions.some(item => item.name === 'nodemon'), false);
  assert.equal(ensureDependencies(f.options), true);
  assert.equal(f.calls.length, 1);
});

for (const [label, lock] of [
  ['ausente', 'missing'],
  ['placeholder', { name: 'home', lockfileVersion: 3, packages: {} }],
  ['JSON inválido', '{'],
  ['desatualizado', { lockfileVersion: 3, packages: { '': { name: 'lobo-bootstrap-test', version: '1.0.0', dependencies: { dotenv: '^15.0.0' } } } }],
  ['sem entradas resolvidas', { lockfileVersion: 3, packages: { '': { name: 'lobo-bootstrap-test', version: '1.0.0', dependencies: { dotenv: '^16.4.5', pino: '^8.19.0' }, devDependencies: { nodemon: '^3.1.0' } } } }],
]) {
  test(`lock ${label} usa npm install uma vez`, t => {
    const f = fixture(t, { lock });
    assert.equal(ensureDependencies(f.options), true);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0][1], ['install', '--omit=dev', '--no-audit', '--no-fund']);
    assert.deepEqual(f.calls[0][2], { cwd: f.rootDir, stdio: 'inherit', shell: false });
  });
}

test('falha do npm retorna false com mensagem em português e não tenta outro instalador', t => {
  const f = fixture(t);
  f.options.spawn = (...args) => { f.calls.push(args); return { status: 1 }; };

  assert.equal(ensureDependencies(f.options), false);
  assert.equal(f.calls.length, 1);
  assert.match(f.logs.at(-1), /Falha ao instalar as dependências.*código 1/);
  assert.equal(f.resolutions.length, 2);
});

test('npm indisponível retorna false com mensagem útil', t => {
  const f = fixture(t);
  f.options.spawn = () => ({ status: null, error: new Error('spawn npm ENOENT') });

  assert.equal(ensureDependencies(f.options), false);
  assert.match(f.logs.at(-1), /Falha ao instalar.*ENOENT/);
});

test('exceção ao executar npm retorna false', t => {
  const f = fixture(t);
  f.options.spawn = () => { throw new Error('permissão negada'); };

  assert.equal(ensureDependencies(f.options), false);
  assert.match(f.logs.at(-1), /Não foi possível executar o npm: permissão negada/);
});

test('instalação sem corrigir dependências retorna false após uma única tentativa', t => {
  const f = fixture(t);
  f.options.spawn = (...args) => { f.calls.push(args); return { status: 0 }; };

  assert.equal(ensureDependencies(f.options), false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.resolutions.length, 4);
  assert.match(f.logs.at(-1), /Dependências ainda ausentes.*dotenv, pino/);
});

test('package.json inválido retorna false sem executar npm', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.rootDir, 'package.json'), '{');

  assert.equal(ensureDependencies(f.options), false);
  assert.equal(f.calls.length, 0);
  assert.match(f.logs.at(-1), /Não foi possível ler o package.json/);
});

test('ponto de entrada encerra com código 1 antes de carregar dotenv quando bootstrap falha', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const exit = new Error('saída simulada');
  const required = [];
  let exitCode;

  assert.throws(() => vm.runInNewContext(source, {
    require(name) {
      required.push(name);
      assert.equal(name, './bootstrap');
      return { ensureDependencies: () => false };
    },
    process: { exit(code) { exitCode = code; throw exit; } },
  }), error => error === exit);

  assert.equal(exitCode, 1);
  assert.deepEqual(required, ['./bootstrap']);
});

test('ponto de entrada verifica dependências antes de carregar dotenv', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const stop = new Error('parada antes de carregar o bot');
  const events = [];

  assert.throws(() => vm.runInNewContext(source, {
    require(name) {
      if (name === './bootstrap') return { ensureDependencies() { events.push('bootstrap'); return true; } };
      assert.equal(name, 'dotenv');
      return { config() { events.push('dotenv'); throw stop; } };
    },
  }), error => error === stop);

  assert.deepEqual(events, ['bootstrap', 'dotenv']);
});
