'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const context = require('../src/isolation/context');
const model = require('../src/forest/model');
const { createForest, rain, DAILY_COIN_CAP, CHRONICLE_LIMIT } = require('../src/forest/service');
const { createForestHandlers, register, duration } = require('../src/commands/forest');

const HOUR = model.HOUR;
const CHAT = '120363000000000001@g.us', OTHER_CHAT = '120363000000000002@g.us';
const USER = '5511999912345@s.whatsapp.net', FRIEND = '5511888812345@s.whatsapp.net';
const START = Date.parse('2026-11-23T15:00:00Z');

function fixture(t, { random = () => 0.5 } = {}) {
  const raw = new Database(':memory:');
  runMigrations(raw);
  t.after(() => raw.close());
  const db = createScopedDatabase(raw);
  const api = {
    db,
    getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    addGold: (jid, amount) => db.prepare('UPDATE users SET gold=gold+? WHERE jid=?').run(amount, jid),
    addXP: (jid, amount) => db.prepare('UPDATE users SET xp=xp+? WHERE jid=?').run(amount, jid),
    logGoldTransaction: (from, to, amount, reason) => db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES(?,?,?,?)').run(from, to, amount, reason),
  };
  for (const chat of [CHAT, OTHER_CHAT]) for (const jid of [USER, FRIEND])
    context.run(chat, () => db.prepare('INSERT INTO users(jid,name,gold,xp) VALUES(?,?,?,?)').run(jid, 'Lobo', 500, 0));
  let time = START, counter = 0;
  const service = createForest(api, { now: () => time, random });
  const user = (jid = USER, chat = CHAT) => context.run(chat, () => api.getUser(jid));
  const act = (kind, jid = USER, chat = CHAT, id = 'msg-' + ++counter) => service.act(chat, jid, 'Lobo ' + jid.slice(9, 13), kind, id);
  const state = (chat = CHAT) => JSON.parse(raw.prepare('SELECT state FROM forest_state WHERE chat_jid=?').get(chat).state);
  const setState = (patch, chat = CHAT) => raw.prepare('UPDATE forest_state SET state=? WHERE chat_jid=?').run(JSON.stringify({ ...state(chat), ...patch }), chat);
  return { raw, api, service, user, act, state, setState, advance: ms => { time += ms; }, now: () => time };
}

test('estações seguem o hemisfério sul no horário de Brasília', () => {
  assert.equal(model.seasonAt(Date.parse('2026-01-15T12:00:00Z')).id, 'verao');
  assert.equal(model.seasonAt(Date.parse('2026-04-15T12:00:00Z')).id, 'outono');
  assert.equal(model.seasonAt(Date.parse('2026-07-15T12:00:00Z')).id, 'inverno');
  assert.equal(model.seasonAt(Date.parse('2026-10-15T12:00:00Z')).id, 'primavera');
  assert.equal(model.seasonAt(Date.parse('2026-12-01T02:00:00Z')).id, 'primavera', '23h de 30/11 em Brasília ainda é primavera');
});

test('abandono deixa caçadores invadirem e a saúde cair, sem explodir os valores', () => {
  const result = model.advance(model.initialState(START), START, START + 10 * 24 * HOUR);
  assert.equal(result.steps, 240);
  assert.ok(result.events.some(event => event.kind === 'invasao'));
  assert.ok(model.health(result.state) < model.health(model.initialState(START)) - 20);
  for (const key of ['v', 'p', 'w', 'h']) assert.ok(result.state[key] >= 0 && result.state[key] <= 1, key);
});

test('sobrecaça provoca fome e a floresta se recupera quando a caça para', () => {
  let state = model.initialState(START), at = START;
  const events = [];
  for (let hour = 0; hour < 24 * 6; hour++) {
    if (hour < 48) for (let hunt = 0; hunt < 2; hunt++) { const applied = model.applyAction(state, 'cacar', at); state = applied.state; events.push(...applied.events); }
    const step = model.advance(state, at, at + HOUR); state = step.state; events.push(...step.events); at += HOUR;
  }
  const kinds = events.map(event => event.kind);
  assert.ok(kinds.includes('fome'));
  assert.ok(kinds.indexOf('recuperacao') > kinds.indexOf('fome'));
  assert.ok(state.p > 0.35);
});

