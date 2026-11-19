'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const context = require('../src/isolation/context');
const { attachUniversalStore, balance } = require('../src/services/universal-currency');
const { createMissions, recordGameEvent, periods, MISSIONS, LIMITS } = require('../src/missions/service');
const { createMissionHandler, register } = require('../src/commands/missions');

const CHAT = '1207000012345@g.us', OTHER_CHAT = '1207000054321@g.us';
const USER = '5511999912345@s.whatsapp.net', OTHER = '5511888812345@s.whatsapp.net', LID = '123456789012345@lid';
const NOW = Date.parse('2026-11-18T12:00:00Z');
let modules;
async function realModules() {
  return modules ||= Promise.all(['store.js', 'game/service.js', 'game/players.js'].map(file => import('../addons/alcateia/src/' + file))).then(parts => Object.assign({}, ...parts));
}

function apiFor(raw) {
  const db = createScopedDatabase(raw);
  return {
    db,
    getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    addGold: (jid, amount) => db.prepare('UPDATE users SET gold=gold+? WHERE jid=?').run(amount, jid),
    addXP: (jid, amount) => db.prepare('UPDATE users SET xp=xp+? WHERE jid=?').run(amount, jid),
    logGoldTransaction: (from, to, amount, reason) => db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES(?,?,?,?)').run(from, to, amount, reason),
  };
}

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-missions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'game.sqlite');
  let raw = new Database(file); runMigrations(raw);
  let api = apiFor(raw), time = NOW;
  for (const chat of [CHAT, OTHER_CHAT]) context.run(chat, () => api.db.prepare('INSERT INTO users(jid,name,gold,xp) VALUES(?,?,?,?)').run(USER, 'Explorador', 500, 0));
  const real = await realModules(), storeFile = path.join(directory, 'game.json');
  const store = attachUniversalStore(new real.Store(storeFile), api);
  const service = () => createMissions(api, { now: () => time });
  const record = (kind, event, extra = {}) => recordGameEvent(raw, { chat: CHAT, user: USER, kind, event, at: time, ...extra });
  const user = (chat = CHAT, jid = USER) => context.run(chat, () => api.getUser(jid));
  const reopen = () => { raw.close(); raw = new Database(file); api = apiFor(raw); return service(); };
  t.after(() => raw.close());
  return { file, directory, real, store, service, record, user, reopen,
    get raw() { return raw; }, get api() { return api; }, time: () => time, setTime: value => { time = value; } };
}

test('mission periods use Brasília midnight and Monday, independently of server timezone', () => {
  assert.deepEqual(periods(Date.parse('2026-11-16T02:59:59Z')), { day: '2026-11-15', week: '2026-11-09' });
  assert.deepEqual(periods(Date.parse('2026-11-16T03:00:00Z')), { day: '2026-11-16', week: '2026-11-16' });
  assert.deepEqual(periods(Date.parse('2026-11-19T02:59:59Z')), { day: '2026-11-18', week: '2026-11-16' });
  assert.deepEqual(periods(Date.parse('2026-11-19T03:00:00Z')), { day: '2026-11-19', week: '2026-11-16' });
});

test('real completed events advance only their objectives, with permanent per-chat deduplication', async t => {
  const f = await fixture(t);
  assert.equal(f.record('arcade_complete', 'game-a').recorded, true);
  assert.equal(f.record('arcade_complete', 'game-a').duplicate, true);
  assert.equal(f.record('training', 'train-a').recorded, true);
  const missions = f.service().list(CHAT, USER);
  assert.equal(missions.find(item => item.id === 'd-jogos').progress, 1);
  assert.equal(missions.find(item => item.id === 'd-treino').complete, true);
  assert.equal(f.service().list(OTHER_CHAT, USER).find(item => item.id === 'd-treino').progress, 0);
  assert.equal(f.service().list(CHAT, OTHER).find(item => item.id === 'd-treino').progress, 0);
  assert.throws(() => f.record('message', 'message-a'), /não reconhecido/);
  assert.throws(() => f.record('arcade_complete', ''), /identificador/);
  const after = f.reopen();
  assert.equal(after.list(CHAT, USER).find(item => item.id === 'd-treino').progress, 1);
  assert.equal(f.record('training', 'train-a').duplicate, true);
});

