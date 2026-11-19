'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OWNER = '5511987654321';
const OTHER = '5511976543210';

// Exercise the real launcher AND entry point in a disposable installation.
// Only the network, dependency installer and WhatsApp supervisor are replaced.
function fixture(t, { owner = OWNER } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-update-entry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['scripts', 'src/updater', 'src/config', 'src/utils', 'src/licensing', 'node_modules', 'data', 'sessions', 'storage']) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
  }
  for (const name of ['scripts/update-and-start.js', 'src/index.js', 'src/config/owner-setup.js', 'src/utils/terminal-input.js']) {
    fs.copyFileSync(path.join(__dirname, '..', name), path.join(root, name));
  }
  fs.cpSync(path.dirname(require.resolve('dotenv/package.json')), path.join(root, 'node_modules/dotenv'), { recursive: true });
  const put = (name, contents) => fs.writeFileSync(path.join(root, name), contents);
  put('src/bootstrap.js', 'exports.ensureDependencies = () => true;');
  put('src/updater/recovery.js', 'exports.recover = () => {};');
  put('src/updater/source.js', `exports.githubSnapshot = async () => {
    if (process.env.FAKE_UPDATE_OK === '1') return { sha: 'a'.repeat(40), files: [] };
    throw Object.assign(Error('private-url?token=SECRET'), { response: { status: 403 } });
  };`);
  put('src/updater/service.js', `exports.describeFailure = require(${JSON.stringify(path.join(__dirname, '../src/updater/service'))}).describeFailure;
    exports.UpdateService = class { async update() { console.log('mock-update-applied'); return {}; } };`);
  put('src/licensing/licenseGuard.js', `exports.authorizeStartup = async () => {
    console.log('license-checked');
    if (process.env.FAKE_LICENSE_DENIED === '1') throw Object.assign(Error('denied'), { code: 'LOBO_LICENSE_DENIED' });
    return { enabled: false };
  };`);
  put('src/updater/supervisor.js', `exports.start = () => console.log('supervisor-owner:' + process.env.BOT_OWNER);`);
  const protectedFiles = { '.env': 'BOT_OWNERS=' + OTHER + '\n', 'data/game.db': 'existing-game',
    'sessions/creds.json': 'existing-session', 'storage/profile.json': 'existing-profile' };
  for (const [name, contents] of Object.entries(protectedFiles)) put(name, contents);
  const ownerFile = path.join(root, 'data/bot-owner.json');
  if (owner !== null) fs.writeFileSync(ownerFile, JSON.stringify({ owner }) + '\n', { mode: 0o600 });
  const run = (extra = {}, input = '') => spawnSync(process.execPath, ['scripts/update-and-start.js'], {
    cwd: root, env: { ...process.env, BOT_OWNER: '', PORT: '', RENDER: '', NODE_PATH: '',
      FAKE_LICENSE_DENIED: '', FAKE_UPDATE_OK: '', ...extra }, input, encoding: 'utf8', timeout: 10000,
  });
  function preserved() {
    for (const [name, contents] of Object.entries(protectedFiles)) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), contents);
  }
  return { root, run, ownerFile, preserved };
}

test('update launcher loads the saved owner even when GitHub is unavailable', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp('supervisor-owner:' + OWNER));
  assert.ok(result.stdout.indexOf('license-checked') < result.stdout.indexOf('supervisor-owner:'));
  assert.doesNotMatch(result.stdout, /Primeiro início|Número do dono/);
  assert.match(result.stderr, /HTTP_403/);
  assert.doesNotMatch(result.stderr, /SECRET|private-url/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.ownerFile, 'utf8')), { owner: OWNER });
  f.preserved();
});

test('update launcher registers once via console and restores that owner on restart', t => {
  const f = fixture(t, { owner: null });
  const first = f.run({}, OWNER + '\n');
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.indexOf('license-checked') < first.stdout.indexOf('Número do dono'));
  assert.match(first.stdout, new RegExp('supervisor-owner:' + OWNER));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.ownerFile, 'utf8')), { owner: OWNER });
  if (process.platform !== 'win32') assert.equal(fs.statSync(f.ownerFile).mode & 0o777, 0o600);
  const next = f.run();
  assert.equal(next.status, 0, next.stderr);
  assert.match(next.stdout, new RegExp('supervisor-owner:' + OWNER));
  assert.doesNotMatch(next.stdout, /Número do dono/);
  f.preserved();
});

test('update launcher honors an explicit owner without overwriting the stored owner', t => {
  const f = fixture(t);
  const result = f.run({ BOT_OWNER: OTHER, FAKE_UPDATE_OK: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.indexOf('mock-update-applied') < result.stdout.indexOf('license-checked'));
  assert.match(result.stdout, new RegExp('supervisor-owner:' + OTHER));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.ownerFile, 'utf8')), { owner: OWNER });
  f.preserved();
});

for (const updated of [false, true]) test(`update launcher enforces licensing before owner setup (${updated ? 'updated' : 'offline'})`, t => {
  const f = fixture(t, { owner: null });
  const result = f.run({ FAKE_LICENSE_DENIED: '1', FAKE_UPDATE_OK: updated ? '1' : '' }, OWNER + '\n');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /LOBO_LICENSE_DENIED/);
  assert.doesNotMatch(result.stdout, /Número do dono|supervisor-owner:/);
  assert.equal(fs.existsSync(f.ownerFile), false);
  f.preserved();
});

test('closed console without any owner blocks once before starting a restart loop', t => {
  const f = fixture(t, { owner: null });
  const result = f.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /OWNER_INPUT_CLOSED/);
  assert.doesNotMatch(result.stdout, /supervisor-owner:/);
  assert.equal(fs.existsSync(f.ownerFile), false);
  f.preserved();
});

test('an invalid owner is preserved and does not silently authorize another number', t => {
  const f = fixture(t, { owner: 'invalid' });
  const result = f.run({}, OTHER + '\n');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /OWNER_CONFIG_INVALID/);
  assert.doesNotMatch(result.stdout, /supervisor-owner:|Número do dono/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.ownerFile, 'utf8')), { owner: 'invalid' });
  f.preserved();
});
