'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/integrations/bronxys/key.js'), 'utf8');
const FILE_KEY = 'OFFLINE-PERSISTENCE-FIXTURE';
const ENV_KEY = 'OFFLINE-ENVIRONMENT-FIXTURE';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-bronxys-key-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filename = path.join(root, 'data/bronxys-api-key');
  function load(env = {}) {
    const module = { exports: {} };
    // The private path resolves into this test's temporary installation. Neither
    // the real process environment nor the real bot's key file is inspected.
    vm.runInNewContext(source, {
      module, require, process: { env }, __dirname: path.join(root, 'src/integrations/bronxys'),
    });
    return module.exports;
  }
  return { root, filename, load };
}

test('saved Bronxys key survives a fresh module load and stays in a private file', t => {
  const f = fixture(t), first = f.load();
  assert.equal(first.getKey(), '');
  first.setKey(FILE_KEY);
  assert.equal(f.load().getKey(), FILE_KEY);
  assert.equal(fs.readFileSync(f.filename, 'utf8'), FILE_KEY);
  assert.deepEqual(fs.readdirSync(path.dirname(f.filename)), ['bronxys-api-key']);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(f.filename).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(f.filename)).mode & 0o777, 0o700);
  }

  first.setKey(FILE_KEY + '-UPDATED');
  assert.equal(f.load().getKey(), FILE_KEY + '-UPDATED');
  assert.deepEqual(fs.readdirSync(path.dirname(f.filename)), ['bronxys-api-key']);
});

test('saved key path belongs to the installation regardless of the launch directory', t => {
  const f = fixture(t), first = f.load();
  first.setKey(FILE_KEY);
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, require,
    process: { env: {}, cwd: () => path.join(f.root, 'different-launch-directory') },
    __dirname: path.join(f.root, 'src/integrations/bronxys'),
  });
  assert.equal(module.exports.getKey(), FILE_KEY);
  assert.equal(fs.existsSync(path.join(f.root, 'different-launch-directory/data/bronxys-api-key')), false);
});

test('explicit environment key takes priority without overwriting the saved key', t => {
  const f = fixture(t); f.load().setKey(FILE_KEY);
  const env = { BRONXYS_API_KEY: '  ' + ENV_KEY + '  ' };
  const current = f.load(env);
  assert.equal(current.getKey(), ENV_KEY);
  assert.throws(() => current.setKey('REPLACEMENT-FIXTURE'), /BRONXYS_API_KEY/);
  assert.equal(fs.readFileSync(f.filename, 'utf8'), FILE_KEY);
  delete env.BRONXYS_API_KEY;
  assert.equal(current.getKey(), FILE_KEY);
});

test('blank environment configuration does not prevent saving the private key', t => {
  const f = fixture(t), current = f.load({ BRONXYS_API_KEY: ' \t ' });
  assert.equal(current.getKey(), '');
  current.setKey(FILE_KEY);
  assert.equal(current.getKey(), FILE_KEY);
  assert.equal(f.load().getKey(), FILE_KEY);
});

test('malformed values never create a private key file', t => {
  const f = fixture(t), current = f.load();
  for (const value of ['', ' ', 'key with spaces', 'key\nline', 'x'.repeat(257), null]) {
    assert.throws(() => current.setKey(value), /Formato de chave inválido/);
  }
  assert.equal(fs.existsSync(f.filename), false);
});

test('symbolic key files are not followed and symbolic data directories cannot receive keys', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t), outside = path.join(f.root, 'outside-file');
  fs.mkdirSync(path.dirname(f.filename)); fs.writeFileSync(outside, 'OUTSIDE-FIXTURE');
  fs.symlinkSync(outside, f.filename);
  assert.equal(f.load().getKey(), '');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'OUTSIDE-FIXTURE');

  const g = fixture(t), directory = path.join(g.root, 'outside-directory');
  fs.mkdirSync(directory); fs.symlinkSync(directory, path.dirname(g.filename));
  assert.throws(() => g.load().setKey(FILE_KEY), /Diretório de chaves inválido/);
  assert.deepEqual(fs.readdirSync(directory), []);
});
