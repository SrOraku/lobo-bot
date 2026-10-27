'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReactions } = require('../src/ui/reactions');
const ctx = id => ({ jid: '120000@g.us', msg: { key: { id, remoteJid: '120000@g.us', participant: '5511999@s.whatsapp.net' } } });

test('reactions alternate themes, retain the real message key and finish after processing', async () => {
  const ui = createReactions(), sent = [], sock = { sendMessage: async (jid, value) => sent.push({ jid, value }) };
  for (const id of ['a', 'b', 'c']) {
    const message = ctx(id), original = structuredClone(message);
    assert.equal(await ui.run(sock, message, { category: 'adm' }, async () => 42), 42);
    await ui.drain(); assert.deepEqual(message, original);
  }
  assert.deepEqual(sent.map(item => item.value.react.text), ['🐺', '✅', '🌹', '✅', '🛡️', '✅']);
  assert.deepEqual(sent[0].value.react.key, ctx('a').msg.key);
});

test('a reaction transport failure never changes command execution or result', async () => {
  const ui = createReactions(), sock = { sendMessage: async () => { throw Error('offline'); } }; let calls = 0;
  assert.equal(await ui.run(sock, ctx('offline'), {}, async () => { calls++; return 'saved'; }), 'saved');
  await ui.drain(); assert.equal(calls, 1);
});

test('a command rejection propagates unchanged and does not receive a completion mark', async () => {
  const ui = createReactions(), sent = [], failure = Error('business failure');
  await assert.rejects(ui.run({ sendMessage: async (_, value) => sent.push(value.react.text) }, ctx('fail'), {}, async () => { throw failure; }), error => error === failure);
  await ui.drain(); assert.deepEqual(sent, ['🐺']);
});

test('a handler that reports a handled failure gets a failure reaction instead of a success mark', async () => {
  const ui = createReactions(), sent = [], result = { ok: false };
  assert.equal(await ui.run({ sendMessage: async (_, value) => sent.push(value.react.text) }, ctx('handled-failure'), {}, async () => result), result);
  await ui.drain(); assert.deepEqual(sent, ['🐺', '❌']);
});

test('duplicate deliveries do not repeat reactions and history remains bounded', async () => {
  let clock = 0; const ui = createReactions({ now: () => clock, maxEntries: 2 }), sent = [];
  const sock = { sendMessage: async (_, value) => sent.push(value.react.text) };
  await ui.run(sock, ctx('a'), {}, async () => {}); await ui.drain();
  await ui.run(sock, ctx('a'), {}, async () => {}); await ui.drain(); assert.equal(sent.length, 2);
  for (const id of ['b', 'c', 'd']) await ui.run(sock, ctx(id), {}, async () => {});
  await ui.drain(); assert.ok(ui.size() <= 2);
  clock = 120001; await ui.run(sock, ctx('new'), {}, async () => {}); await ui.drain(); assert.equal(ui.size(), 1);
});

test('stalled optional reactions time out without blocking the command', async () => {
  const ui = createReactions({ timeout: 5 });
  assert.equal(await ui.run({ sendMessage: () => new Promise(() => {}) }, ctx('slow'), {}, async () => 'finished'), 'finished');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(await ui.drain(), [false]);
});

test('invalid or cross-chat keys never emit a reaction', async () => {
  const ui = createReactions(); let calls = 0; const sock = { sendMessage: async () => calls++ };
  await ui.run(sock, { jid: 'other@g.us', msg: ctx('a').msg }, {}, async () => {});
  await ui.run(sock, { jid: '120000@g.us', msg: {} }, {}, async () => {});
  await ui.drain(); assert.equal(calls, 0);
});