test('equilíbrio sustentado atrai o Cervo Branco, que parte se ninguém o avistar', () => {
  const calm = { ...model.initialState(START), v: 0.75, p: 0.55, w: 0.55, h: 0, calm: model.LEGEND.calmHours - 1 };
  assert.ok(model.health(calm) >= model.LEGEND.health);
  const first = model.step(calm, START + HOUR);
  assert.ok(first.events.some(event => event.kind === 'lenda'));
  assert.equal(first.state.legend.until, START + HOUR + model.LEGEND.duration);
  const later = model.advance(first.state, START + HOUR, START + HOUR + model.LEGEND.duration);
  assert.ok(later.events.some(event => event.kind === 'lenda_partiu'));
  assert.equal(later.state.legend, null);
  const blocked = model.step({ ...calm, lastLegendAt: START }, START + HOUR);
  assert.ok(!blocked.events.some(event => event.kind === 'lenda'), 'no máximo uma aparição por dia');
});

test('simulação é limitada, aceita estado corrompido e a chuva tem teto', () => {
  const far = model.advance(model.initialState(START), START, START + 400 * 24 * HOUR);
  assert.equal(far.steps, model.MAX_STEPS);
  assert.equal(far.updatedAt, START + 400 * 24 * HOUR);
  const repaired = model.normalize({ v: 'x', p: 9, w: -3, h: null, legend: { id: 1 }, calm: -2 }, START);
  assert.deepEqual([repaired.v, repaired.p, repaired.w, repaired.h, repaired.legend, repaired.calm], [0, 1, 0, 0, null, 0]);
  assert.equal(model.rainBoost(10_000), 0.03);
  assert.equal(model.rainBoost(-1), 0);
  assert.deepEqual(model.forecast(model.initialState(START), START).map(item => item.hours), [6, 24, 72]);
});

test('primeira visita cria a floresta e as horas seguintes são simuladas sob demanda', t => {
  const f = fixture(t);
  const first = f.service.snapshot(CHAT);
  assert.equal(first.created, true);
  assert.deepEqual(first.events.map(event => event.kind), ['nascimento']);
  f.advance(5 * HOUR + 30 * 60_000);
  const later = f.service.snapshot(CHAT);
  assert.equal(later.created, false);
  assert.equal(f.raw.prepare('SELECT updated_at FROM forest_state WHERE chat_jid=?').get(CHAT).updated_at, START + 5 * HOUR);
  assert.notDeepEqual(later.state, first.state);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM forest_state').get().n, 1, 'outro chat não ganha floresta sem pedir');
});

test('ações pagam WoK coin e XP, mudam o ecossistema e respeitam o intervalo', t => {
  const f = fixture(t);
  const hunt = f.act('cacar');
  assert.ok(hunt.coins > 0 && hunt.xp === 12);
  assert.equal(f.user().gold, 500 + hunt.coins);
  assert.equal(f.user().xp, 12);
  assert.ok(hunt.after.p < hunt.before.p);
  assert.throws(() => f.act('cacar'), error => error.code === 'FOREST_COOLDOWN' && error.remaining === 2 * HOUR);
  const plant = f.act('plantar');
  assert.ok(plant.after.v > plant.before.v);
  const patrol = f.act('patrulhar');
  assert.ok(patrol.after.h < patrol.before.h);
  f.advance(2 * HOUR);
  assert.doesNotThrow(() => f.act('cacar'));
  assert.equal(f.raw.prepare('SELECT count(*) n FROM forest_actions').get().n, 4);
  assert.equal(context.run(CHAT, () => f.api.db.prepare("SELECT count(*) n FROM gold_transactions WHERE from_jid='floresta'").get().n), 4);
});

test('mesma mensagem nunca paga duas vezes', t => {
  const f = fixture(t);
  f.act('plantar', USER, CHAT, 'same');
  const gold = f.user().gold;
  f.advance(3 * HOUR);
  assert.throws(() => f.act('patrulhar', USER, CHAT, 'same'), error => error.code === 'FOREST_DUPLICATE');
  assert.equal(f.user().gold, gold);
  assert.throws(() => f.service.act(CHAT, USER, 'Lobo', 'plantar', undefined), error => error.code === 'FOREST_EVENT');
});

test('teto diário limita moedas, mas a ação e o karma continuam valendo', t => {
  const f = fixture(t, { random: () => 1 });
  f.service.snapshot(CHAT);
  let paid = 0;
  for (let index = 0; index < 7; index++) { f.setState({ v: 0.1 }); paid += f.act('plantar').coins; f.advance(HOUR); }
  assert.equal(paid, DAILY_COIN_CAP);
  f.setState({ v: 0.1 });
  const capped = f.act('plantar');
  assert.equal(capped.coins, 0);
  assert.equal(capped.capped, true);
  assert.ok(capped.karma > 0);
  f.advance(24 * HOUR);
  assert.ok(f.act('plantar').coins > 0, 'novo dia em Brasília libera o teto');
});

