'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createPolicyStore } = require('../src/activations/store');
const { createInteraction } = require('../src/activations/interaction');
const { createActivationHandler } = require('../src/commands/activations');

test('painel numerado mantém seleção por nome e preserva 1 SIM e 2 NÃO', async t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const store = createPolicyStore(db), actor = { admin: true, botAdmin: true, phone: '5511999999999@s.whatsapp.net', groupName: 'Matilha' };
  const ui = createInteraction({ store, resolveActor: async () => actor });
  const handler = createActivationHandler({ store, interaction: ui, resolveActor: async () => actor });
  const messages = [], sock = { sendMessage: async (_, content) => messages.push(content.text) };
  const ctx = { jid: '120000@g.us', sender: actor.phone, msg: { key: { id: 'menu' } }, args: [] };
  await handler(sock, ctx);
  const panel = messages.at(-1);
  assert.ok(panel.includes('Proteção:') && panel.includes('%'));
  assert.ok(panel.includes('`〔 🔴 〕`') && panel.includes('`〔 🟢 〕`'));
  assert.ok(!/〔\s*(?:[0-9]|ON|OFF)/u.test(panel));
  const features = require('../src/activations/registry').list().filter(item => item.source !== 'sector');
  for (const [index, feature] of features.entries()) assert.ok(panel.includes('`' + (index + 1) + '` 🛡️ *' + feature.name + ':*'), feature.id);
  ctx.args = ['anti-link']; ctx.msg.key.id = 'select'; await handler(sock, ctx);
  assert.ok(messages.at(-1).includes('`1`') && messages.at(-1).includes('`2`'));
  assert.equal(store.get(ctx.jid).features.antilink, false);
  ctx.msg.key.id = 'cancel'; await ui.handle(sock, ctx, '2');
  assert.equal(store.get(ctx.jid).features.antilink, false);
  ctx.msg.key.id = 'select-again'; await handler(sock, ctx);
  ctx.msg.key.id = 'confirm'; await ui.handle(sock, ctx, '1');
  assert.equal(store.get(ctx.jid).features.antilink, true);
  ctx.msg.key.id = 'disable-proposal'; await handler(sock, ctx);
  ctx.msg.key.id = 'cancel-disable'; await ui.handle(sock, ctx, '2');
  assert.equal(store.get(ctx.jid).features.antilink, true);
  assert.equal(store.get('130000@g.us').features.antilink, false);
  store.update(ctx.jid, 'fixture', policy => { policy.features.antipromote = true; return policy; });
  actor.botAdmin = false; ctx.args = []; ctx.msg.key.id = 'limited-panel';
  const before = structuredClone(store.get(ctx.jid)); await handler(sock, ctx);
  assert.ok(messages.at(-1).includes('*Anti-Promote:* `〔 🔴 〕` ⚠️ pendente'));
  assert.deepEqual(store.get(ctx.jid), before);
});

test('atalhos explícitos aceitam 2 como NÃO sem retirar 0/off legados', async t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const store = createPolicyStore(db), actor = { admin: true, botAdmin: true, phone: 'admin' };
  const handler = createActivationHandler({ store, resolveActor: async () => actor, featureId: 'antilink' });
  const sock = { sendMessage: async () => {} }, ctx = { jid: '120000@g.us', msg: {}, args: ['1'] };
  for (const off of ['2', '0', 'off']) {
    ctx.args = ['1']; await handler(sock, ctx); assert.equal(store.get(ctx.jid).features.antilink, true);
    ctx.args = [off]; await handler(sock, ctx); assert.equal(store.get(ctx.jid).features.antilink, false);
  }
});

