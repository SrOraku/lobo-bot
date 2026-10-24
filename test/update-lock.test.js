'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { acquireLock, processState } = require('../src/updater/lock');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-update-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'updates'));
  const preserved = { '.env': 'BOT_NAME=fixture', 'sessions/creds.json': '{"fixture":true}', 'data/lobo.db': 'sqlite fixture bytes' };
  for (const [name, value] of Object.entries(preserved)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value);
  }
  return {
    root, lock: path.join(root, 'updates/update.lock'),
    verifyData() { for (const [name, value] of Object.entries(preserved)) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), value, name); },
  };
}
function exitedPid() {
  const result = spawnSync(process.execPath, ['-e', ''], { timeout: 10000 });
  assert.equal(result.status, 0); assert.ok(result.pid > 0);
  return result.pid;
}
function putLegacy(file, record) { fs.writeFileSync(file, JSON.stringify(record)); }

test('update lock is atomically published with complete ownership and released', t => {
  const f = fixture(t), lease = acquireLock(f.root, { action: 'bot' });
  assert.ok(fs.statSync(f.lock).isDirectory());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.lock, 'owner.json'), 'utf8')), lease.record);
  assert.equal(lease.record.pid, process.pid);
  lease.assertOwned();
  assert.throws(() => acquireLock(f.root), { code: 'BUSY' });
  lease.release(); assert.equal(fs.existsSync(f.lock), false); f.verifyData();
});

test('dead legacy updater lock recovers automatically without touching session or database', t => {
  const f = fixture(t); putLegacy(f.lock, { pid: exitedPid(), at: 1 });
  const lease = acquireLock(f.root, { action: 'bot' });
  assert.equal(lease.recovered, true); lease.assertOwned();
  assert.ok(fs.readdirSync(path.dirname(f.lock)).some(name => name.startsWith('retired-lock-')));
  lease.release(); f.verifyData();
});

test('a stale directory owner is recovered and the old complete record remains archived', t => {
  const f = fixture(t); fs.mkdirSync(f.lock);
  const old = { pid: exitedPid(), at: 1, token: 'old-directory-owner' };
  fs.writeFileSync(path.join(f.lock, 'owner.json'), JSON.stringify(old));
  const lease = acquireLock(f.root);
  assert.equal(lease.recovered, true); assert.notDeepEqual(lease.record, old);
  const archive = fs.readdirSync(path.dirname(f.lock)).find(name => name.startsWith('retired-lock-'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(path.dirname(f.lock), archive, 'owner.json'), 'utf8')), old);
  lease.release(); f.verifyData();
});

test('live legacy updater remains busy and its lock is not rewritten', t => {
  const f = fixture(t); putLegacy(f.lock, { pid: process.pid, at: 1 });
  const before = fs.readFileSync(f.lock);
  assert.throws(() => acquireLock(f.root), { code: 'BUSY' });
  assert.deepEqual(fs.readFileSync(f.lock), before); f.verifyData();
});

test('uncertain process permissions are never classified as a dead updater', t => {
  const f = fixture(t); putLegacy(f.lock, { pid: process.pid, at: 1 });
  assert.throws(() => acquireLock(f.root, { probe: () => 'unknown' }), { code: 'BUSY' });
  assert.equal(JSON.parse(fs.readFileSync(f.lock, 'utf8')).pid, process.pid); f.verifyData();
});

for (const [label, bytes] of [
  ['empty', ''], ['truncated', '{"pid":'], ['missing PID', '{}'], ['zero PID', '{"pid":0}'],
  ['negative PID', '{"pid":-2}'], ['string PID', '{"pid":"123"}'],
]) test(`invalid ${label} lock fails closed without removing evidence`, t => {
  const f = fixture(t); fs.writeFileSync(f.lock, bytes);
  assert.throws(() => acquireLock(f.root), { code: 'LOCK_INVALID' });
  assert.equal(fs.readFileSync(f.lock, 'utf8'), bytes); f.verifyData();
});

test('an incomplete directory lock is not silently replaced', t => {
  const f = fixture(t); fs.mkdirSync(f.lock);
  assert.throws(() => acquireLock(f.root), { code: 'LOCK_INVALID' });
  assert.deepEqual(fs.readdirSync(f.lock), []); f.verifyData();
});

