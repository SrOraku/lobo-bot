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
const { createGartic, CATEGORIES, progressiveHint, seasonKey } = require('../src/games/gartic');
const CHAT = '123@g.us', OTHER = '456@g.us', ARTIST = '5511999999999@s.whatsapp.net', GUESSER = '5511888888888@s.whatsapp.net';

function fixture(t) {
  const raw = new Database(':memory:'); runMigrations(raw); t.after(() => raw.close());
  const db = createScopedDatabase(raw);
  let clock = Date.parse('2026-11-18T15:00:00Z'), failure = false, serial = 0;
  const api = {
    db,
    upsertUser: (jid, name) => db.prepare('INSERT INTO users(jid,name) VALUES(?,?) ON CONFLICT(jid) DO NOTHING').run(jid, name),
    getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    addGold: (jid, amount) => db.prepare('UPDATE users SET gold=gold+? WHERE jid=?').run(amount, jid),
    addXP: (jid, amount) => db.prepare('UPDATE users SET xp=xp+? WHERE jid=?').run(amount, jid),
    logGoldTransaction: (from, to, amount, reason) => {
      if (failure) throw Error('fixture transaction failure');
      db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES(?,?,?,?)').run(from, to, amount, reason);
    },
  };
  const sent = [], sock = { sendMessage: async (jid, payload) => sent.push({ jid, payload }) };
  const instances = [];
  function make() { const game = createGartic(api, { now: () => clock, pick: () => 0, schedule: () => ({ unref() {} }), cancel() {} }); instances.push(game); return game; }
  let game = make();
  t.after(() => { for (const instance of instances) instance.stop(); });
  const ctx = (sender = ARTIST, args = [], chat = CHAT, event) => ({ jid: chat, sender, args, pushName: sender === ARTIST ? 'Artist' : 'Guesser', msg: { key: { id: event || 'event-' + ++serial, participant: sender, remoteJid: chat } } });
  const run = (args, sender = ARTIST, chat = CHAT, event) => context.run(chat, () => game.command(sock, ctx(sender, args, chat, event)));
  const guess = (text, sender = GUESSER, chat = CHAT, event) => context.run(chat, () => game.guess(sock, ctx(sender, [], chat, event), text));
  const user = (sender = GUESSER, chat = CHAT) => context.run(chat, () => api.getUser(sender));
  for (const chat of [CHAT, OTHER]) context.run(chat, () => { api.upsertUser(ARTIST, 'Artist'); api.upsertUser(GUESSER, 'Guesser'); });
  return { raw, db, api, sent, sock, ctx, run, guess, user, get game() { return game; }, now: () => clock, advance: ms => clock += ms,
    restart() { game.stop(); game = make(); }, fail: () => { failure = true; }, succeed: () => { failure = false; } };
}

test('Gartic categories keep the original pool and send the chosen category only to the artist', async t => {
  const f = fixture(t);
  assert.equal(CATEGORIES.geral[0], 'floresta'); assert.equal(Object.keys(CATEGORIES).length, 5);
  assert.match(await f.run(['categorias']), /animais/);
  await assert.rejects(f.run(['iniciar', '3', 'inexistente']), /Categoria/);
  assert.equal(f.game.read(CHAT), null);
  await f.run(['iniciar', '3', 'animais']);
  assert.equal(f.game.read(CHAT).category, 'animais');
  assert.equal(f.game.read(CHAT).word, 'lobo');
  assert.equal(f.sent[0].jid, ARTIST);
  assert.match(f.sent[0].payload.text, /lobo/);
  assert.ok(f.sent.every(item => item.jid !== CHAT), 'The secret must not be delivered to the group');
});

