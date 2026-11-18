'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createPolicyStore } = require('../src/activations/store');
const { createInteraction } = require('../src/activations/interaction');
const { createActivationHandler } = require('../src/commands/activations');
const registry = require('../src/activations/registry');
const features = registry.list().filter(item => item.source !== 'sector');
const number = id => String(features.findIndex(item => item.id === id) + 1);

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const store = createPolicyStore(db), calls = [], visible = new Map();
  const actor = { admin: true, botAdmin: true, phone: '5511999999999@s.whatsapp.net', groupName: 'Matilha' };
  const state = { clock: 100, failEdits: false, forgedKey: false };
  const ui = createInteraction({ store, now: () => state.clock, resolveActor: async () => ({ ...actor }) });
  const handler = createActivationHandler({ store, interaction: ui, resolveActor: async () => ({ ...actor }) });
  let sequence = 0, incoming = 0;
  const ctx = (id = 'incoming-' + ++incoming, overrides = {}) => ({
    jid: '123@g.us', sender: actor.phone, args: [],
    msg: { key: { id, remoteJid: '123@g.us', participant: actor.phone } }, ...overrides,
  });
  const sock = { sendMessage: async (jid, payload) => {
    calls.push({ jid, payload });
    if (payload.edit && state.failEdits) throw Error('Edit rejected');
    const key = payload.edit || { id: 'bot-' + ++sequence, remoteJid: jid, fromMe: true };
    visible.set(key.id, payload.text);
    return { key: state.forgedKey ? { id: 'incoming-forged', remoteJid: '999@g.us', fromMe: false } : key };
  } };
  return { db, store, actor, state, ui, calls, visible, sock, ctx,
    open: () => handler(sock, ctx()),
    answer: (input, id, overrides) => ui.handle(sock, ctx(id, overrides), input),
    latest: () => calls.at(-1).payload.text,
  };
}

test('confirm/cancel restores the same complete panel and accepts the next feature without reopening', async t => {
  const f = fixture(t); await f.open();
  const original = [...f.visible.keys()][0];
  await f.answer(number('antilink')); assert.match(f.latest(), /SIM/);
  assert.equal(f.calls.at(-1).payload.edit.id, original);
  await f.answer('1', 'confirm-link');
  assert.equal(f.store.get('123@g.us').features.antilink, true);
  assert.match(f.latest(), /PAINEL DE ATIVAÇÕES/);
  assert.match(f.latest(), /Ativado/);
  assert.equal(f.calls.at(-1).payload.edit.id, original);
  for (const item of features) assert.ok(f.latest().includes('*' + item.name + ':*'), item.id);
  const count = f.calls.length;
  await f.answer('1', 'confirm-link'); assert.equal(f.calls.length, count);

  await f.answer(number('antispam'), 'choose-spam');
  await f.answer('1', 'confirm-link'); // Old confirmation cannot toggle the new proposal.
  assert.equal(f.store.get('123@g.us').features.antispam, false);
  await f.answer('2', 'cancel-spam');
  assert.match(f.latest(), /Cancelado/);
  assert.match(f.latest(), /PAINEL DE ATIVAÇÕES/);
  await f.answer(number('antispam')); await f.answer('1');
  assert.equal(f.store.get('123@g.us').features.antispam, true);
  assert.equal(f.visible.size, 1, 'All interactions reuse the original bot panel');
  assert.equal(f.store.get('456@g.us').features.antispam, false);
});

test('failed edits send a replacement panel and preserve a usable session', async t => {
  const f = fixture(t); await f.open(); f.state.failEdits = true;
  await f.answer(number('antilink')); await f.answer('1');
  assert.equal(f.store.get('123@g.us').features.antilink, true);
  assert.equal(f.calls.at(-1).payload.edit, undefined);
  assert.match(f.latest(), /PAINEL DE ATIVAÇÕES/);
  const replacement = [...f.visible.keys()].at(-1);
  f.state.failEdits = false;
  await f.answer(number('antispam')); await f.answer('1');
  assert.equal(f.store.get('123@g.us').features.antispam, true);
  assert.equal(f.calls.at(-1).payload.edit.id, replacement);
});

test('permissions, actor/group binding and expiration remain enforced after refresh', async t => {
  const f = fixture(t); await f.open();
  assert.equal(await f.answer('1', undefined, { sender: 'other' }), false);
  assert.equal(await f.answer('1', undefined, { jid: '456@g.us' }), false);
  await f.answer(number('antilink')); f.actor.admin = false;
  await f.answer('1');
  assert.equal(f.store.get('123@g.us').features.antilink, false);
  assert.match(f.latest(), /Somente administradores/);
  assert.equal(await f.answer('1'), false);
  f.actor.admin = true; await f.open();
  await f.answer(number('antilink')); await f.answer('2');
  f.state.clock += 120001;
  await f.answer(number('antilink'));
  assert.match(f.latest(), /expirada/);
  assert.equal(await f.answer('1'), false);
});

test('stale proposals refresh current state and inactivity days return to the panel', async t => {
  const f = fixture(t); await f.open();
  await f.answer(number('antilink'));
  f.store.update('123@g.us', 'other-admin', policy => { policy.features.antilink = true; return policy; });
  await f.answer('1');
  assert.match(f.latest(), /Outro administrador/);
  assert.match(f.latest(), /PAINEL DE ATIVAÇÕES/);
  await f.answer(number('antiinatividade')); await f.answer('1');
  assert.match(f.latest().replace(/[`*_]/g, ''), /1 a 90/);
  await f.answer('15');
  assert.equal(f.store.get('123@g.us').features.antiinatividade, true);
  assert.equal(f.store.get('123@g.us').options.inactivity_days, 15);
  assert.match(f.latest(), /PAINEL DE ATIVAÇÕES/);
  assert.match(f.latest(), /ninguém foi removido agora/);
  await f.answer(number('antispam')); await f.answer('1');
  assert.equal(f.store.get('123@g.us').features.antispam, true);
});

test('untrusted transport keys are never used as edit targets', async t => {
  const f = fixture(t); f.state.forgedKey = true; await f.open();
  // Public attachment cannot redirect an edit to another group or user message.
  f.ui.attachPanel(f.ctx(), { id: 'other-group', fromMe: true, remoteJid: '456@g.us' });
  f.ui.attachPanel(f.ctx(), { id: 'user-message', fromMe: false, remoteJid: '123@g.us' });
  await f.answer(number('antilink')); await f.answer('2');
  assert.ok(f.calls.every(item => !item.payload.edit));
  assert.match(f.latest(), /PAINEL DE ATIVAÇÕES/);
});

test('configuration read failures remain visible as pending instead of breaking the panel', async t => {
  const f = fixture(t);
  t.mock.method(require('../src/integrations/bronxys/key'), 'getKey', () => { throw Error('BRONXYS_KEY_STORAGE'); });
  f.store.update('123@g.us', 'fixture', policy => { policy.features.autodownload = true; return policy; });
  await f.open();
  assert.match(f.latest(), /Download automático de redes sociais:\* `〔 🔴 〕` ⚠️ pendente/);
  await f.answer(number('antispam')); await f.answer('1');
  assert.equal(f.store.get('123@g.us').features.antispam, true);
  assert.match(f.latest(), /PAINEL DE ATIVAÇÕES/);
});
