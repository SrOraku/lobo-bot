'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createManager } = require('../src/activations/manager');
function fixture() {
  let policy = { features: { xp: false, level: true, antilink: true }, options: {} };
  return createManager({ get: () => structuredClone(policy), update: (_jid, _actor, fn) => { const next = fn(structuredClone(policy)); policy = next; return next; } });
}
test('diagnostic identifies missing dependency and bot admin without altering state', () => {
  const manager = fixture();
  const rows = manager.diagnostics('123@g.us');
  assert.ok(rows.find(f => f.id === 'level').issues.includes('DEPENDENCIA:xp'));
  assert.ok(rows.find(f => f.id === 'antilink').issues.includes('BOT_NAO_ADMIN'));
  assert.equal(manager.isEnabled('123@g.us', 'level'), true);
});
test('invalid state and unknown options are refused before persistence', async () => {
  const manager = fixture();
  await assert.rejects(manager.set('123@g.us', ['xp'], 'false', { actor: { admin: true } }), /Estado/);
  await assert.rejects(manager.set('123@g.us', ['xp'], false, { actor: { admin: true }, options: { forged: true } }), /desconhecida/);
});