test('prototype category names and extra arguments never start or mutate Gartic rounds', async t => {
  const f = fixture(t);
  for (const category of ['constructor', '__proto__', 'toString']) {
    await assert.rejects(f.run(['iniciar', '2', category]), /Categoria inválida/);
    await assert.rejects(f.run(['ranking', 'temporada', category]), /Categoria inválida/);
    assert.equal(f.game.read(CHAT), null);
  }
  await assert.rejects(f.run(['iniciar', '2', 'animais', 'extra']), /Use gartic iniciar/);
  assert.equal(f.sent.length, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM phase1_gartic_actions').get().n, 0);
  await f.run(['iniciar', '2', 'animais']);
  await f.guess('lobo');
  const before = JSON.stringify(f.game.read(CHAT)), sentBefore = f.sent.length;
  await assert.rejects(f.run(['proxima', 'extra']), /Use gartic proxima/);
  assert.equal(JSON.stringify(f.game.read(CHAT)), before); assert.equal(f.sent.length, sentBefore);
  const legacy = { ...f.game.read(CHAT), category: 'constructor' };
  f.db.prepare("UPDATE expansion_rounds SET state=? WHERE chat_jid=? AND kind='gartic'").run(JSON.stringify(legacy), CHAT);
  await assert.rejects(f.run(['proxima']), /Categoria inválida/);
  assert.equal(f.sent.length, sentBefore);
  assert.equal(JSON.stringify(f.game.read(CHAT)), JSON.stringify(legacy));
});

test('Gartic hints progress with time, support legacy saved rounds and never reveal the complete word', async t => {
  const f = fixture(t); await f.run(['iniciar', '1', 'fantasia']);
  let hint = await f.run(['pista']); assert.match(hint, /40 segundos/); assert.ok(!hint.includes('dragao'));
  f.advance(40000); const early = await f.run(['pista']);
  f.advance(40000); const late = await f.run(['pista']);
  assert.ok((late.match(/＿/g) || []).length < (early.match(/＿/g) || []).length);
  assert.ok(late.includes('＿'));
  const legacy = { word: 'floresta', ends: 120000 };
  assert.equal(progressiveHint(legacy, 50000), progressiveHint({ ...legacy, startedAt: 0 }, 50000));
});

test('weekly Gartic rankings are persisted, category scoped and reset without deleting the old season', async t => {
  const f = fixture(t); await f.run(['iniciar', '1', 'animais']);
  assert.match(await f.guess('lobo'), /40 WoK coin/);
  assert.equal(f.user().gold, 540); assert.equal(f.user().xp, 20);
  assert.equal(f.db.prepare('SELECT count(*) n FROM phase1_gartic_results').get().n, 1);
  f.restart(); assert.match(await f.run(['ranking', 'temporada', 'animais']), /Guesser/);
  assert.match(await f.run(['ranking', 'temporada', 'objetos']), /Nenhum acerto/);
  assert.match(await f.run(['ranking', 'temporada'], ARTIST, OTHER), /Nenhum acerto/);
  const old = seasonKey(f.now()); f.advance(7 * 86400000);
  assert.match(await f.run(['ranking', 'temporada']), /Nenhum acerto/);
  assert.match(await f.run(['ranking', old]), /Guesser/);
});

test('duplicate winners and old replayed start events cannot generate a second reward after restart', async t => {
  const f = fixture(t); await f.run(['iniciar', '1'], ARTIST, CHAT, 'stable-start');
  const word = f.game.read(CHAT).word;
  const answers = await Promise.all([f.guess(word, GUESSER, CHAT, 'stable-answer'), f.guess(word, GUESSER, CHAT, 'stable-answer')]);
  assert.equal(answers.filter(Boolean).length, 1); assert.equal(f.user().gold, 540);
  f.restart(); assert.equal(await f.guess(word, GUESSER, CHAT, 'stable-answer'), null);
  assert.match(await f.run(['iniciar', '1'], ARTIST, CHAT, 'stable-start'), /já foi processada/);
  assert.equal(f.user().gold, 540);
});

test('Gartic rejects unconfirmed LID identities and accepts only a previously confirmed wallet alias', async t => {
  const f = fixture(t), lid = '999999999999999@lid';
  await assert.rejects(f.run(['iniciar'], lid), /confirmar/);
  await f.run(['iniciar', '1']); const word = f.game.read(CHAT).word;
  assert.equal(await f.guess(word, lid), null);
  f.db.prepare('INSERT INTO universal_wallet_aliases VALUES(?,?,?)').run(CHAT, lid, GUESSER);
  assert.match(await f.guess(word, lid), /40 WoK coin/);
  assert.equal(f.user().gold, 540);
  assert.equal(f.user(GUESSER, OTHER).gold, 500);
});

test('a failed reward transaction rolls back the winner, wallet, season result and mission event', async t => {
  const f = fixture(t); await f.run(['iniciar', '1']); const word = f.game.read(CHAT).word;
  f.fail(); await assert.rejects(f.guess(word, GUESSER, CHAT, 'retry-answer'), /transaction failure/);
  assert.equal(f.game.read(CHAT).active, true); assert.equal(f.user().gold, 500); assert.equal(f.user().xp, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM phase1_gartic_results').get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM phase1_gartic_actions WHERE action='guess'").get().n, 0);
  f.succeed(); assert.match(await f.guess(word, GUESSER, CHAT, 'retry-answer'), /40 WoK coin/);
  assert.equal(f.db.prepare("SELECT count(*) n FROM mission_events WHERE kind='arcade_complete'").get().n, 1);
});

test('legacy rounds without category continue and only their artist can advance them', async t => {
  const f = fixture(t), legacy = { id: 'legacy-round', artist: ARTIST, word: 'floresta', round: 1, total: 2, ends: f.now() + 120000, active: true };
  f.db.prepare("INSERT INTO expansion_rounds VALUES(?,'gartic',?)").run(CHAT, JSON.stringify(legacy));
  assert.match(await f.run(['status']), /geral/);
  await f.guess('floresta');
  await assert.rejects(f.run(['proxima'], GUESSER), /Somente o desenhista/);
  await f.run(['proxima']);
  assert.equal(f.game.read(CHAT).category, 'geral'); assert.equal(f.game.read(CHAT).round, 2);
  assert.notEqual(f.game.read(CHAT).word, 'floresta');
});

test('a Gartic artist cannot claim their own drawing reward', async t => {
  const f = fixture(t); await f.run(['iniciar', '1', 'animais']);
  assert.equal(await f.guess('lobo', ARTIST), null); assert.equal(f.user(ARTIST).gold, 500);
  assert.equal(f.db.prepare('SELECT count(*) n FROM phase1_gartic_results').get().n, 0);
});

test('a Gartic round, reward and weekly result survive closing and reopening SQLite', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-gartic-reopen-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'game.sqlite');
  let raw, game;
  const at = Date.parse('2026-11-18T15:00:00Z');
  function open() {
    raw = new Database(filename); runMigrations(raw);
    const db = createScopedDatabase(raw), api = {
      db,
      upsertUser: (jid, name) => db.prepare('INSERT INTO users(jid,name) VALUES(?,?) ON CONFLICT(jid) DO NOTHING').run(jid, name),
      getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
      addGold: (jid, amount) => db.prepare('UPDATE users SET gold=gold+? WHERE jid=?').run(amount, jid),
      addXP: (jid, amount) => db.prepare('UPDATE users SET xp=xp+? WHERE jid=?').run(amount, jid),
      logGoldTransaction: (from, to, amount, reason) => db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES(?,?,?,?)').run(from, to, amount, reason),
    };
    game = createGartic(api, { now: () => at, pick: () => 0, schedule: () => ({ unref() {} }), cancel() {} });
    return api;
  }
  function close() { game.stop(); raw.close(); }
  t.after(() => { if (raw?.open) close(); });
  const sock = { sendMessage: async () => {} };
  open();
  await context.run(CHAT, () => game.command(sock, { jid: CHAT, sender: ARTIST, args: ['iniciar', '2', 'animais'], msg: { key: { id: 'open-round' } } }));
  const id = game.read(CHAT).id;
  close(); open();
  assert.equal(game.read(CHAT).id, id); assert.equal(game.read(CHAT).active, true);
  const winner = { jid: CHAT, sender: GUESSER, pushName: 'Guesser', msg: { key: { id: 'winner-round' } } };
  assert.match(await game.guess(sock, winner, 'lobo'), /40 WoK coin/);
  close(); const reopened = open();
  assert.equal(await game.guess(sock, winner, 'lobo'), null);
  assert.equal(context.run(CHAT, () => reopened.getUser(GUESSER).gold), 540);
  assert.equal(raw.prepare('SELECT count(*) n FROM phase1_gartic_results').get().n, 1);
  assert.match(await game.command(sock, { jid: CHAT, sender: ARTIST, args: ['ranking', 'temporada'] }), /Guesser/);
});
