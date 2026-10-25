'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { canRestart, requestRestart } = require('../src/updater/supervisor');
test('IPC backpressure is not a refusal when the send callback confirms delivery', async () => {
  const messages = [], channel = { connected: true, send(message, done) { messages.push(message); setImmediate(() => done(null)); return false; } };
  assert.equal(await requestRestart({ channel, supervised: true }), true);
  assert.deepEqual(messages, [{ type: 'lobo:restart' }]);
});
test('synchronous or asynchronous IPC errors return false without uncaught failures', async () => {
  for (const send of [() => { throw Error('closed'); }, (_message, done) => done(Error('EPIPE'))])
    assert.equal(await requestRestart({ channel: { connected: true, send }, supervised: true }), false);
});
test('unsupervised or disconnected runtime never pretends a restart was requested', async () => {
  const channel = { connected: false, send: () => assert.fail('disconnected send') };
  assert.equal(canRestart({ channel, supervised: true }), false);
  assert.equal(await requestRestart({ channel, supervised: true }), false);
  channel.connected = true;
  assert.equal(await requestRestart({ channel, supervised: false }), false);
});
test('IPC callback timeout is bounded rather than leaving an update hanging forever', async () => {
  const channel = { connected: true, send() {} };
  assert.equal(await requestRestart({ channel, supervised: true, timeoutMs: 5 }), false);
});