test('caçar na escassez rende pouco e reduz o karma', t => {
  const f = fixture(t);
  f.service.snapshot(CHAT);
  f.setState({ p: 0.1 });
  const result = f.act('cacar');
  assert.equal(result.scarcity, true);
  assert.equal(result.coins, 3);
  assert.ok(result.karma < 0);
  assert.equal(f.service.trails(CHAT, USER).karma, result.karma);
});

test('floresta, moedas e cooldowns são isolados por chat', t => {
  const f = fixture(t);
  const hunt = f.act('cacar', USER, CHAT);
  assert.doesNotThrow(() => f.act('cacar', USER, OTHER_CHAT));
  assert.equal(f.user(USER, CHAT).gold, 500 + hunt.coins);
  assert.notEqual(f.state(CHAT).p, model.initialState(START).p);
  assert.equal(f.service.guardians(OTHER_CHAT).length, 1);
  assert.equal(f.service.guardians(CHAT)[0].user, USER);
});

test('Cervo Branco tem um único avistador, paga uma vez e entra na crônica', t => {
  const f = fixture(t);
  f.service.snapshot(CHAT);
  assert.throws(() => f.service.sight(CHAT, USER, 'Lobo', 'early'), error => error.code === 'FOREST_NO_LEGEND');
  f.setState({ legend: { id: 'cervo-test', until: START + HOUR, by: null } });
  assert.ok(f.service.snapshot(CHAT).legend);
  const seen = f.service.sight(CHAT, FRIEND, 'Uivo*_Alto', 'sight-1');
  assert.equal(seen.coins, model.SIGHTING_REWARD.coins);
  assert.equal(f.user(FRIEND).gold, 500 + model.SIGHTING_REWARD.coins);
  assert.throws(() => f.service.sight(CHAT, USER, 'Lobo', 'sight-2'), error => error.code === 'FOREST_LEGEND_TAKEN');
  assert.equal(f.user().gold, 500);
  assert.equal(f.state().legend.by, 'Uivo Alto');
  assert.equal(f.service.chronicle(CHAT)[0].kind, 'avistamento');
  assert.equal(f.raw.prepare('SELECT count(*) n FROM forest_sightings').get().n, 1);
});

test('lenda expirada não pode ser avistada', t => {
  const f = fixture(t);
  f.service.snapshot(CHAT);
  f.setState({ legend: { id: 'cervo-old', until: START + 30 * 60_000, by: null } });
  f.advance(45 * 60_000);
  assert.throws(() => f.service.sight(CHAT, USER, 'Lobo', 'late'), error => error.code === 'FOREST_NO_LEGEND');
});

test('falha no pagamento desfaz ação, estado e crônica', t => {
  const f = fixture(t);
  f.service.snapshot(CHAT);
  const before = f.raw.prepare('SELECT state,updated_at FROM forest_state WHERE chat_jid=?').get(CHAT);
  const original = f.api.addGold;
  f.api.addGold = () => { throw Error('carteira indisponível'); };
  f.advance(3 * HOUR);
  assert.throws(() => f.act('patrulhar'), /carteira indisponível/);
  f.api.addGold = original;
  assert.deepEqual(f.raw.prepare('SELECT state,updated_at FROM forest_state WHERE chat_jid=?').get(CHAT), before);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM forest_actions').get().n, 0);
  assert.equal(f.user().gold, 500);
});

test('perfil restrito ou inexistente não age na floresta', t => {
  const f = fixture(t);
  context.run(CHAT, () => f.api.db.prepare('UPDATE users SET banned=1 WHERE jid=?').run(USER));
  assert.throws(() => f.act('cacar'), error => error.code === 'FOREST_RESTRICTED');
  assert.throws(() => f.act('cacar', '5511777712345@s.whatsapp.net'), error => error.code === 'FOREST_PROFILE');
  assert.throws(() => f.act('cacar', 'invalido'), error => error.code === 'FOREST_IDENTITY');
});

test('mensagens viram chuva só onde a floresta existe e são consumidas na hora seguinte', t => {
  const f = fixture(t);
  assert.equal(rain(f.raw, CHAT), false);
  f.service.snapshot(CHAT);
  for (let index = 0; index < 1005; index++) rain(f.api.db, CHAT);
  assert.equal(f.raw.prepare('SELECT rain FROM forest_state WHERE chat_jid=?').get(CHAT).rain, 1000);
  assert.equal(f.service.snapshot(CHAT).rain, 1000);
  const dry = model.advance(f.state(), START, START + HOUR).state;
  f.advance(HOUR);
  const wet = f.service.snapshot(CHAT);
  assert.equal(wet.rain, 0);
  assert.ok(wet.state.v > dry.v);
  assert.throws(() => rain(f.raw, 'invalido'));
});