test('seleção numérica confirma, cancela, isola grupos e revalida permissões', async t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const store = createPolicyStore(db); let clock = 100, admin = true, botAdmin = true, event = 0;
  const ui = createInteraction({ store, now: () => clock, resolveActor: async () => ({ admin, botAdmin, phone: '5511999999999@s.whatsapp.net' }) });
  const sent = [], sock = { sendMessage: async (_, c) => sent.push(c.text) };
  const ctx = { jid: '120000@g.us', sender: '5511999999999@s.whatsapp.net', msg: { key: { id: 'open' } } };
  const reply = value => { ctx.msg = { key: { id: String(++event) } }; return ui.handle(sock, ctx, value); };
  ui.open(ctx); await reply('1'); assert.equal(store.get(ctx.jid).features.antilink, false);
  await reply('2'); assert.equal(store.get(ctx.jid).features.antilink, false);
  ui.open(ctx); await reply('1'); await reply('1'); assert.equal(store.get(ctx.jid).features.antilink, true);
  assert.equal(store.get('130000@g.us').features.antilink, false);
  ui.open(ctx); await reply('1'); admin = false; await reply('1'); assert.equal(store.get(ctx.jid).features.antilink, true);
  admin = true; ui.open(ctx); clock += 120001; await reply('1'); assert.ok(sent.at(-1).includes('expirada'));
  assert.equal(await reply('1'), false);
  ui.open(ctx); assert.equal(await ui.handle(sock, { ...ctx, sender: 'other' }, '1'), false);
  assert.equal(await ui.handle(sock, { ...ctx, jid: '130000@g.us' }, '1'), false);
});
test('número inválido, mensagem repetida e falta de admin do bot não alteram estado', async t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const store = createPolicyStore(db);
  const ui = createInteraction({ store, resolveActor: async () => ({ admin: true, botAdmin: false, phone: 'admin' }) });
  const sent = [], sock = { sendMessage: async (_, c) => sent.push(c.text) };
  const ctx = { jid: '120000@g.us', sender: 'user', msg: { key: { id: 'open' } } };
  ui.open(ctx); ctx.msg.key.id = 'bad'; await ui.handle(sock, ctx, '999');
  assert.ok(sent.at(-1).includes('inválido'));
  ctx.msg.key.id = 'choice'; await ui.handle(sock, ctx, '1');
  await ui.handle(sock, ctx, '1'); assert.equal(store.get(ctx.jid).features.antilink, false);
  ctx.msg.key.id = 'confirm'; await ui.handle(sock, ctx, '1');
  assert.equal(store.get(ctx.jid).features.antilink, false);
  assert.ok(sent.at(-1).includes('administrador'));
});

test('inatividade solicita dias após confirmar, aceita 1 e 90 e rejeita 0 e 91', async t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const store = createPolicyStore(db);
  const ui = createInteraction({ store, resolveActor: async () => ({ admin: true, botAdmin: true, phone: 'admin' }) });
  const ctx = { jid: '120000@g.us', sender: 'user', msg: { key: { id: 'open' } } };
  db.prepare('INSERT INTO groups(jid) VALUES (?)').run(ctx.jid);
  const messages = [], sock = { sendMessage: async (_, c) => messages.push(c.text) };
  let event = 0;
  const send = input => { ctx.msg = { key: { id: String(++event) } }; return ui.handle(sock, ctx, input); };
  const number = require('../src/activations/registry').list().findIndex(f => f.id === 'antiinatividade') + 1;
  ui.open(ctx); await send(String(number)); await send('1');
  assert.ok(messages.at(-1).replace(/[`*_]/g, '').includes('1 a 90'));
  assert.equal(store.get(ctx.jid).features.antiinatividade, false);
  for (const value of ['0', '91', '999999999999999999999']) {
    await send(value); assert.equal(store.get(ctx.jid).features.antiinatividade, false);
  }
  await send('1');
  assert.equal(store.get(ctx.jid).features.antiinatividade, true);
  assert.equal(store.get(ctx.jid).options.inactivity_days, 1);
  assert.equal(db.prepare('SELECT inactivity_days FROM groups WHERE jid=?').get(ctx.jid).inactivity_days, 1);
  ui.requestDays(ctx, true); await send('90');
  assert.equal(createPolicyStore(db).get(ctx.jid).options.inactivity_days, 90);
  assert.equal(store.get('130000@g.us').options.inactivity_days, 7);
  assert.ok(messages.at(-1).includes('ninguém foi removido agora'));
});

test('prazo não é salvo depois de perder permissão ou quando a seleção expira', async t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  const store = createPolicyStore(db); let admin = true, clock = 0;
  const ui = createInteraction({ store, now: () => clock, resolveActor: async () => ({ admin, botAdmin: true, phone: 'admin' }) });
  const ctx = { jid: '120000@g.us', sender: 'user', msg: { key: { id: 'open' } } };
  const sock = { sendMessage: async () => {} };
  ui.requestDays(ctx); admin = false; ctx.msg.key.id = 'days'; await ui.handle(sock, ctx, '30');
  assert.equal(store.get(ctx.jid).features.antiinatividade, false);
  admin = true; ui.requestDays(ctx); clock = 120001; ctx.msg.key.id = 'expired'; await ui.handle(sock, ctx, '30');
  assert.equal(store.get(ctx.jid).options.inactivity_days, 7);
});
