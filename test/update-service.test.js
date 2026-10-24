'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { UpdateService } = require('../src/updater/service');

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-update-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pkg = { name: 'lobo-bot', version: '3.3.0', engines: { node: '>=22.12.0' },
    dependencies: { '@whiskeysockets/baileys': 'npm:baileys@7.0.0-rc13' } };
  const put = async (name, data) => { const dest = path.join(root, name); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, data); };
  const lock = p => ({ name: p.name, version: p.version, lockfileVersion: 3, packages: { '': p } });
  await put('package.json', JSON.stringify(pkg)); await put('package-lock.json', JSON.stringify(lock(pkg)));
  await put('src/index.js', 'old code'); await put('src/bootstrap.js', 'bootstrap'); await put('scripts/check-startup.js', 'check');
  await put('plugins/custom.js', 'custom plugin');
  await put('node_modules/@whiskeysockets/baileys/package.json', JSON.stringify({ version: '7.0.0-rc13' }));
  await put('node_modules/old-marker', 'old dependency');
  const protectedFiles = { '.env': 'BOT_OWNER=5543920030769', 'sessions/creds.json': '{"fixture":true}',
    'data/lobo.db': 'old sqlite fixture', 'storage/alcateia/database.json': '{"coins":123}' };
  for (const [name, data] of Object.entries(protectedFiles)) await put(name, data);
  const next = { ...pkg, version: '3.4.0', dependencies: options.sameDependencies ? pkg.dependencies : { '@whiskeysockets/baileys': 'npm:baileys@7.0.0-rc14' } };
  const contents = { 'package.json': JSON.stringify(next), 'package-lock.json': JSON.stringify(lock(next)),
    'src/index.js': 'new code', 'src/bootstrap.js': 'new bootstrap', 'scripts/check-startup.js': 'new check', ...(options.contents || {}) };
  const files = Object.keys(contents).map(name => ({ path: name, mode: '100644' }));
  const calls = [], logs = [];
  let checker;
  const run = async (command, args, settings) => {
    calls.push({ command, args, settings });
    if (args[0] === 'view') return { stdout: JSON.stringify(options.latest || { version: '7.0.0-rc14', engines: { node: '>=20' }, repository: { url: 'git+ssh://git@github.com/WhiskeySockets/Baileys.git' } }) };
    if (args[0] === 'install') {
      const p = JSON.parse(await fs.readFile(path.join(settings.cwd, 'package.json')));
      await fs.writeFile(path.join(settings.cwd, 'package-lock.json'), JSON.stringify(lock(p)));
    } else if (args[0] === 'ci') {
      if (options.failInstall) throw new Error('install failed');
      const dir = path.join(settings.cwd, 'node_modules/@whiskeysockets/baileys'); await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '7.0.0-rc14' }));
      await fs.writeFile(path.join(settings.cwd, 'node_modules/new-marker'), 'new dependency');
    } else {
      if (options.failSyntax && args.includes('check:syntax')) throw Error('syntax failed');
      if (options.failTests && args[0] === 'test') throw Error('tests failed');
      if (options.failCheck) throw new Error('check failed');
      if (checker) await checker(settings.cwd);
    }
    return { stdout: '' };
  };
  const source = { sha: 'a'.repeat(40), files, async download(file) { return Buffer.from(contents[file.path]); } };
  const snapshot = async () => { if (options.beforeSnapshot) await options.beforeSnapshot(); return source; };
  const service = new UpdateService({ root, run, snapshot, nodeVersion: options.node || '22.23.3', logger: { error(...args) { logs.push(args); } } });
  return { root, service, run, snapshot, calls, logs, source, pkg, put, setChecker(fn) { checker = fn; },
    async read(name) { return fs.readFile(path.join(root, name), 'utf8'); },
    async preserved() { for (const [name, data] of Object.entries(protectedFiles)) assert.equal(await fs.readFile(path.join(root, name), 'utf8'), data, name); assert.equal(await fs.readFile(path.join(root, 'plugins/custom.js'), 'utf8'), 'custom plugin'); } };
}