test('crônica guarda no máximo as páginas mais recentes', t => {
  const f = fixture(t);
  f.service.snapshot(CHAT);
  const insert = f.raw.prepare("INSERT INTO forest_chronicle(chat_jid,kind,at) VALUES(?,'invasao',?)");
  for (let index = 0; index < 60; index++) insert.run(CHAT, START);
  f.setState({ legend: { id: 'cervo-x', until: START + HOUR, by: null } });
  f.service.sight(CHAT, USER, 'Lobo', 'prune');
  assert.equal(f.raw.prepare('SELECT count(*) n FROM forest_chronicle WHERE chat_jid=?').get(CHAT).n, CHRONICLE_LIMIT);
  assert.equal(f.service.chronicle(CHAT, 5).length, 5);
});

test('guardiões ordenam por karma com o nome mais recente', t => {
  const f = fixture(t);
  f.act('patrulhar', FRIEND);
  f.act('plantar', USER);
  f.service.snapshot(CHAT);
  f.setState({ p: 0.1 });
  f.act('cacar', USER);
  const rows = f.service.guardians(CHAT);
  assert.deepEqual(rows.map(row => row.user), [FRIEND, USER]);
  assert.equal(rows[1].actions, 2);
});

test('comandos mostram painel, previsão e avisos com o prefixo da instalação', async t => {
  const f = fixture(t);
  const handlers = createForestHandlers({ service: f.service, prefix: () => '#' });
  const sent = [], sock = { sendMessage: async (jid, content, options) => sent.push({ jid, text: content.text, options }) };
  const ctx = id => ({ jid: CHAT, sender: USER, pushName: 'Lobo', msg: { key: { id } }, args: [] });
  await handlers.panel(sock, ctx('p1'));
  assert.match(sent.at(-1).text, /FLORESTA VIVA/);
  assert.match(sent.at(-1).text, /Saúde:/);
  assert.ok(sent.at(-1).text.includes('#cacar'));
  assert.ok(!sent.at(-1).text.includes('!cacar'));
  await handlers.action('cacar')(sock, ctx('p2'));
  assert.match(sent.at(-1).text, /CAÇADA/);
  await handlers.action('cacar')(sock, ctx('p3'));
  assert.match(sent.at(-1).text, /PATAS CANSADAS/);
  await handlers.track(sock, ctx('p4'));
  assert.match(sent.at(-1).text, /\+72h/);
  await handlers.sight(sock, ctx('p5'));
  assert.match(sent.at(-1).text, /Nenhum espírito lendário/);
  await handlers.chronicle(sock, ctx('p6'));
  assert.match(sent.at(-1).text, /despertou/);
  await handlers.guardians(sock, ctx('p7'));
  assert.match(sent.at(-1).text, /GUARDIÕES/);
  const broken = createForestHandlers({ service: { snapshot: () => { throw Error('SQLITE_CORRUPT detalhe interno'); } }, prefix: () => '#' });
  await broken.panel(sock, ctx('p8'));
  assert.ok(!sent.at(-1).text.includes('SQLITE_CORRUPT'));
  assert.ok(sent.every(item => item.options.quoted));
});

test('registro cria oito comandos na categoria floresta sem colidir com o bot', () => {
  const registered = [];
  register(definition => registered.push(definition));
  assert.deepEqual(registered.map(item => item.name), ['floresta', 'cacar', 'plantar', 'patrulhar', 'rastrear', 'avistar', 'cronica', 'guardioes']);
  assert.ok(registered.every(item => item.category === 'floresta' && typeof item.handler === 'function'));
  const interval = global.setInterval;
  global.setInterval = (...args) => interval(...args).unref();
  try { require('../src/handlers/commands').loadAllCommands(); } finally { global.setInterval = interval; }
  const registry = require('../src/core/commandRegistry').registry;
  for (const item of registered) assert.equal(registry.get(item.name).category, 'floresta');
  assert.equal(registry.get('caçar').name, 'cacar');
  assert.equal(require('../src/menus/catalog').categoryOf(registry.get('floresta')), 'floresta');
  assert.equal(duration(90 * 60_000), '1h 30min');
  assert.equal(duration(1), '1min');
});
