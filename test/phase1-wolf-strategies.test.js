'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runMigrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const context = require('../src/isolation/context');
const { createStrategies, formationName, LIMIT } = require('../src/wolves/strategies');
const { createHandlers, register } = require('../src/commands/wolf-strategies');
const { calculateBattle } = require('../src/utils/helpers');

const CHAT = '120600000001@g.us', OTHER = '120600000002@g.us';
const USER = '5511999912345@s.whatsapp.net', SECOND = '5511999954321@s.whatsapp.net';
const LID = '123456789012345@lid';

function apiFor(raw) {
  const db = createScopedDatabase(raw);
  return {
    db,
    getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    getStrategy: jid => db.prepare('SELECT * FROM wolf_strategy WHERE jid=?').get(jid),
    upsertStrategy: (jid, a, d, c) => db.prepare('INSERT INTO wolf_strategy(jid,attack,defense,counter) VALUES (?,?,?,?) ON CONFLICT(jid) DO UPDATE SET attack=excluded.attack,defense=excluded.defense,counter=excluded.counter').run(jid, a, d, c),
  };
}

function fixture(t, filename = ':memory:') {
  const raw = new Database(filename);
  runMigrations(raw);
  t.after(() => { if (raw.open) raw.close(); });
  const api = apiFor(raw), service = createStrategies(api, { now: () => 1800000000000 });
  function enroll(chat = CHAT, user = USER) {
    context.run(chat, () => {
      api.db.prepare('INSERT INTO users(jid,name,gold,xp) VALUES (?,?,?,?)').run(user, 'Lobo', 1200, 100);
      api.upsertStrategy(user, 40, 35, 25);
      api.db.prepare('UPDATE wolf_strategy SET wolves_alive=70,total_attacks=5,total_victories=3 WHERE jid=?').run(user);
    });
  }
  enroll();
  return { raw, api, service, enroll, strategy: (chat = CHAT, user = USER) => context.run(chat, () => api.getStrategy(user)) };
}

test('saved formations are additive, uniquely named, persistent and scoped to player and chat', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-strategies-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'game.sqlite');
  const f = fixture(t, file);
  const before = f.strategy();
  f.service.save(CHAT, USER, 'Lua Ágil', 'save-one');
  assert.deepEqual(f.strategy(), before);
  assert.throws(() => f.service.save(CHAT, USER, 'LUA AGIL', 'same-name'), /Já existe/);
  assert.equal(f.service.list(OTHER, USER).length, 0);
  assert.equal(f.service.list(CHAT, SECOND).length, 0);
  assert.equal(f.service.list(CHAT, USER)[0].name, 'Lua Ágil');
  f.raw.close();
  const reopened = new Database(file); t.after(() => reopened.close());
  runMigrations(reopened);
  const service = createStrategies(apiFor(reopened));
  assert.equal(service.list(CHAT, USER)[0].name, 'Lua Ágil');
  assert.equal(service.list(CHAT, USER)[0].attack, 40);
});

test('using a saved formation preserves living wolves, money, XP and combat statistics', t => {
  const f = fixture(t);
  f.service.save(CHAT, USER, 'Ataque lunar', 'save');
  context.run(CHAT, () => f.api.upsertStrategy(USER, 10, 60, 30));
  const before = f.strategy(), userBefore = context.run(CHAT, () => f.api.getUser(USER));
  f.service.use(CHAT, USER, 'ataque lunar', 'use');
  const after = f.strategy();
  assert.deepEqual([after.attack, after.defense, after.counter], [40, 35, 25]);
  for (const key of ['wolves_alive', 'total_attacks', 'total_victories']) assert.equal(after[key], before[key]);
  assert.deepEqual(context.run(CHAT, () => f.api.getUser(USER)), userBefore);
});