test('bot update validates staging, backs up code and preserves session, wallet, SQLite, env and custom plugin', async t => {
  const f = await fixture(t); const result = await f.service.update('bot');
  assert.equal(await f.read('src/index.js'), 'new code'); await f.preserved();
  assert.equal(await f.read(`updates/${result.backup}/src/index.js`), 'old code');
  assert.equal((await f.service.status()).needsRestart, true);
  assert.equal((await f.service.status()).version, '3.4.0');
  assert.equal(await f.read('node_modules/new-marker'), 'new dependency');
  assert.equal(f.calls[0].args[0], 'ci'); assert.ok(f.calls[0].settings.cwd.startsWith(path.join(f.root, 'updates/stage-')));
  assert.equal(f.calls[1].command, process.execPath); assert.deepEqual(f.calls[1].args, ['scripts/check-startup.js']);
  await assert.rejects(f.service.update('bot'), { code: 'RESTART_REQUIRED' });
});

for (const flag of ['failInstall', 'failCheck']) test(`${flag} never replaces active code or dependencies`, async t => {
  const f = await fixture(t, { [flag]: true }); await assert.rejects(f.service.update('bot'));
  assert.equal(await f.read('src/index.js'), 'old code'); assert.equal(await f.read('node_modules/old-marker'), 'old dependency');
  await f.preserved(); assert.equal(f.service.running, false); assert.equal(f.service.needsRestart, false);
  assert.deepEqual((await fs.readdir(path.join(f.root, 'updates'))).filter(x => x.startsWith('stage-') || x === 'update.lock'), []);
});

test('partial publication failure restores old code and dependencies atomically enough to retry', async t => {
  const f = await fixture(t, { contents: { 'src/second.js': 'second' } });
  f.setChecker(async stage => fs.unlink(path.join(stage, 'src/second.js')));
  await assert.rejects(f.service.update('bot'));
  assert.equal(await f.read('src/index.js'), 'old code'); assert.equal(await f.read('node_modules/old-marker'), 'old dependency');
  assert.equal(JSON.parse(await f.read('package.json')).version, '3.3.0');
  await assert.rejects(f.read('node_modules/new-marker'), { code: 'ENOENT' }); await f.preserved();
});

test('Baileys upgrade pins only the validated official release and checks before activation', async t => {
  const f = await fixture(t); const result = await f.service.update('baileys');
  assert.equal(result.version, '7.0.0-rc14'); assert.equal(await f.read('src/index.js'), 'old code');
  assert.equal(JSON.parse(await f.read('package.json')).dependencies['@whiskeysockets/baileys'], 'npm:baileys@7.0.0-rc14');
  assert.equal(f.calls[0].args[0], 'view'); assert.equal(f.calls[1].args[0], 'install'); assert.equal(f.calls[2].args[0], 'ci');
  assert.ok(f.calls.every(c => c.settings.shell === false)); await f.preserved();
});

test('already current Baileys is a no-op and does not require restart', async t => {
  const f = await fixture(t); await f.put('node_modules/@whiskeysockets/baileys/package.json', '{"version":"7.0.0-rc14"}');
  assert.equal((await f.service.update('baileys')).already, true); assert.equal(f.calls.length, 1); assert.equal(f.service.needsRestart, false); await f.preserved();
});

for (const [name, latest] of [
  ['incompatible Node engine', { version: '8.0.0', engines: { node: '>=24' }, repository: { url: 'https://github.com/WhiskeySockets/Baileys' } }],
  ['fake official repository', { version: '8.0.0', repository: { url: 'https://evil.test/github.com/WhiskeySockets/Baileys' } }],
  ['invalid version', { version: '7.0.0; touch something', repository: { url: 'https://github.com/WhiskeySockets/Baileys' } }],
]) test(`Baileys rejects ${name}`, async t => {
  const f = await fixture(t, { latest }); await assert.rejects(f.service.update('baileys')); assert.equal(f.calls.length, 1); await f.preserved();
});

test('unsupported Node is rejected before downloading or installing anything', async t => {
  const f = await fixture(t, { node: '20.0.0' }); await assert.rejects(f.service.update('bot'), /22.12/); assert.equal(f.calls.length, 0); await f.preserved();
});

test('filesystem lock and in-process guard reject concurrent updates across two instances', async t => {
  let release, started; const ready = new Promise(r => { started = r; }); const gate = new Promise(r => { release = r; });
  const f = await fixture(t, { beforeSnapshot: async () => { started(); await gate; } });
  const pending = f.service.update('bot'); await ready;
  await assert.rejects(f.service.update('baileys'), { code: 'BUSY' });
  const other = new UpdateService({ root: f.root, run: f.run, snapshot: f.snapshot, nodeVersion: '22.23.3' });
  await assert.rejects(other.update('bot'), { code: 'BUSY' }); release(); await pending; await f.preserved();
});

