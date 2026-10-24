'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
const { loadFileCover } = require('../src/menus/file-cover');
const { sendMenu } = require('../src/menus/media');
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-file-cover-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'assets'), cacheDirectory = path.join(root, 'cache');
  await fs.mkdir(directory);
  const calls = [], warnings = [];
  const options = { directory, cacheDirectory, ffmpeg: 'fixture-ffmpeg',
    run: async (command, args, opts) => { calls.push({ command, args, opts }); await fs.writeFile(args.at(-1), MP4); },
    warn: (code, file) => warnings.push({ code, file }),
  };
  return { root, directory, cacheDirectory, calls, warnings, options,
    put: (name, bytes) => fs.writeFile(path.join(directory, name), bytes),
  };
}
test('GIF placed directly in assets converts once and reuses the content-addressed cache', async t => {
  const f = await fixture(t); await f.put('menu-principal.gif', GIF);
  assert.deepEqual(await loadFileCover(f.options), MP4);
  assert.deepEqual(await loadFileCover(f.options), MP4); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].opts.shell, false); assert.equal(f.calls[0].opts.timeout, 30000);
  assert.ok(f.calls[0].args.includes('12')); assert.ok(f.calls[0].args.includes('libx264'));
  assert.deepEqual((await fs.readdir(f.cacheDirectory)).filter(name => !/^[a-f0-9]{64}\.mp4$/.test(name)), []);
});
test('replacing source bytes updates the cover and removes only obsolete generated cache', async t => {
  const f = await fixture(t); await f.put('menu-principal.gif', GIF); await loadFileCover(f.options);
  await fs.writeFile(path.join(f.cacheDirectory, 'custom.mp4'), 'user file');
  await f.put('menu-principal.gif', Buffer.concat([GIF, Buffer.from([0])])); await loadFileCover(f.options);
  assert.equal(f.calls.length, 2);
  assert.equal((await fs.readdir(f.cacheDirectory)).filter(name => /^[a-f0-9]{64}\.mp4$/.test(name)).length, 1);
  assert.equal(await fs.readFile(path.join(f.cacheDirectory, 'custom.mp4'), 'utf8'), 'user file');
});
test('simultaneous main menus share one conversion', async t => {
  const f = await fixture(t); await f.put('menu-principal.gif', GIF);
  const values = await Promise.all([loadFileCover(f.options), loadFileCover(f.options), loadFileCover(f.options)]);
  assert.equal(f.calls.length, 1); assert.ok(values.every(value => value.equals(MP4)));
});
test('direct GIF has priority over MP4 and missing GIF allows MP4', async t => {
  const f = await fixture(t); await f.put('menu-principal.gif', GIF); await f.put('menu-principal.mp4', MP4);
  await loadFileCover(f.options); assert.ok(f.calls[0].args[f.calls[0].args.indexOf('-i') + 1].endsWith('.gif'));
  await fs.rm(path.join(f.directory, 'menu-principal.gif')); await loadFileCover(f.options);
  assert.ok(f.calls[1].args[f.calls[1].args.indexOf('-i') + 1].endsWith('.mp4'));
});
test('missing manual files leave old menu choices and SQLite settings untouched', async t => {
  const f = await fixture(t); assert.equal(await loadFileCover(f.options), null);
  assert.equal(f.calls.length, 0); assert.equal(f.warnings.length, 0);
});
test('invalid renamed file, excessive dimensions and oversized GIF never reach ffmpeg', async t => {
  const f = await fixture(t);
  for (const bytes of [Buffer.from('not a gif'), Buffer.from('GIF89a\0\0\0\0'), Buffer.alloc(8 * 1024 * 1024 + 1)]) {
    await f.put('menu-principal.gif', bytes); assert.equal(await loadFileCover(f.options), null);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.warnings.length, 3);
});
test('source symlinks are not followed and external bytes stay unchanged', async t => {
  const f = await fixture(t), external = path.join(f.root, 'outside.gif'); await fs.writeFile(external, GIF);
  await fs.symlink(external, path.join(f.directory, 'menu-principal.gif'));
  assert.equal(await loadFileCover(f.options), null); assert.equal(f.warnings[0].code, 'MENU_COVER_SYMLINK');
  assert.deepEqual(await fs.readFile(external), GIF); assert.equal(f.calls.length, 0);
});
test('missing FFmpeg gives a safe diagnostic and removes temporary input/output', async t => {
  const f = await fixture(t); await f.put('menu-principal.gif', GIF);
  const result = await loadFileCover({ ...f.options, run: async () => { throw Object.assign(Error('private host details'), { code: 'ENOENT' }); } });
  assert.equal(result, null); assert.deepEqual(f.warnings, [{ code: 'MENU_FFMPEG_UNAVAILABLE', file: 'menu-principal.gif' }]);
  assert.deepEqual(await fs.readdir(f.cacheDirectory), []);
});
test('failed output validation never caches or sends corrupt media', async t => {
  const f = await fixture(t); await f.put('menu-principal.gif', GIF);
  assert.equal(await loadFileCover({ ...f.options, run: async (_, args) => fs.writeFile(args.at(-1), 'bad mp4') }), null);
  assert.deepEqual(await fs.readdir(f.cacheDirectory), []); assert.equal(f.warnings[0].code, 'MENU_CONVERSION_INVALID');
});
test('updater never manages or deletes manually placed GIF and MP4', () => {
  const { managedPath } = require('../src/updater/source');
  assert.equal(managedPath('src/assets/menu-principal.gif'), false);
  assert.equal(managedPath('src/assets/menu-principal.mp4'), false);
});
test('real FFmpeg converts direct GIF for main menu; submenus retain their existing cover logic', async t => {
  const f = await fixture(t); await f.put('menu-principal.gif', GIF);
  const messages = [], sock = { sendMessage: async (_, payload) => messages.push(payload) };
  const options = { manualDirectory: f.directory, manualCacheDirectory: f.cacheDirectory, getMedia: () => null,
    defaultParts: [], defaultFile: path.join(f.directory, 'missing.jpg'), useDefault: () => false };
  await sendMenu(sock, { jid: '123@g.us', args: [] }, 'menu completo', options);
  assert.ok(Buffer.isBuffer(messages[0].video)); assert.equal(messages[0].gifPlayback, true);
  assert.equal(messages[0].caption, 'menu completo');
  const file = path.join(f.cacheDirectory, (await fs.readdir(f.cacheDirectory))[0]);
  await execute(require('@ffmpeg-installer/ffmpeg').path, ['-v', 'error', '-i', file, '-f', 'null', '-']);
  await sendMenu(sock, { jid: '123@g.us', args: ['jogos'] }, 'submenu', options);
  assert.deepEqual(messages[1], { text: 'submenu' });
});