test('claim credits the existing universal wallet and XP exactly once, including after reopen', async t => {
  const f = await fixture(t); f.record('training', 'train-a');
  const result = f.service().claim(CHAT, USER, 'd-treino', 'claim-a');
  assert.equal(result.coins, 25); assert.equal(result.xp, 15);
  assert.equal(balance(f.raw, CHAT, USER), 525);
  assert.equal(f.user().gold, 525); assert.equal(f.user().xp, 15);
  assert.equal(f.user(OTHER_CHAT).gold, 500);
  assert.equal(f.service().claim(CHAT, USER, 'd-treino', 'claim-b').duplicate, true);
  const restarted = f.reopen();
  assert.equal(restarted.claim(CHAT, USER, 'd-treino', 'claim-c').duplicate, true);
  assert.equal(f.user().gold, 525); assert.equal(f.user().xp, 15);
  assert.equal(f.raw.prepare('SELECT count(*) AS n FROM mission_claims').get().n, 1);
});

test('unmapped LID is never rewarded, while a verified alias shares one mission progress and claim', async t => {
  const f = await fixture(t);
  assert.equal(f.record('training', 'unverified', { user: LID }).reason, 'IDENTITY_UNCONFIRMED');
  assert.throws(() => f.service().claim(CHAT, LID, 'd-treino', 'claim-unverified'), /confirmar seu número/);
  f.store.linkWallet(CHAT, USER, LID);
  f.record('training', 'verified', { user: LID });
  assert.equal(f.service().list(CHAT, USER).find(item => item.id === 'd-treino').complete, true);
  f.service().claim(CHAT, LID, 'd-treino', 'claim-verified');
  assert.equal(f.user().gold, 525);
  assert.equal(f.service().claim(CHAT, USER, 'd-treino', 'claim-pn').duplicate, true);
  assert.equal(f.raw.prepare('SELECT count(*) AS n FROM mission_claims').get().n, 1);
  assert.equal(f.record('training', 'same-unknown-other', { chat: OTHER_CHAT, user: LID }).reason, 'IDENTITY_UNCONFIRMED');
});

test('incomplete, restricted and repeated action claims cannot credit coins', async t => {
  const f = await fixture(t);
  assert.throws(() => f.service().claim(CHAT, USER, 'd-treino', 'premature'), /não concluiu/);
  f.record('training', 'train-a'); f.record('rp_work', 'work-a');
  f.service().claim(CHAT, USER, 'd-treino', 'claim-once');
  assert.throws(() => f.service().claim(CHAT, USER, 'd-trabalho', 'claim-once'), /já foi processada/);
  context.run(CHAT, () => f.api.db.prepare('UPDATE users SET banned=1 WHERE jid=?').run(USER));
  assert.throws(() => f.service().claim(CHAT, USER, 'd-trabalho', 'claim-banned'), /impedido/);
  assert.equal(f.user().gold, 525);
});

test('reward transaction rolls back wallet, XP, audit and claim marker on a storage failure', async t => {
  const f = await fixture(t); f.record('training', 'train-a');
  context.run(CHAT, () => f.api.db.exec("CREATE TRIGGER mission_xp_failure BEFORE UPDATE OF xp ON users BEGIN SELECT RAISE(ABORT,'mission fixture failure'); END;"));
  assert.throws(() => f.service().claim(CHAT, USER, 'd-treino', 'claim-failed'), /fixture failure/);
  assert.equal(f.user().gold, 500); assert.equal(f.user().xp, 0);
  assert.equal(balance(f.raw, CHAT, USER), 500);
  assert.equal(f.raw.prepare('SELECT count(*) AS n FROM mission_claims').get().n, 0);
  assert.equal(context.run(CHAT, () => f.api.db.prepare('SELECT count(*) AS n FROM gold_transactions').get().n), 0);
  context.run(CHAT, () => f.api.db.exec('DROP TRIGGER mission_xp_failure'));
  assert.equal(f.service().claim(CHAT, USER, 'd-treino', 'claim-failed').coins, 25);
});