test('save, use and delete each deduplicate message IDs without applying a changed operation', t => {
  const f = fixture(t);
  f.service.save(CHAT, USER, 'Lua', 'same-save');
  assert.equal(f.service.save(CHAT, USER, 'Lua', 'same-save').duplicate, true);
  assert.throws(() => f.service.save(CHAT, USER, 'Outra', 'same-save'), /já foi processada/);
  f.service.use(CHAT, USER, 'Lua', 'same-use');
  context.run(CHAT, () => f.api.upsertStrategy(USER, 20, 40, 40));
  assert.equal(f.service.use(CHAT, USER, 'Lua', 'same-use').duplicate, true);
  assert.equal(f.strategy().attack, 20, 'A replay must not re-equip a previous formation');
  f.service.remove(CHAT, USER, 'Lua', 'same-remove');
  assert.equal(f.service.remove(CHAT, USER, 'Lua', 'same-remove').duplicate, true);
  assert.equal(f.service.list(CHAT, USER).length, 0);
  assert.equal(f.raw.prepare('SELECT count(*) count FROM wolf_strategy_operations').get().count, 3);
});

test('formation validation, storage limit and separate owners prevent shared or invalid formations', t => {
  const f = fixture(t); f.enroll(CHAT, SECOND); f.enroll(OTHER, USER);
  for (const name of ['', '*name*', 'line\nbreak', 'x'.repeat(33), '<script>']) assert.throws(() => formationName(name));
  assert.throws(() => f.service.save(CHAT, USER, 'Valid', ''), /identificador/);
  for (let index = 0; index < LIMIT; index++) f.service.save(CHAT, USER, 'Formação ' + index, 'save-' + index);
  assert.throws(() => f.service.save(CHAT, USER, 'Excesso', 'overflow'), /até 20/);
  f.service.save(CHAT, SECOND, 'Formação 0', 'second-user');
  f.service.save(OTHER, USER, 'Formação 0', 'other-chat');
  assert.equal(f.service.list(CHAT, SECOND).length, 1);
  assert.equal(f.service.list(OTHER, USER).length, 1);
  assert.throws(() => f.service.use(CHAT, SECOND, 'Formação 1', 'cross-owner'), /não encontrada/);
  assert.equal(f.raw.prepare("SELECT count(*) count FROM wolf_strategy_operations WHERE event_id IN ('overflow','cross-owner')").get().count, 0);
});

test('unconfirmed LID cannot mutate; trusted PN/LID wallet mapping uses the same saved formations', t => {
  const f = fixture(t);
  assert.throws(() => f.service.save(CHAT, LID, 'Não confirmado', 'unconfirmed'), /confirmar seu número/);
  assert.equal(f.raw.prepare('SELECT count(*) count FROM saved_wolf_strategies').get().count, 0);
  f.raw.prepare('INSERT INTO universal_wallet_aliases VALUES (?,?,?)').run(CHAT, LID, USER);
  f.service.save(CHAT, LID, 'Confirmada', 'confirmed');
  assert.equal(f.service.list(CHAT, USER)[0].name, 'Confirmada');
  assert.equal(f.service.list(CHAT, LID)[0].name, 'Confirmada');
  assert.throws(() => f.service.save(OTHER, LID, 'Não vinculado', 'other-unconfirmed'), /confirmar seu número/);
});

test('late database failures roll back saved formation, equipment change and idempotency together', t => {
  const f = fixture(t), before = f.strategy();
  f.raw.exec("CREATE TRIGGER fail_wolf_event BEFORE INSERT ON wolf_strategy_operations BEGIN SELECT RAISE(ABORT,'offline failure'); END");
  assert.throws(() => f.service.save(CHAT, USER, 'Falha', 'failed'), /offline failure/);
  assert.equal(f.service.list(CHAT, USER).length, 0);
  assert.equal(f.raw.prepare('SELECT count(*) count FROM wolf_strategy_operations').get().count, 0);
  f.raw.exec('DROP TRIGGER fail_wolf_event');
  f.service.save(CHAT, USER, 'Lua', 'save');
  context.run(CHAT, () => f.api.upsertStrategy(USER, 20, 50, 30));
  f.raw.exec("CREATE TRIGGER fail_wolf_event BEFORE INSERT ON wolf_strategy_operations BEGIN SELECT RAISE(ABORT,'offline failure'); END");
  assert.throws(() => f.service.use(CHAT, USER, 'Lua', 'failed-use'), /offline failure/);
  assert.equal(f.strategy().attack, 20);
  assert.equal(f.strategy().wolves_alive, before.wolves_alive);
  assert.equal(f.raw.prepare("SELECT count(*) count FROM wolf_strategy_operations WHERE event_id='failed-use'").get().count, 0);
});