test('lock file and updates directory symlinks cannot alter an outside target', t => {
  const f = fixture(t), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-lock-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const original = path.join(outside, 'original.json'); putLegacy(original, { pid: exitedPid(), at: 1 });
  const bytes = fs.readFileSync(original);
  fs.symlinkSync(original, f.lock);
  assert.throws(() => acquireLock(f.root), { code: 'LOCK_UNSAFE' });
  assert.deepEqual(fs.readFileSync(original), bytes);
  fs.unlinkSync(f.lock); fs.rmdirSync(path.dirname(f.lock)); fs.symlinkSync(outside, path.dirname(f.lock));
  assert.throws(() => acquireLock(f.root), { code: 'LOCK_UNSAFE' });
  assert.deepEqual(fs.readFileSync(original), bytes); f.verifyData();
});

test('a previous lease cannot remove or claim ownership of a replacement lock', t => {
  const f = fixture(t), previous = acquireLock(f.root);
  fs.renameSync(f.lock, path.join(path.dirname(f.lock), 'old-lease'));
  const replacement = acquireLock(f.root);
  assert.throws(() => previous.assertOwned());
  try { previous.release(); } catch (error) { assert.equal(error.code, 'LOCK_LOST'); }
  replacement.assertOwned();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.lock, 'owner.json'), 'utf8')), replacement.record);
  replacement.release(); f.verifyData();
});

test('process probe distinguishes a running process and a positively exited process', () => {
  assert.equal(processState({ pid: process.pid }), 'alive');
  assert.equal(processState({ pid: exitedPid() }), 'dead');
});

test('Linux process fingerprint detects reused PID and malformed PID remains unknown', t => {
  assert.equal(processState({ pid: -1 }), 'unknown');
  if (!fs.existsSync('/proc/self/stat')) return t.skip('procfs unavailable');
  assert.equal(processState({ pid: process.pid, identity: { boot: 'previous-boot', start: '0' } }), 'dead');
});

function nextMessage(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(Error('child lock contender did not respond')), 10000);
    const onMessage = message => finish(null, message);
    const onError = error => finish(error);
    const onExit = (code, signal) => finish(Error(`lock contender exited before replying (${code}, ${signal})`));
    function finish(error, message) {
      clearTimeout(timer); child.off('message', onMessage); child.off('error', onError); child.off('exit', onExit);
      if (error) reject(error); else resolve(message);
    }
    child.once('message', onMessage); child.once('error', onError); child.once('exit', onExit);
  });
}

test('two simultaneous processes recover one stale lock without deleting the winning lease', async t => {
  const f = fixture(t); putLegacy(f.lock, { pid: exitedPid(), at: 1 });
  const modulePath = path.resolve(__dirname, '../src/updater/lock');
  const source = `
    const { acquireLock } = require(process.argv[1]);
    let lease;
    process.on('message', message => {
      if (message === 'go') {
        try { lease = acquireLock(process.argv[2]); process.send({ result: 'acquired' }); }
        catch (error) { process.send({ result: error.code || error.message }); }
      } else if (message === 'verify') {
        try { lease.assertOwned(); process.send({ result: 'owned' }); }
        catch (error) { process.send({ result: error.code || error.message }); }
      } else if (message === 'release') {
        if (lease) lease.release(); process.exit(0);
      }
    });
    process.send({ result: 'ready' });
  `;
  const children = [0, 1].map(() => spawn(process.execPath, ['-e', source, modulePath, f.root], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }));
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); });
  assert.deepEqual(await Promise.all(children.map(nextMessage)), [{ result: 'ready' }, { result: 'ready' }]);
  const replies = children.map(nextMessage);
  for (const child of children) child.send('go');
  const results = await Promise.all(replies);
  assert.equal(results.filter(x => x.result === 'acquired').length, 1, JSON.stringify(results));
  assert.equal(results.filter(x => x.result === 'BUSY').length, 1, JSON.stringify(results));
  const winner = children[results.findIndex(x => x.result === 'acquired')], verified = nextMessage(winner);
  winner.send('verify'); assert.deepEqual(await verified, { result: 'owned' });
  const exits = children.map(child => new Promise(resolve => child.once('exit', resolve)));
  for (const child of children) child.send('release');
  await Promise.all(exits); assert.equal(fs.existsSync(f.lock), false); f.verifyData();
});
