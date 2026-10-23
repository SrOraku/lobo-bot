'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { recover, write } = require('../src/updater/recovery');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const old = 'old code';
  write(path.join(root, 'updates/backup-test/src/example.js'), old);
  write(path.join(root, 'src/example.js'), 'partial new code');
  write(path.join(root, '.env'), 'private');
  const journal = { backup: 'backup-test', reuseDependencies: true, previous: { version: '1.0.0' }, saved: [{ name: 'src/example.js', present: true, mode: 0o644, sha256: createHash('sha256').update(old).digest('hex') }] };
  write(path.join(root, 'updates/apply-journal.json'), JSON.stringify(journal));
  return { root, journal };
}
test('interrupted multi-file apply recovers before boot, preserves user data and is idempotent', t => {
  const { root } = fixture(t);
  assert.equal(recover(root), true);
  assert.equal(fs.readFileSync(path.join(root, 'src/example.js'), 'utf8'), 'old code');
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'private');
  assert.equal(recover(root), false);
});
test('corrupt backup fails closed before changing live code', t => {
  const { root } = fixture(t);
  write(path.join(root, 'updates/backup-test/src/example.js'), 'corrupt');
  assert.throws(() => recover(root), /HASH_MISMATCH/);
  assert.equal(fs.readFileSync(path.join(root, 'src/example.js'), 'utf8'), 'partial new code');
});
test('journal cannot overwrite protected data', t => {
  const { root, journal } = fixture(t);
  journal.saved[0].name = '.env';
  write(path.join(root, 'updates/apply-journal.json'), JSON.stringify(journal));
  assert.throws(() => recover(root), /PROTECTED_PATH/);
});
