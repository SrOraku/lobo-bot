'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const lock = require('../package-lock.json');

test('instalação usa pacotes do registro em hosts com allow-git=none e allow-remote=none', () => {
  assert.equal(pkg.overrides.libsignal, '6.0.0');
  const libsignal = lock.packages['node_modules/libsignal'];
  assert.equal(libsignal.version, pkg.overrides.libsignal);
  assert.equal(libsignal.resolved, 'https://registry.npmjs.org/libsignal/-/libsignal-6.0.0.tgz');
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name || entry.link) continue;
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${name} precisa usar o registro npm`);
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+=*$/, `${name} precisa ter integridade SHA-512`);
    for (const source of Object.values(entry.dependencies || {})) {
      assert.doesNotMatch(source, /^(?:git[+:]|github:|ssh:|https?:\/\/)/, `${name} não deve exigir pacotes Git ou remotos`);
    }
  }
});

test('!sfundo usa zod 3 aninhado enquanto o restante do projeto continua no zod 4', () => {
  // @imgly/background-removal-node chama z.function().args(), que só existe no zod 3.
  assert.equal(pkg.overrides['@imgly/background-removal-node'].zod, '3.25.76');
  const nested = lock.packages['node_modules/@imgly/background-removal-node/node_modules/zod'];
  assert.ok(nested, 'o lockfile precisa ter o zod aninhado da biblioteca do !sfundo');
  assert.equal(nested.version, '3.25.76');
  assert.equal(nested.resolved, 'https://registry.npmjs.org/zod/-/zod-3.25.76.tgz');
  assert.match(nested.integrity, /^sha512-/);
  const top = lock.packages['node_modules/zod'];
  assert.equal(top.version, pkg.overrides.zod);
  assert.match(top.version, /^4\./);
  assert.equal(top.resolved, `https://registry.npmjs.org/zod/-/zod-${top.version}.tgz`);
});
