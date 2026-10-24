'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { change, defaults, allowed, commandSector } = require('../src/activations/policy');
const owner = { owner: true, admin: false },
  admin = { owner: false, admin: true },
  member = { owner: false, admin: false };
test('setores iniciam liberados sem alterar permissões de moderação/dono', () => {
  const p = defaults();
  assert.ok(allowed(p, 'jogos', member));
  assert.ok(!allowed(p, 'adm', member));
  assert.ok(allowed(p, 'adm', admin));
  assert.ok(!allowed(p, 'dono', admin));
});
test('setores são informativos e ninguém pode desativá-los', () => {
  for (const actor of [owner, admin, member])
    for (const action of ['set', 'delegar'])
      assert.throws(() => change(defaults(), {action,target:'jogos',value:'off',...actor}), /informativos/);
});
test('admin não delega, não pausa o bot, não libera dono ou ADM para membros', () => {
  const p = defaults();
  for (const request of [
    { action: 'delegar', target: 'rp', value: 'on' },
    { action: 'set', target: 'bot', value: 'off' },
    { action: 'set', target: 'dono', value: 'membros' },
  ])
    assert.throws(() => change(p, { ...request, ...admin }));
  assert.throws(() => change(p, { action: 'set', target: 'adm', value: 'membros', ...owner }));
});
test('pausa e retomada do bot continuam exclusivas do dono', () => {
  const paused = change(defaults(), {action:'set',target:'bot',value:'off',...owner});
  assert.ok(!allowed(paused,'jogos',member));
  const active = change(paused, {action:'set',target:'bot',value:'on',...owner});
  assert.ok(allowed(active,'jogos',member));
});
test('setores inválidos e entradas malformadas não alteram estado', () => {
  const p = defaults();
  for (const target of ['__proto__', 'unknown', '../rp'])
    assert.throws(() => change(p, { action: 'set', target, value: 'on', ...owner }));
  assert.deepEqual(p, defaults());
});
test('aliases e namespaces não contornam restrições de setores', () => {
  assert.equal(commandSector('ytmp3', [], { name: 'ytmp3' }), 'midia');
  assert.equal(commandSector('alcateia', ['treino']), 'alcateia');
  assert.equal(commandSector('alcateia', ['rp', 'iniciar']), 'rp');
  assert.equal(commandSector('alcateia', ['admin', 'status']), 'dono');
  assert.equal(commandSector('menu', ['dono']), null);
  assert.equal(commandSector('ativacoes'), null);
});
test('persistência SQLite, isolamento entre grupos e transação sem sobrescrita', () => {
  const Database = require('better-sqlite3');
  const { runMigrations } = require('../src/config/migrations');
  const { createPolicyStore } = require('../src/activations/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'activation-db-')),
    file = path.join(dir, 'test.db');
  let db;
  try {
    db = new Database(file);
    runMigrations(db);
    let store = createPolicyStore(db);
    store.update('one@g.us', 'owner', (p) =>
      ({...p,features:{...p.features,antilink:true}}),
    );
    store.update('one@g.us', 'owner', (p) =>
      ({...p,features:{...p.features,bemvindo:false}}),
    );
    assert.equal(store.get('one@g.us').features.antilink, true);
    assert.deepEqual(store.get('two@g.us').sectors, defaults().sectors);
    assert.throws(() =>
      store.update('one@g.us', 'member', () => {
        throw Error('rollback');
      }),
    );
    db.close();
    db = new Database(file);
    store = createPolicyStore(db);
    assert.equal(store.get('one@g.us').features.bemvindo, false);
    assert.equal(store.get('one@g.us').features.antilink, true);
  } finally {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('gate bloqueia membros, preserva manutenção do dono e não afeta privado', async () => {
  const { createGate } = require('../src/activations/gate');
  const p = change(defaults(), { action: 'set', target: 'bot', value: 'off', ...owner });
  const sent = [];
  const sock = { sendMessage: async (j, c) => sent.push(c.text) };
  const gate = createGate({ store: { get: () => p }, resolveActor: async () => member });
  assert.equal(
    await gate(sock, { jid: 'group@g.us', msg: {}, args: [] }, 'ytmp3', { name: 'ytmp3' }),
    false,
  );
  assert.equal(await gate(sock, { jid: 'p@s.whatsapp.net' }, 'ytmp3', { name: 'ytmp3' }), true);
  const ownGate = createGate({ store: { get: () => p }, resolveActor: async () => owner });
  assert.ok(
    await ownGate(sock, { jid: 'group@g.us', msg: {}, args: [] }, 'ytmp3', { name: 'ytmp3' }),
  );
  assert.equal(sent.length, 1);
});
test('painel valida cargo, não aceita flags forjadas e responde no privado', async () => {
  const { createActivationHandler } = require('../src/commands/activations');
  let writes = 0;
  const sent = [];
  const sock = { sendMessage: async (j, c) => sent.push(c.text) };
  const handler = createActivationHandler({
    store: { get: defaults, update: () => writes++ },
    resolveActor: async () => member,
  });
  await handler(sock, { jid: 'g@g.us', args: ['bot', 'off'], isOwner: true, senderLevel: 3 });
  assert.equal(writes, 0);
  assert.match(sent.at(-1), /Somente/);
  await handler(sock, { jid: 'p@s.whatsapp.net', args: [] });
  assert.match(sent.at(-1), /dentro do grupo/);
});
test('dono é confirmado por identidade PN/LID e não pelo número logado', async () => {
  const { resolveActor } = require('../src/activations/access');
  const sock = {
    user: { id: '5511888888888@s.whatsapp.net' },
    groupMetadata: async () => ({ participants: [] }),
  };
  const ctx = (sender) => ({ msg: { key: { remoteJid: '12099988@g.us', participant: sender } } });
  assert.equal((await resolveActor(sock, ctx('5543920030769@s.whatsapp.net'))).owner, true);
  assert.equal((await resolveActor(sock, ctx('5543920030769@lid'))).owner, false);
  assert.equal((await resolveActor(sock, ctx(sock.user.id))).owner, false);
});

test('donos adicionais precisam estar configurados explicitamente', () => {
  const { ownerNumbers } = require('../src/utils/owners');
  assert.deepEqual(
    ownerNumbers({
      BOT_OWNER: '5543920030769',
      BOT_OWNERS: '+5511999999999, 5511888888888; owner@lid',
    }),
    ['5543920030769', '5511999999999', '5511888888888'],
  );
});
test('conta logada só executa comandos próprios se for dona, sem loop de respostas', async () => {
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(__dirname, '../src/handlers/message.js'), 'utf8');
  const loaded = { exports: {} },
    commands = [];
  const helper = {
    PREFIX: '!',
    BOT_NAME: 'bot',
    cleanJid: (j) => j.replace(/:\d+@/, '@'),
    getNumber: (j) => j.split('@')[0],
    logger: { error: () => {} },
  };
  vm.runInNewContext(code, {
    module: loaded,
    require(id) {
      if (id === '../automation/anti-pv') return {createAntiPV:()=>({handle:async()=>false})};
      if (id === '../services/universal-currency') return {linkMessageWallet:async()=>{}};
      if (id === 'dotenv') return { config: () => {} };
      if (id === '../utils/helpers') return helper;
      if (id === '../isolation/context') return {run:(chat,fn)=>fn()};
      if (id === '../utils/owners') return { ownerNumbers: () => ['5543920030769'] };
      if (id === '../utils/database') return { upsertUser: () => {}, getUser: () => ({}) };
      if (id === '../core/eventBus') return { bus: { emit: () => {} }, EVENTS: {} };
      if (id === '../core/commandRegistry')
        return { execute: async (name, sock, ctx) => commands.push([name, ctx.sender]) };
      return {};
    },
  });
  const make = (body) => ({
    key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true },
    message: { conversation: body },
  });
  await loaded.exports.handleMessage(
    { user: { id: '5543920030769:1@s.whatsapp.net' } },
    make('resposta normal'),
  );
  assert.equal(commands.length, 0);
  await loaded.exports.handleMessage(
    { user: { id: '5511888888888@s.whatsapp.net' } },
    make('!ativacoes'),
  );
  assert.equal(commands.length, 0);
  await loaded.exports.handleMessage(
    { user: { id: '5543920030769:1@s.whatsapp.net' } },
    make('!menu'),
  );
  assert.deepEqual(commands, [['menu', '5543920030769@s.whatsapp.net']]);
});
