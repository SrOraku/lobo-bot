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

test('active updater prevents journal restoration and keeps live code untouched', t => {
  const { root } = fixture(t);
  const lease = require('../src/updater/lock').acquireLock(root);
  try {
    assert.throws(() => recover(root), { code: 'BUSY' });
    assert.equal(fs.readFileSync(path.join(root, 'src/example.js'), 'utf8'), 'partial new code');
    lease.assertOwned();
  } finally { lease.release(); }
});

test('orphan legacy lock with a journal restores code, clears interrupted trial, and preserves private data', t => {
  const { root } = fixture(t);
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', '']);
  assert.equal(child.status, 0);
  write(path.join(root, 'updates/update.lock'), JSON.stringify({ pid: child.pid, at: 1 }));
  write(path.join(root, 'updates/pending-release.json'), JSON.stringify({ backup: 'backup-test', toVersion: 'bad' }));
  assert.equal(recover(root), true);
  assert.equal(fs.readFileSync(path.join(root, 'src/example.js'), 'utf8'), 'old code');
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'private');
  assert.equal(fs.existsSync(path.join(root, 'updates/pending-release.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'updates/update.lock')), false);
  assert.equal(recover(root), false);
});

test('unrelated pending release or corrupt backup fails closed without changing code', t => {
  const { root } = fixture(t);
  write(path.join(root, 'updates/pending-release.json'), JSON.stringify({ backup: 'backup-other' }));
  assert.throws(() => recover(root), /RECOVERY_PENDING_MISMATCH/);
  assert.equal(fs.readFileSync(path.join(root, 'src/example.js'), 'utf8'), 'partial new code');
});
