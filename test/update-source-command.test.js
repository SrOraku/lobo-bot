'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { managedPath, githubSnapshot } = require('../src/updater/source');
const { createUpdateHandler } = require('../src/commands/update');

const OWNER = '5543920030769';
const config = { BOT_OWNER: OWNER, BOT_NAME: '🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑',
  BOT_DESCRIPTION: '🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺',
  DEVELOPER_NAME: '🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺', PREFIX: '!!' };
function commandFixture({ sender = `${OWNER}@s.whatsapp.net`, mapping = null } = {}) {
  const replies = [], calls = [];
  const service = { async status() { calls.push('status'); return { version: '3.3.0', node: '22.23.3', baileys: '7.0.0-rc14' }; },
    async update(action) { calls.push(action); return { version: '3.4.0', backup: 'backup-test' }; } };
  const sock = { user: { id: '5511999999999@s.whatsapp.net' },
    signalRepository: { lidMapping: { async getPNForLID() { return mapping; } } },
    async sendMessage(jid, content) { replies.push(content.text); } };
  const ctx = { jid: '120000@g.us', args: [], senderNumber: OWNER, senderLevel: 3, isOwner: true,
    msg: { key: { remoteJid: '120000@g.us', participant: sender, id: 'trusted-outer-key' } } };
  const handler = createUpdateHandler({ service, config, logger: { error() {} } });
  return { replies, calls, sock, ctx, handler };
}

test('update help includes current bot identity and all literal-prefix commands', async () => {
  const f = commandFixture(); await f.handler(f.sock, f.ctx); const text = f.replies[0];
  for (const value of [config.BOT_NAME, config.BOT_DESCRIPTION, config.DEVELOPER_NAME, '!!atualizar bot', '!!atualizar baileys', '!!atualizar status']) assert.ok(text.includes(value), value);
  assert.ok(text.startsWith('🌹') && text.endsWith('🐺')); assert.equal(f.calls.length, 0);
});

test('only trusted owner PN or mapped LID can request an update; forged role fields grant nothing', async () => {
  for (const sender of ['5511777777777@s.whatsapp.net', `${OWNER}@lid`, '5543996375955@s.whatsapp.net']) {
    const f = commandFixture({ sender }); f.ctx.args = ['bot']; await f.handler(f.sock, f.ctx);
    assert.deepEqual(f.calls, []); assert.match(f.replies[0], /exclusivo do dono/);
  }
  const f = commandFixture({ sender: '700000@lid', mapping: `${OWNER}@s.whatsapp.net` });
  f.ctx.args = ['bot']; await f.handler(f.sock, f.ctx); assert.deepEqual(f.calls, ['bot']); assert.match(f.replies.at(-1), /Reinicie/);
});

test('status is owner-only and exposes versions and pending restart without invoking installation', async () => {
  const f = commandFixture(); f.ctx.args = ['status']; await f.handler(f.sock, f.ctx);
  assert.deepEqual(f.calls, ['status']); assert.match(f.replies[0], /22.23.3/); assert.match(f.replies[0], /7.0.0-rc14/);
});

test('arbitrary versions, URLs, shell fragments and extra arguments are rejected', async () => {
  for (const args of [['bot', 'https://evil.test'], ['baileys', '8.0.0'], ['node'], ['bot; rm -rf anything']]) {
    const f = commandFixture(); f.ctx.args = args; await f.handler(f.sock, f.ctx); assert.deepEqual(f.calls, []); assert.match(f.replies[0], /COMANDO INVÁLIDO/);
  }
});

test('child process errors are not exposed as logs or secrets in a WhatsApp reply', async () => {
  const f = commandFixture(); f.ctx.args = ['bot']; const handler = createUpdateHandler({ config,
    service: { async update() { throw Object.assign(new Error('private child stderr'), { code: 1 }); } }, logger: { error() {} } });
  await handler(f.sock, f.ctx); assert.ok(!f.replies.join('').includes('private child stderr')); assert.match(f.replies.at(-1), /log do servidor/);
});

test('managed paths exclude runtime state, personal directories, traversal and symlinks by scope', () => {
  for (const name of ['.env', '.ssh/key', 'sessions/a.json', 'storage/alcateia/database.json', 'src/../.env', '/src/x.js', 'src\\x.js', 'src/node_modules/a.js', 'plugins/data/config.json', 'updates/state.json']) assert.equal(managedPath(name), false, name);
  for (const name of ['package.json', 'package-lock.json', '.env.example', 'src/index.js', 'addons/alcateia/src/game/service.js', 'scripts/check-startup.js']) assert.equal(managedPath(name), true, name);
});

function sourceFixture({ corrupt = false, truncated = false } = {}) {
  const calls = [], bodies = new Map();
  const file = (name, contents) => {
    const data = Buffer.from(contents); const sha = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    bodies.set(name, data); return { path: name, type: 'blob', mode: '100644', sha, size: data.length };
  };
  const pkg = file('package.json', '{}'), lock = file('package-lock.json', '{}');
  const index = file('src/index.js', 'entry'), boot = file('src/bootstrap.js', 'boot'), check = file('scripts/check-startup.js', 'check');
  const get = async (url, binary) => {
    calls.push(url);
    if (binary) { const name = url.split('/').slice(6).join('/'); return corrupt ? Buffer.from('corrupt') : bodies.get(name); }
    if (url.endsWith('/commits/main')) return { sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } };
    if (url.endsWith(`/git/trees/${'b'.repeat(40)}`)) return { truncated, tree: [pkg, lock,
      { path: 'src', type: 'tree', mode: '040000', sha: 'c'.repeat(40) },
      { path: 'scripts', type: 'tree', mode: '040000', sha: 'd'.repeat(40) },
      { path: '.ssh', type: 'tree', mode: '040000', sha: 'e'.repeat(40) }] };
    if (url.includes('c'.repeat(40))) return { tree: [index, boot].map(item => ({ ...item, path: item.path.slice(4) })) };
    if (url.includes('d'.repeat(40))) return { tree: [{ ...check, path: 'check-startup.js' }] };
    throw new Error('unexpected request');
  };
  return { calls, get };
}

test('GitHub snapshot downloads only allowlisted files from a pinned commit and verifies blob hashes', async () => {
  const f = sourceFixture(); const snapshot = await githubSnapshot({ get: f.get });
  assert.equal(snapshot.files.length, 5); assert.equal(snapshot.sha, 'a'.repeat(40));
  assert.equal((await snapshot.download(snapshot.files.find(x => x.path === 'src/index.js'))).toString(), 'entry');
  assert.ok(!f.calls.some(url => url.includes('e'.repeat(40))));
  assert.ok(f.calls.at(-1).includes(`/lobo-bot/${'a'.repeat(40)}/src/index.js`));
});

test('GitHub integrity failure or incomplete tree stops the update', async () => {
  const f = sourceFixture({ corrupt: true }); const snapshot = await githubSnapshot({ get: f.get });
  await assert.rejects(snapshot.download(snapshot.files[0]), /integridade/);
  await assert.rejects(githubSnapshot({ get: sourceFixture({ truncated: true }).get }), /incompleta/);
});
