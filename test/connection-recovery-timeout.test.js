'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createLifecycle } = require('../src/connection/lifecycle');
const nextTick = () => new Promise(resolve => setImmediate(resolve));

for (const stage of ['credentials', 'socket', 'plugins']) test(`stalled ${stage} cannot leave reconnection pending forever`, async () => {
  const errors = [], fatal = [], disconnected = [];
  let reconnects = 0;
  const never = () => new Promise(() => {});
  let finish;
  const stopped = new Promise(resolve => { finish = resolve; });
  const lifecycle = createLifecycle({ operationTimeoutMs: 15, initializationTimeoutMs: 15,
    reconnect: () => { reconnects++; }, wait: async () => {},
    onDisconnect: state => disconnected.push(state),
    onError: error => errors.push(error.code), onFatal: code => { fatal.push(code); finish(); },
  });
  const socket = { ev: new EventEmitter(), end: stage === 'socket' ? never : async () => {} };
  const session = lifecycle.attach(socket, { saveCreds: stage === 'credentials' ? never : async () => {}, beforeReconnect: stage === 'plugins' ? never : async () => {} });
  socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: '428' } } } });
  assert.deepEqual(disconnected, [{ code: 428 }], 'Disconnect must be reported before waiting for plugins or disk');
  await stopped;
  assert.equal(session.isActive(), false); assert.equal(reconnects, 0);
  assert.deepEqual(fatal, ['RECONNECT_FAILED']);
  assert.ok(errors.includes({ credentials: 'SAVE_CREDS_TIMEOUT', socket: 'SOCKET_CLOSE_TIMEOUT', plugins: 'PLUGIN_INITIALIZATION_TIMEOUT' }[stage]));
});

test('normal reconnection still works when the old socket was already closed and its end throws', async () => {
  let reconnects = 0;
  const life = createLifecycle({ reconnect: async () => { reconnects++; }, wait: async () => {}, onDisconnect: () => { throw Error('console offline'); } });
  const socket = { ev: new EventEmitter(), end: () => { throw Error('already closed'); } };
  life.attach(socket, { saveCreds: async () => {} });
  socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { statusCode: '428' } } });
  await nextTick(); await nextTick();
  assert.equal(reconnects, 1);
});
