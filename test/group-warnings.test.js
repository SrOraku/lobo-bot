'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createWarningStore } = require('../src/moderation/warnings');
const { matchingFeatures, inspect } = require('../src/activations/message-rules');
test('advertências persistem, isolam grupos, deduplicam e zeram com auditoria', t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const first = createWarningStore(db), user = '5511999999999@s.whatsapp.net';
  for (let i = 1; i <= 5; i++) assert.equal(first.add('1@g.us', user, 'admin', 'link', 'm' + i).count, i);
  assert.equal(first.add('1@g.us', user, 'admin', 'link', 'm5').duplicate, true);
  const reloaded = createWarningStore(db);
  assert.equal(reloaded.get('1@g.us', user), 5);
  assert.equal(reloaded.get('2@g.us', user), 0);
  assert.equal(reloaded.add('2@g.us', user, 'admin', 'motivo', 'm1').count, 1);
  reloaded.reset('1@g.us', user, 'admin');
  assert.equal(reloaded.get('1@g.us', user), 0);
  assert.equal(reloaded.get('2@g.us', user), 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM group_warning_events WHERE reason='RESET'").get().n, 1);
});
test('antilink geral e convites WhatsApp são independentes, inclusive links mistos', () => {
  const data = inspect({ conversation: '' });
  const matches = (body, id) => matchingFeatures(data, body, name => name === id).includes(id);
  assert.ok(matches('https://example.com', 'antilink'));
  assert.ok(matches('example.com/teste', 'antilink'));
  assert.ok(!matches('https://example.com', 'antilinkgrupo'));
  assert.ok(matches('https://chat.whatsapp.com/ABC123', 'antilinkgrupo'));
  assert.ok(!matches('https://wa.me/5511999999999', 'antilinkgrupo'));
  assert.ok(matches('https://chat.whatsapp.com/ABC123 https://example.com', 'antilinkexterno'));
});
test('ações automáticas só removem na quinta, delete não adverte e sobreposição conta uma vez', async t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const warnings = createWarningStore(db), removed = [], sent = [];
  const vm = require('node:vm'), fs = require('node:fs'), { createRequire } = require('node:module');
  const file = require('node:path').join(__dirname, '../src/handlers/protection.js');
  let mode = 'delete', admin = false, botAdmin = true;
  const modules = {
    '../utils/helpers': { logger: { warn() {} }, isBrazilianFake: () => false },
    '../activations/manager': { manager: { isEnabled: (_, id) => ['antilink', 'antilinkgrupo'].includes(id) } },
    '../activations/access': { resolveActor: async () => ({ admin, owner: false, botAdmin, phone: '5511999999999@s.whatsapp.net' }) },
    '../activations/store': { getStore: () => ({ get: () => ({ options: { antilink_mode: mode, antilinkgrupo_mode: mode } }) }) },
    '../moderation/warnings': { getWarningStore: () => warnings },
  };
  const loaded = { exports: {} }, native = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module: loaded, require: id => modules[id] || native(id) });
  const sock = { sendMessage: async (_, c) => sent.push(c), groupParticipantsUpdate: async (_, users) => removed.push(users) };
  const ctx = { jid: '1@g.us', sender: '5511999999999@s.whatsapp.net', body: 'https://chat.whatsapp.com/ABC', isGroup: true };
  const send = id => loaded.exports.handleProtection(sock, { key: { id }, message: { conversation: ctx.body } }, ctx);
  await send('delete'); assert.equal(warnings.get(ctx.jid, ctx.sender), 0); assert.equal(sent.length, 1);
  mode = 'warn';
  for (let i = 1; i < 5; i++) { await send('w' + i); assert.equal(removed.length, 0); }
  await send('w5'); assert.equal(removed.length, 1); assert.equal(warnings.get(ctx.jid, ctx.sender), 5);
  await send('w5'); assert.equal(removed.length, 1);
  admin = true; assert.equal(await send('admin'), false);
  admin = false; botAdmin = false; assert.equal(await send('no-permission'), false);
});
