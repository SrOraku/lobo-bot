'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture({ gate = true, cooldown = false } = {}) {
  const file = path.join(__dirname, '../src/core/commandRegistry.js');
  const native = require('node:module').createRequire(file), module = { exports: {} };
  const logs = [], plugins = {}, sent = [];
  const mocks = {
    '../middlewares/permissions': { LEVELS: { USER: 0, GROUP_ADMIN: 1, BOT_ADMIN: 2, OWNER: 3 }, resolveLevel: async () => 0, LEVEL_NAMES: { 0: 'Membro' } },
    '../middlewares/rateLimit': { checkRateLimit: () => ({ allowed: !cooldown }) },
    './eventBus': { bus: { emit() {} }, EVENTS: {} },
    '../config/logger': { logCommand: (...args) => logs.push(args), logError: () => {} },
    './response': { warn: () => 'aviso' },
    '../config': { get: name => name === 'PREFIX' ? '!!' : '' },
    './pluginLoader': { getPluginCommands: () => plugins },
    '../activations/gate': { checkActivation: async () => gate },
    '../middlewares/command-limits': { createCommandLimiter: () => ({ check: () => ({ allowed: true }) }) },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: name => mocks[name] || native(name) });
  const ctx = { jid: '120000@g.us', sender: '5511999999999@s.whatsapp.net', isGroup: true,
    pushName: 'Ana', groupName: 'Alcateia', args: ['PRIVATE-COMMAND-ARG'], msg: {} };
  const sock = { sendMessage: async (_, content) => sent.push(content) };
  return { ...module.exports, logs, plugins, ctx, sock, sent };
}
test('registered commands log once before gates and never include private arguments', async () => {
  const x = fixture({ gate: false }); let called = false;
  x.register({ name: 'menu', handler: async () => { called = true; } });
  await x.execute('menu', x.sock, x.ctx);
  assert.equal(x.logs.length, 1); assert.equal(called, false);
  assert.equal(x.logs[0][1], 'menu'); assert.equal(x.logs[0][3].prefix, '!!');
  assert.ok(!JSON.stringify(x.logs).includes('PRIVATE-COMMAND-ARG'));
});
test('plugin commands are logged and execute through their existing route', async () => {
  const x = fixture(); let called = false; x.plugins.meuplugin = async () => { called = true; };
  await x.execute('meuplugin', x.sock, x.ctx);
  assert.equal(x.logs.length, 1); assert.equal(x.logs[0][1], 'meuplugin'); assert.equal(called, true);
});
test('cooldown requests stay visible without duplicating logs or executing the command', async () => {
  const x = fixture({ cooldown: true }); let called = false;
  x.register({ name: 'ping', handler: async () => { called = true; } });
  await x.execute('ping', x.sock, x.ctx);
  assert.equal(x.logs.length, 1); assert.equal(called, false);
});