test('fixed daily and weekly catalog caps rewards and resets only matching periods', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) f.record('arcade_complete', 'arcade-' + i);
  for (let i = 0; i < 5; i++) f.record('rp_work', 'work-' + i);
  for (let i = 0; i < 3; i++) f.record('quiz_complete', 'quiz-' + i);
  for (let i = 0; i < 2; i++) f.record('adventure_complete', 'adventure-' + i);
  f.record('training', 'training');
  for (const mission of MISSIONS) f.service().claim(CHAT, USER, mission.id, 'claim-' + mission.id);
  assert.equal(f.user().gold, 500 + LIMITS.dailyCoins + LIMITS.weeklyCoins);
  assert.equal(f.user().xp, LIMITS.dailyXP + LIMITS.weeklyXP);
  f.setTime(Date.parse('2026-11-19T12:00:00Z'));
  assert.equal(f.service().list(CHAT, USER, 'daily').every(item => !item.claimed && !item.complete), true);
  assert.equal(f.service().list(CHAT, USER, 'weekly').every(item => item.claimed), true);
  f.setTime(Date.parse('2026-11-23T03:00:00Z'));
  assert.equal(f.service().list(CHAT, USER).every(item => !item.claimed && !item.complete), true);
  // Replaying an old event cannot manufacture a new day's progress.
  assert.equal(f.record('training', 'training').duplicate, true);
});

test('concurrent duplicate claim attempts settle a single virtual reward', async t => {
  const f = await fixture(t); f.record('training', 'train-a');
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => Promise.resolve().then(() => f.service().claim(CHAT, USER, 'd-treino', 'parallel-' + i))));
  assert.equal(results.filter(item => !item.duplicate).length, 1);
  assert.equal(f.user().gold, 525); assert.equal(f.user().xp, 15);
});

test('addon training and RP work feed missions inside the committed universal transaction', async t => {
  const f = await fixture(t);
  const service = new f.real.GameService({ store: f.store.scoped(CHAT), rng: () => 0.9 });
  const execute = (command, args, eventId, at = NOW) => context.run(CHAT, () => service.execute({
    command, args, argText: args.join(' '), actor: { jid: USER, name: 'Explorador' }, chatId: CHAT, eventId, now: at,
  }));
  const train = await execute('treino', [], 'actual-training');
  assert.equal(train.type, 'training'); assert.equal(train.missionEvents, undefined);
  assert.equal(f.service().list(CHAT, USER).find(item => item.id === 'd-treino').progress, 1);
  assert.equal((await execute('treino', [], 'rejected-training', NOW + 1000)).code, 'COOLDOWN');
  assert.equal(f.raw.prepare("SELECT count(*) AS n FROM mission_events WHERE kind='training'").get().n, 1);
  await execute('profissao', ['entregador'], 'choose-job', NOW + 2000);
  const work = await execute('trabalhar', [], 'actual-work', NOW + 3000);
  assert.equal(work.type, 'rp-work', work.message);
  assert.equal(f.service().list(CHAT, USER).find(item => item.id === 'd-trabalho').progress, 1);
  assert.equal(f.raw.prepare("SELECT count(*) AS n FROM mission_events WHERE kind='rp_work'").get().n, 1);
});

test('failure to record an addon completion rolls its game action back as well', async t => {
  const f = await fixture(t), service = new f.real.GameService({ store: f.store.scoped(CHAT), rng: () => 0.9 });
  const before = await f.store.scoped(CHAT).transactionGame(game => structuredClone(game));
  f.raw.exec("CREATE TRIGGER mission_event_failure BEFORE INSERT ON mission_events BEGIN SELECT RAISE(ABORT,'event fixture failure'); END;");
  await assert.rejects(context.run(CHAT, () => service.execute({ command: 'treino', args: [], actor: { jid: USER, name: 'Explorador' }, chatId: CHAT, eventId: 'failed-training', now: NOW })), /event fixture failure/);
  const after = await f.store.scoped(CHAT).transactionGame(game => structuredClone(game));
  assert.deepEqual(after, before);
  assert.equal(f.raw.prepare('SELECT count(*) AS n FROM mission_events').get().n, 0);
});

test('mission command registers and displays usable claims using the configured prefix', async t => {
  const f = await fixture(t); f.record('training', 'train-a');
  let definition; register(value => { definition = value; });
  assert.equal(definition.name, 'missoes'); assert.ok(definition.aliases.includes('missões'));
  const handler = createMissionHandler({ service: f.service(), prefix: () => '$$' }), sent = [];
  const sock = { sendMessage: async (_jid, payload) => sent.push(payload.text) };
  const ctx = { jid: CHAT, sender: USER, args: ['diarias'], msg: { key: { id: 'command' } } };
  await handler(sock, ctx);
  assert.match(sent.at(-1), /\$\$missoes.*resgatar.*d-treino/);
  await handler(sock, { ...ctx, args: ['resgatar', 'd-treino'] });
  assert.equal(f.user().gold, 525); assert.match(sent.at(-1), /MISSÃO RESGATADA/);
});
