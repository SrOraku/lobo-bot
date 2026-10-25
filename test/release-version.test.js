'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../scripts/build-manifest');

function fixture(t, version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-release-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'lobo-bot', version }));
  return root;
}

test('official release keeps 1.0.0 consistently in package, version marker and integrity manifest', t => {
  const root = fixture(t, '1.0.0');
  const release = build(root);
  assert.equal(release.version, '1.0.0');
  assert.equal(fs.readFileSync(path.join(root, '.version'), 'utf8'), '1.0.0\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version, '1.0.0');
});

test('release policy rejects a version increase before replacing the existing marker or manifest', t => {
  const root = fixture(t, '1.0.1');
  fs.writeFileSync(path.join(root, '.version'), '1.0.0\n');
  fs.writeFileSync(path.join(root, 'manifest.json'), 'previous-manifest');
  assert.throws(() => build(root), /deve permanecer em 1\.0\.0/);
  assert.equal(fs.readFileSync(path.join(root, '.version'), 'utf8'), '1.0.0\n');
  assert.equal(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'), 'previous-manifest');
});
