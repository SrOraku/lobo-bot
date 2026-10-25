'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { hasSavedSession, resetIncompletePairing, credentialWriter, createLifecycle } = require('../src/connection/lifecycle');
const tick = () => new Promise(resolve => setImmediate(resolve));
function socket() { const ev = new EventEmitter(); return { ev, ends: 0, end() { this.ends++; ev.emit('connection.update', { connection: 'close' }); } }; }
function closed(sock, code = 515) { sock.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: code } } } }); }
test('saved account without legacy registered flag suppresses re-pairing; provisional me alone does not', () => {
  assert.equal(hasSavedSession({ registered: true }), true);
  assert.equal(hasSavedSession({ me: { id: '5511999999999@s.whatsapp.net' }, account: { details: 'signed-account-fixture' } }), true);
  assert.equal(hasSavedSession({ me: { id: '5511999999999@s.whatsapp.net', name: '~' } }), false);
  assert.equal(hasSavedSession({}), false); assert.equal(hasSavedSession(null), false);
});
test('only incomplete provisional identity is reset; signed accounts and identity keys are preserved', () => {
  const keys = { public: Buffer.from('fixture-key') };
  const incomplete = { me: { id: '5511999999999@s.whatsapp.net', name: '~' }, pairingCode: 'old-code', signedIdentityKey: keys };
  assert.equal(resetIncompletePairing(incomplete), true); assert.equal(incomplete.me, undefined); assert.equal(incomplete.pairingCode, undefined);
  assert.equal(incomplete.signedIdentityKey, keys);
  const complete = { me: { id: '5511999999999@s.whatsapp.net' }, account: { details: 'signed fixture' }, signedIdentityKey: keys };
  assert.equal(resetIncompletePairing(complete), false); assert.ok(complete.me); assert.ok(complete.account);
});
test('credential writes are serialized and flush waits for the latest save', async () => {
  let release, active = 0, max = 0, saves = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const writer = credentialWriter(async () => { max = Math.max(max, ++active); if (++saves === 1) await gate; active--; });
  writer.write(); writer.write(); const flushed = writer.flush(); await tick(); assert.equal(saves, 1);
  release(); await flushed; assert.equal(saves, 3); assert.equal(max, 1);
});
test('credential failure blocks reconnect instead of silently discarding the session', async () => {
  const errors = [], fatal = []; let reconnected = 0;
  const life = createLifecycle({ reconnect: () => { reconnected++; }, wait: async () => {}, onError: (e, code) => errors.push(code), onFatal: code => fatal.push(code) });
  const sock = socket(); life.attach(sock, { saveCreds: async () => { throw Error('disk failed'); } }); closed(sock);
  await tick(); await tick(); assert.equal(reconnected, 0); assert.ok(errors.includes('SAVE_CREDS_FAILED')); assert.deepEqual(fatal, ['RECONNECT_FAILED']);
});
test('pair-success credentials arriving during pairing are saved before restart 515', async () => {
  let release, saved, restarts = 0; const gate = new Promise(resolve => { release = resolve; });
  const creds = {}, states = [];
  const life = createLifecycle({ wait: async () => {}, onState: state => states.push(state), reconnect: () => { restarts++; assert.equal(hasSavedSession(saved), true); } });
  const sock = socket(); life.attach(sock, { saveCreds: async () => { await gate; saved = structuredClone(creds); } });
  Object.assign(creds, { me: { id: '5511999999999@s.whatsapp.net' }, account: { details: 'signed fixture' } });
  sock.ev.emit('creds.update', creds); closed(sock); await tick(); assert.equal(restarts, 0);
  release(); await tick(); await tick(); assert.equal(restarts, 1); assert.equal(states[0].code, 515);
});
test('duplicate close events schedule only one reconnect and detach old application handlers', async () => {
  let restarts = 0; const life = createLifecycle({ reconnect: () => { restarts++; }, wait: async () => {} });
  const sock = socket(), session = life.attach(sock, { saveCreds: async () => {} });
  session.listen('messages.upsert', () => assert.fail('old handler'));
  closed(sock); closed(sock); await tick(); await tick();
  assert.equal(restarts, 1); assert.equal(sock.ev.listenerCount('messages.upsert'), 0); assert.equal(sock.ends, 1);
});
test('open runs readiness once only after credentials are safely saved', async () => {
  const events = [], life = createLifecycle({ reconnect: async () => {} }), sock = socket();
  life.attach(sock, { saveCreds: async () => events.push('saved'), onOpen: async () => events.push('ready') });
  assert.deepEqual(events, []); sock.ev.emit('connection.update', { connection: 'open' }); sock.ev.emit('connection.update', { connection: 'open' });
  await tick(); assert.deepEqual(events, ['saved', 'ready']);
});
test('logout never reconnects or deletes credentials', async () => {
  let saves = 0; const fatal = [], life = createLifecycle({ reconnect: () => assert.fail('logout reconnect'), onFatal: code => fatal.push(code) });
  const sock = socket(); life.attach(sock, { saveCreds: async () => { saves++; } }); closed(sock, 401); await tick();
  assert.equal(saves, 1); assert.deepEqual(fatal, ['LOGGED_OUT']);
});
test('MAX_RECONNECT=0 and repeated failures honor the configured limit', async () => {
  const fatal = [], notices = []; let life, restarts = 0;
  life = createLifecycle({ maxReconnect: 2, wait: async () => {}, onFatal: code => fatal.push(code), onState: s => notices.push(s), reconnect: async () => {
    restarts++; const next = socket(); life.attach(next, { saveCreds: async () => {} }); closed(next, 500);
  } });
  const first = socket(); life.attach(first, { saveCreds: async () => {} }); closed(first, 500);
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(restarts, 2); assert.deepEqual(notices.map(n => n.delay), [3000, 6000]); assert.deepEqual(fatal, ['RECONNECT_LIMIT']);
  const off = createLifecycle({ maxReconnect: 0, reconnect: () => assert.fail('reconnect disabled'), onFatal: code => fatal.push(code) });
  const s = socket(); off.attach(s, { saveCreds: async () => {} }); closed(s); await tick(); assert.equal(fatal.length, 2);
});
test('shutdown during reconnect delay prevents a new socket and preserves the pending save', async () => {
  let resume, saves = 0; const gate = new Promise(resolve => { resume = resolve; });
  const life = createLifecycle({ reconnect: () => assert.fail('reconnect after shutdown'), wait: () => gate });
  const sock = socket(); life.attach(sock, { saveCreds: async () => { saves++; } }); closed(sock); await tick();
  await life.stop(); resume(); await tick(); assert.ok(saves >= 1); assert.equal(sock.ev.listenerCount('connection.update'), 0);
});
test('reconnect waits for previous plugin initialization to finish before loading the next socket', async () => {
  let finish, restarts = 0; const barrier = new Promise(resolve => { finish = resolve; });
  const life = createLifecycle({ wait: async () => {}, reconnect: () => { restarts++; } });
  const sock = socket(); life.attach(sock, { saveCreds: async () => {}, beforeReconnect: () => barrier });
  closed(sock); await tick(); assert.equal(restarts, 0);
  finish(); await tick(); await tick(); assert.equal(restarts, 1);
});