test('orphan legacy update lock is recovered automatically before staging without changing private data', async t => {
  const f = await fixture(t);
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', '']);
  assert.equal(child.status, 0);
  await f.put('updates/update.lock', JSON.stringify({ pid: child.pid, at: Date.now() - 60000 }));
  await f.service.update('bot');
  assert.equal(await f.read('src/index.js'), 'new code');
  await f.preserved();
  assert.ok((await fs.readdir(path.join(f.root, 'updates'))).some(name => name.startsWith('retired-lock-')));
  await assert.rejects(fs.lstat(path.join(f.root, 'updates/update.lock')), { code: 'ENOENT' });
});

test('download error records failing file and leaves active code and private data unchanged', async t => {
  const f = await fixture(t);
  f.source.download = async file => { throw Object.assign(Error('unsafe upstream details'), { code: 'DOWNLOAD_HASH_MISMATCH', updateFile: file.path }); };
  await assert.rejects(f.service.update('bot'), error => error.code === 'DOWNLOAD_HASH_MISMATCH' && error.message.includes('Arquivo:'));
  const diagnostic = JSON.parse(await f.read('updates/last-error.json'));
  assert.ok(diagnostic.file); assert.equal(diagnostic.code, 'DOWNLOAD_HASH_MISMATCH');
  assert.ok(!JSON.stringify(diagnostic).includes('unsafe'));
  assert.equal(await f.read('src/index.js'), 'old code'); await f.preserved();
  assert.ok(!f.calls.length);
});

test('a stale published manifest reports integrity stage and exact file, never a generic download error', async t => {
  const f = await fixture(t, { contents: { 'manifest.json': JSON.stringify({ version: '3.4.0', files: { 'package.json': '0'.repeat(64) } }) } });
  await assert.rejects(f.service.update('bot'), { code: 'RELEASE_HASH_MISMATCH' });
  const diagnostic = JSON.parse(await f.read('updates/last-error.json'));
  assert.equal(diagnostic.stage, 'verificação de integridade'); assert.equal(diagnostic.file, 'package.json');
  assert.equal(f.calls.length, 0); assert.equal(await f.read('src/index.js'), 'old code'); await f.preserved();
});

test('protected files and source symlinks cannot overwrite external paths', async t => {
  const f = await fixture(t, { contents: { '.env': 'do not apply' } }); await assert.rejects(f.service.update('bot')); await f.preserved();
  const g = await fixture(t); const external = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-outside-'));
  t.after(() => fs.rm(external, { recursive: true, force: true })); await fs.writeFile(path.join(external, 'index.js'), 'outside');
  await fs.rm(path.join(g.root, 'src'), { recursive: true }); await fs.symlink(external, path.join(g.root, 'src'));
  await assert.rejects(g.service.update('bot')); assert.equal(await fs.readFile(path.join(external, 'index.js'), 'utf8'), 'outside');
});

test('only previously managed removed source files are deleted; data never is', async t => {
  const f = await fixture(t); await f.put('plugins/removed.js', 'old plugin');
  await f.put('updates/state.json', JSON.stringify({ sha: 'old', files: ['plugins/removed.js', '.env'] }));
  await f.service.update('bot'); await assert.rejects(f.read('plugins/removed.js'), { code: 'ENOENT' }); await f.preserved();
});


test('atualização só de código reutiliza dependências verificadas sem npm ci', async t => {
  const f = await fixture(t, { sameDependencies: true });
  const result = await f.service.update('bot');
  assert.equal(result.reuseDependencies, true);
  assert.ok(!f.calls.some(c => c.args[0] === 'ci'));
  assert.equal(await f.read('src/index.js'), 'new code');
  assert.equal(await f.read('node_modules/old-marker'), 'old dependency');
  await f.preserved();
});

for (const option of ['failSyntax', 'failTests']) {
  test('staging rejects ' + option + ' before applying any live file', async t => {
    const f = await fixture(t, { [option]: true });
    await assert.rejects(f.service.update('bot'));
    assert.equal(await f.read('src/index.js'), 'old code');
    assert.equal(await f.read('node_modules/old-marker'), 'old dependency');
    await f.preserved();
  });
}
