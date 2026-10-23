'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const lock = require('../package-lock.json');

test('instalação não exige dependências Git em hosts com allow-git=none', () => {
  const source = pkg.overrides.libsignal;
  assert.match(source, /^https:\/\/codeload\.github\.com\/WhiskeySockets\/libsignal-node\/tar\.gz\/[a-f0-9]{40}$/);
  assert.equal(lock.packages['node_modules/libsignal'].resolved, source);
  assert.ok(lock.packages['node_modules/libsignal'].integrity);
  for (const entry of Object.values(lock.packages)) {
    assert.doesNotMatch(entry.resolved || '', /^(git[+:]|github:|ssh:)/);
  }
});
