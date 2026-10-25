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
  return { replies, calls, sock, ctx, handler, service };
}

test('update help includes current bot identity and all literal-prefix commands', async () => {
  const f = commandFixture(); await f.handler(f.sock, f.ctx); const text = f.replies[0];
  for (const value of ['!!atualizar bot', '!!atualizar baileys', '!!atualizar status']) assert.ok(text.includes(value), value);
  assert.ok(text.startsWith('🌹╔═══❖♆❖═══╗') && text.endsWith('╚═══❖♆❖═══╝🐺')); assert.equal(f.calls.length, 0);
});

test('only trusted owner PN or mapped LID can request an update; forged role fields grant nothing', async () => {
  for (const sender of ['5511777777777@s.whatsapp.net', `${OWNER}@lid`, '5543996375955@s.whatsapp.net']) {
    const f = commandFixture({ sender }); f.ctx.args = ['bot']; await f.handler(f.sock, f.ctx);
    assert.deepEqual(f.calls, []); assert.match(f.replies[0], /exclusivo do dono/);
  }
  const f = commandFixture({ sender: '700000@lid', mapping: `${OWNER}@s.whatsapp.net` });
  f.ctx.args = ['bot']; await f.handler(f.sock, f.ctx); assert.deepEqual(f.calls, ['bot']); assert.match(f.replies.at(-1), /npm start/);
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
  return { calls, get, bodies };
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

test('transient raw failures retry twice then use the exact pinned GitHub blob', async () => {
  const f = sourceFixture(), waits = [], urls = [];
  const get = async (url, binary) => {
    if (binary) { urls.push(url); throw Object.assign(Error('connection lost'), { code: 'ECONNRESET' }); }
    if (url.includes('/git/blobs/')) {
      urls.push(url); const bytes = f.bodies.get('package.json');
      return { sha: url.split('/').at(-1), encoding: 'base64', size: bytes.length, content: bytes.toString('base64') };
    }
    return f.get(url, binary);
  };
  const source = await githubSnapshot({ get, wait: async ms => waits.push(ms) });
  const file = source.files.find(item => item.path === 'package.json');
  assert.equal((await source.download(file)).toString(), '{}');
  assert.deepEqual(waits, [500, 1500]); assert.equal(urls.length, 4);
  assert.ok(urls.at(-1).endsWith('/git/blobs/' + file.sha));
});

test('a truncated raw response can recover only through bytes matching the expected blob hash', async () => {
  const f = sourceFixture(); let fallback = 0;
  const source = await githubSnapshot({ get: async (url, binary) => {
    if (binary) return Buffer.from('truncated');
    if (url.includes('/git/blobs/')) { fallback++; const bytes = f.bodies.get('package.json'); return { sha: url.split('/').at(-1), encoding: 'base64', content: bytes.toString('base64') }; }
    return f.get(url, binary);
  }, wait: async () => {} });
  assert.equal((await source.download(source.files[0])).toString(), '{}'); assert.equal(fallback, 1);
});

for (const [name, blob] of [
  ['wrong SHA', sha => ({ sha: '0'.repeat(40), encoding: 'base64', content: 'e30=' })],
  ['invalid encoding', sha => ({ sha, encoding: 'utf8', content: '{}' })],
  ['malformed base64', sha => ({ sha, encoding: 'base64', content: '!!!' })],
  ['oversized blob', sha => ({ sha, encoding: 'base64', content: 'e30=', size: 3 * 1024 * 1024 })],
]) test(`fallback rejects ${name} without accepting unverified bytes`, async () => {
  const f = sourceFixture(); const source = await githubSnapshot({ get: async (url, binary) => {
    if (binary) throw Error('raw failed');
    if (url.includes('/git/blobs/')) return blob(url.split('/').at(-1));
    return f.get(url, binary);
  }, wait: async () => {} });
  await assert.rejects(source.download(source.files[0]), error => error.code === 'DOWNLOAD_INVALID_BLOB' && error.updateFile === 'package.json');
});

test('fallback content hash mismatch remains a hard failure with a safe file diagnostic', async () => {
  const f = sourceFixture(); const source = await githubSnapshot({ get: async (url, binary) => {
    if (binary) return Buffer.from('corrupt raw');
    if (url.includes('/git/blobs/')) return { sha: url.split('/').at(-1), encoding: 'base64', content: Buffer.from('corrupt blob').toString('base64') };
    return f.get(url, binary);
  }, wait: async () => {} });
  await assert.rejects(source.download(source.files[0]), { code: 'DOWNLOAD_HASH_MISMATCH', updateFile: 'package.json' });
});

test('all official download attempts exhausted produces a bounded file-specific error', async () => {
  const f = sourceFixture(), waits = []; let attempts = 0;
  const source = await githubSnapshot({ get: async (url, binary) => {
    if (binary || url.includes('/git/blobs/')) { attempts++; throw Object.assign(Error('secret transport details'), { response: { status: 503 } }); }
    return f.get(url, binary);
  }, wait: async ms => waits.push(ms) });
  await assert.rejects(source.download(source.files[0]), error => error.updateFile === 'package.json' && error.response.status === 503 && !error.message.includes('secret'));
  assert.equal(attempts, 6); assert.deepEqual(waits, [500, 1500, 500, 1500]);
});

test('metadata request retries transient rate limiting without changing the pinned commit', async () => {
  const f = sourceFixture(); let calls = 0;
  const source = await githubSnapshot({ get: async (url, binary) => {
    if (url.endsWith('/commits/main') && calls++ < 2) throw Object.assign(Error('rate'), { response: { status: 429 } });
    return f.get(url, binary);
  }, wait: async () => {} });
  assert.equal(calls, 3); assert.equal(source.sha, 'a'.repeat(40));
});

test('permission refusal does not loop retrying the same endpoint', async () => {
  const { retryRequest } = require('../src/updater/source'); let calls = 0;
  await assert.rejects(retryRequest(async () => { calls++; throw Object.assign(Error('denied'), { response: { status: 403 } }); }, async () => assert.fail('must not wait')), /denied/);
  assert.equal(calls, 1);
});

test('atualização concluída avisa antes de solicitar reinício automático', async () => {
  const f = commandFixture();
  let restarted = false;
  const handler = createUpdateHandler({ config, service: {
    async update() { return { version: '1.2.0', backup: 'safe-backup' }; },
  }, restart: {
    canRestart: () => true,
    requestRestart() { assert.match(f.replies.at(-1), /Reiniciando automaticamente/); restarted = true; },
  } });
  f.ctx.args = ['bot']; await handler(f.sock, f.ctx);
  assert.equal(restarted, true);
});

test('failed completion notice cannot prevent automatic restart or claim the application failed', async () => {
  const f = commandFixture(); f.ctx.args = ['bot']; let restarted = 0;
  const send = f.sock.sendMessage;
  f.sock.sendMessage = async (jid, content) => { if (content.text.includes('ATUALIZAÇÃO CONCLUÍDA')) throw Error('private transport details'); return send(jid, content); };
  await createUpdateHandler({ service: f.service, config, logger: { warn() {} }, restart: { canRestart: () => true, requestRestart: () => { restarted++; return true; } } })(f.sock, f.ctx);
  assert.equal(restarted, 1); assert.deepEqual(f.calls, ['bot']);
  assert.ok(!f.replies.some(text => text.includes('ATUALIZAÇÃO NÃO CONCLUÍDA')));
});

test('failed initial notice still processes an authorized update request', async () => {
  const f = commandFixture(); f.ctx.args = ['bot']; let restarted = 0;
  const send = f.sock.sendMessage;
  f.sock.sendMessage = async (jid, content) => { if (content.text.includes('ATUALIZAÇÃO INICIADA')) throw Error('network'); return send(jid, content); };
  await createUpdateHandler({ service: f.service, config, logger: { warn() {} }, restart: { canRestart: () => true, requestRestart: () => { restarted++; return true; } } })(f.sock, f.ctx);
  assert.equal(restarted, 1); assert.deepEqual(f.calls, ['bot']);
});

test('a completion notice that never resolves has a bounded deadline and still restarts', async () => {
  const f = commandFixture(); f.ctx.args = ['bot']; let restarted = 0;
  const send = f.sock.sendMessage;
  f.sock.sendMessage = (jid, content) => content.text.includes('ATUALIZAÇÃO CONCLUÍDA') ? new Promise(() => {}) : send(jid, content);
  await createUpdateHandler({ service: f.service, config, notifyTimeoutMs: 5, logger: { warn() {} }, restart: { canRestart: () => true, requestRestart: () => { restarted++; return true; } } })(f.sock, f.ctx);
  assert.equal(restarted, 1);
});

test('pending restart requests only reload applied files without running another installation', async () => {
  const f = commandFixture(); f.ctx.args = ['bot']; let restarted = 0;
  const service = { needsRestart: true, update: () => assert.fail('must not reinstall') };
  await createUpdateHandler({ service, config, restart: { canRestart: () => true, requestRestart: () => { restarted++; return true; } } })(f.sock, f.ctx);
  assert.equal(restarted, 1); assert.match(f.replies.at(-1), /arquivos novos já estão aplicados/);
});

test('RESTART_REQUIRED from a compatible service is recovered through the supervisor', async () => {
  const f = commandFixture(); f.ctx.args = ['bot']; let restarted = 0;
  const service = { update: async () => { throw Object.assign(Error('pending'), { code: 'RESTART_REQUIRED' }); } };
  await createUpdateHandler({ service, config, restart: { canRestart: () => true, requestRestart: () => { restarted++; return true; } } })(f.sock, f.ctx);
  assert.equal(restarted, 1); assert.ok(!f.replies.some(text => text.includes('ATUALIZAÇÃO NÃO CONCLUÍDA')));
});

test('failure before application never requests restart', async () => {
  const f = commandFixture(); f.ctx.args = ['bot'];
  const service = { update: async () => { throw Error('network failed'); } };
  await createUpdateHandler({ service, config, logger: { error() {} }, restart: { canRestart: () => true, requestRestart: () => assert.fail('must not restart') } })(f.sock, f.ctx);
  assert.match(f.replies.at(-1), /ATUALIZAÇÃO NÃO CONCLUÍDA/);
});

test('failed restart request preserves application success and a repeated command retries only restart', async () => {
  const f = commandFixture(); f.ctx.args = ['bot']; let installs = 0, restarts = 0;
  const service = { needsRestart: false, update: async () => { installs++; service.needsRestart = true; return { version: 'new', backup: 'backup-safe' }; } };
  const handler = createUpdateHandler({ service, config, restart: { canRestart: () => true, requestRestart: () => ++restarts > 1 } });
  await handler(f.sock, f.ctx); assert.match(f.replies.at(-1), /ARQUIVOS ATUALIZADOS/);
  await handler(f.sock, f.ctx); assert.equal(installs, 1); assert.equal(restarts, 2);
});

test('pending restart remains owner-only and never trusts forged role fields', async () => {
  const f = commandFixture({ sender: '5511777777777@s.whatsapp.net' }); f.ctx.args = ['bot'];
  await createUpdateHandler({ service: { needsRestart: true }, config, restart: { canRestart: () => true, requestRestart: () => assert.fail('unauthorized restart') } })(f.sock, f.ctx);
  assert.match(f.replies[0], /exclusivo do dono/);
});

test('help and status explain automatic supervision instead of requiring repeated panel restarts', async () => {
  const f = commandFixture(); const handler = createUpdateHandler({ service: f.service, config, restart: { canRestart: () => true } });
  await handler(f.sock, f.ctx); assert.match(f.replies[0], /Reinício automático ativo/); assert.ok(!f.replies[0].includes('reinicie o bot pelo painel'));
  f.ctx.args = ['status']; await handler(f.sock, f.ctx); assert.match(f.replies.at(-1), /Supervisor automático: ativo/);
});