test('simulator calls the real formula using only synthetic or own saved targets and changes no persisted state', t => {
  const f = fixture(t); f.service.save(CHAT, USER, 'Espelho', 'save');
  const snapshot = () => JSON.stringify(f.raw.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => [row.name, f.raw.prepare('SELECT * FROM "' + row.name + '"').all()]));
  const before = snapshot();
  t.mock.method(Math, 'random', () => 0.25);
  const value = f.service.simulate(CHAT, USER, { attack: 20, defense: 50, counter: 30 });
  assert.deepEqual(value.result, calculateBattle({ strategy: f.strategy(), wolves: 70 }, { strategy: { attack: 20, defense: 50, counter: 30 }, wolves: 100 }));
  assert.equal(value.metrics.offense, 47.5);
  assert.equal(value.metrics.resistance, 47.5);
  assert.equal(f.service.simulate(CHAT, USER, 'Espelho').target.strategy.attack, 40);
  assert.equal(f.service.simulate(CHAT, USER).target.strategy.attack, 34);
  assert.equal(snapshot(), before);
  assert.throws(() => f.service.simulate(CHAT, USER, { attack: 99, defense: 99, counter: 99 }), /soma/);
  assert.throws(() => f.service.simulate(CHAT, USER, { attack: -1, defense: 50, counter: 51 }), /negativos/);
  assert.throws(() => f.service.simulate(CHAT, USER, SECOND), /nome/);
});

test('battle history shows only the actor in the requested chat, with ordering and pagination', t => {
  const f = fixture(t);
  const add = (attacker, defender, group) => context.run(CHAT, () => f.api.db.prepare('INSERT INTO battle_log(attacker,defender,attacker_wolves_before,defender_wolves_before,attacker_wolves_after,defender_wolves_after,result,group_id) VALUES (?,?,100,100,90,80,?,?)').run(attacker, defender, 'attacker', group));
  for (let index = 0; index < 6; index++) add(USER, SECOND, CHAT);
  add(SECOND, '5511888812345@s.whatsapp.net', CHAT); add(USER, SECOND, OTHER);
  const first = f.service.history(CHAT, USER), second = f.service.history(CHAT, USER, 2);
  assert.equal(first.total, 6); assert.equal(first.rows.length, 5); assert.equal(second.rows.length, 1);
  assert.equal(first.pages, 2); assert.equal(first.rows[0].outcome, 'Vitória'); assert.equal(first.rows[0].id, 6);
  assert.equal(first.rows[0].attack, undefined); assert.equal(first.rows[0].defender, undefined);
  assert.throws(() => f.service.history(CHAT, USER, -1), /página/);
});

test('command extension keeps legacy aliases, legacy arguments and actual saved-strategy routes', async t => {
  const f = fixture(t), sent = [], ctx = { jid: CHAT, sender: USER, args: [], msg: { key: { id: 'cmd-save' } } };
  let legacy = 0;
  const handlers = createHandlers({ api: f.api, prefix: () => '$$' });
  const wrapped = handlers.strategy(async () => { legacy++; });
  const sock = { sendMessage: async (_jid, payload) => sent.push(payload.text) };
  await wrapped(sock, ctx); await wrapped(sock, { ...ctx, args: ['40', '35', '25'] });
  assert.equal(legacy, 2);
  await wrapped(sock, { ...ctx, args: ['salvar', 'Lua'] });
  assert.equal(f.service.list(CHAT, USER).length, 1);
  await wrapped(sock, { ...ctx, args: ['listar'] }); assert.match(sent.at(-1), /Lua/);
  await handlers.simulate(sock, { ...ctx, args: [SECOND] }); assert.match(sent.at(-1), /nome/);
  await handlers.simulate(sock, { ...ctx, args: ['@Outro'] }); assert.match(sent.at(-1), /não consulta adversários/);
  const registry = new Map([['estrategia', { name: 'estrategia', aliases: ['strategy'], handler: wrapped, category: 'lobo' }]]), registered = [];
  register(def => registered.push(def), registry);
  assert.deepEqual(registered[0].aliases, ['strategy']); assert.equal(registered[0].replace, true);
  assert.deepEqual(registered.slice(1).map(row => row.name), ['simularbatalha', 'taticas', 'historicolobos']);
});
