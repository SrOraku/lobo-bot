'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPing } = require('../src/commands/ping');
const { IDENTITY } = require('../src/menus/render');

test('ping mostra métricas dinâmicas e identidade em uma mensagem', async () => {
  const sent = [];
  let clock = 10;
  const handler = createPing({
    prefix: () => '?', catalog: () => [{ name: 'a' }, { name: 'b' }],
    online: () => 319, now: () => { const n = clock; clock += 0.4; return n; },
  });
  const ctx = { jid: 'test@g.us', msg: { key: { id: 'ping' } } };
  await handler({ sendMessage: async (...args) => sent.push(args) }, ctx);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], ctx.jid);
  assert.equal(sent[0][2].quoted, ctx.msg);
  const text = sent[0][1].text;
  for (const value of Object.values(IDENTITY)) assert.ok(text.includes(value));
  for (const value of ['🌹 Prefixo: ?', `⭐ Versão: ${require('../package.json').version}`,
    '⏱️ Uptime: 0h 5m 19s', '🏓 Ping interno: 0.4 ms', '💚 Status: online',
    '📜 Comandos: 2 (sem aliases)']) assert.ok(text.includes(value), value);
  assert.ok(text.startsWith('   ╔══❖♆❖══╗') && text.endsWith('   ╚══❖♆❖══╝'));
});
