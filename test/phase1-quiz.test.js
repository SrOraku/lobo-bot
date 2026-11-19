'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const migration = require('../src/config/migrations/017-quiz-tournaments');
const catalog = require('../src/games/quiz/catalog');
const { createQuiz, weekKey, ROUND_MS, COOLDOWN_MS } = require('../src/games/quiz/service');
const { createExpandedQuizHandler, renderResult, register } = require('../src/commands/quiz-expanded');
const CHAT = '123@g.us', OTHER = '456@g.us', A = '5511999999991@s.whatsapp.net', B = '5511999999992@s.whatsapp.net';

function fixture(t, file = ':memory:') {
 const db = new Database(file); runMigrations(db);
 if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='quiz_plus_sessions'").get()) db.exec(migration.up);
 t.after(() => { if (db.open) db.close(); });
 let at = Date.parse('2026-11-18T12:00:00Z'), sequence = 0;
 const events = [], options = { now: () => at, pick: () => 0, emit: event => events.push(event) };
 const quiz = createQuiz(db, options), next = () => 'event-' + ++sequence;
 const solo = (action, args = [], user = A, chat = CHAT, event = next()) => quiz.solo(chat, user, 'Jogador', action, args, event);
 const tournament = (action, args = [], user = A, chat = CHAT, event = next()) => quiz.tournament(chat, user, user === A ? 'Alfa' : 'Beta', action, args, event);
 const state = () => JSON.parse(db.prepare('SELECT state FROM quiz_tournaments WHERE chat_jid=?').get(CHAT).state);
 function finishSolo(user = A, category = 'ciencia', difficulty = 'dificil') {
  let result = solo('iniciar', [category, difficulty], user);
  for (let round = 0; round < 5; round++) {
   const question = catalog.byId.get(result.state.deck[round]);
   result = solo('resposta', [String(question.answer + 1), String(round + 1)], user);
  }
  return result;
 }
 return { db, quiz, options, events, solo, tournament, state, finishSolo, next, get time() { return at; }, set time(value) { at = value; } };
}

test('quiz catalog has sixty unique complete questions and five per category/difficulty', () => {
 assert.equal(catalog.QUESTIONS.length, 60); assert.equal(new Set(catalog.QUESTIONS.map(q => q.id)).size, 60);
 for (const cat of Object.keys(catalog.CATEGORIES)) for (const level of Object.keys(catalog.DIFFICULTIES)) {
  const deck = catalog.deck(cat, level, () => 0); assert.equal(deck.length, 5); assert.equal(new Set(deck).size, 5);
  for (const id of deck) { const q = catalog.byId.get(id); assert.equal(q.choices.length, 4); assert.ok(q.answer >= 0 && q.answer < 4); assert.ok(q.explanation.length > 10); }
 }
 assert.throws(() => catalog.deck('fantasma', 'medio'), /Categoria/);
 assert.throws(() => catalog.deck('ciencia', 'impossivel'), /Dificuldade/);
 assert.throws(() => catalog.deck('ciencia', 'medio', () => 99), /Sorteio/);
});

test('prototype property names are rejected before a solo or tournament can persist an unusable deck', t => {
 const f = fixture(t);
 const snapshot = () => JSON.stringify(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => [row.name, f.db.prepare('SELECT * FROM "' + row.name + '"').all()]));
 const before = snapshot();
 for (const value of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  assert.throws(() => catalog.category(value), /Categoria/);
  assert.throws(() => catalog.difficulty(value), /Dificuldade/);
  assert.throws(() => catalog.deck(value, 'medio'), /Categoria/);
  assert.throws(() => catalog.deck('ciencia', value), /Dificuldade/);
  for (const args of [[value, 'medio'], ['ciencia', value]]) {
   assert.throws(() => f.solo('iniciar', args), /inválida/);
   assert.throws(() => f.tournament('criar', args), /inválida/);
   assert.equal(snapshot(), before, 'A rejected category/difficulty must not create state, results or accepted event markers');
  }
 }
 assert.equal(f.solo('iniciar', ['ciencia', 'medio']).state.deck.length, 5, 'A valid category remains usable after rejected input');
});

test('category quiz completes, credits existing arcade points once, emits real completion and leaves money intact', t => {
 const f = fixture(t); f.db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(A, 'Alfa', 500);
 const result = f.finishSolo(); assert.equal(result.type, 'solo-finished'); assert.equal(result.correct, 5); assert.equal(result.points, 100);
 assert.equal(f.db.prepare('SELECT points FROM arcade_scores WHERE chat_jid=? AND user_jid=?').get(CHAT, A).points, 100);
 assert.equal(f.db.prepare('SELECT gold FROM users WHERE jid=?').get(A).gold, 500);
 assert.equal(f.quiz.history(CHAT, A).length, 1); assert.equal(f.quiz.ranking(CHAT, 'ciencia')[0].points, 100);
 assert.deepEqual(f.events.map(e => e.kind), ['quiz_complete', 'arcade_complete']);
 assert.ok(f.events.every(e => e.user === A && e.metadata.won));
 assert.throws(() => f.solo('iniciar', ['ciencia']), /Aguarde/);
});

test('solo and tournament rewards share a 200 point daily ceiling and weekly ranking rotates without deleting history', t => {
 const f = fixture(t); assert.equal(f.finishSolo().points, 100);
 f.time += COOLDOWN_MS; assert.equal(f.finishSolo().points, 100);
 f.time += COOLDOWN_MS; assert.equal(f.finishSolo().points, 0);
 assert.equal(f.db.prepare('SELECT points FROM arcade_scores WHERE chat_jid=? AND user_jid=?').get(CHAT, A).points, 200);
 const originalWeek = weekKey(f.time); f.time += 7 * 86400000;
 assert.notEqual(weekKey(f.time), originalWeek); assert.deepEqual(f.quiz.ranking(CHAT), []);
 assert.equal(f.quiz.history(CHAT, A).length, 3);
 assert.equal(f.finishSolo().points, 100);
});

test('replayed message IDs cannot advance rounds, even after restart of the service', t => {
 const f = fixture(t); const start = f.solo('iniciar', ['ciencia', 'facil']);
 const first = catalog.byId.get(start.state.deck[0]); const id = 'answer-original';
 f.solo('resposta', [String(first.answer + 1), '1'], A, CHAT, id);
 const reopened = createQuiz(f.db, f.options);
 assert.equal(reopened.solo(CHAT, A, 'Alfa', 'resposta', [String(first.answer + 1), '1'], id), null);
 assert.equal(f.solo('partida').state.round, 1);
 assert.throws(() => f.solo('resposta', ['1', '1']), /rodada/);
 assert.equal(f.solo('partida').state.round, 1);
});

test('actual SQLite reopen preserves category progress, tournament consent and deadlines', t => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-quiz-persist-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
 const file = path.join(directory, 'game.sqlite'), f = fixture(t, file);
 f.solo('iniciar', ['tecnologia', 'medio']); f.tournament('criar', ['ciencia']); f.tournament('entrar', [], B); f.tournament('iniciar');
 const before = f.state(); f.db.close();
 const db = new Database(file); t.after(() => db.close()); const quiz = createQuiz(db, f.options);
 assert.equal(quiz.solo(CHAT, A, 'Alfa', 'partida', [], 'reopen-solo').state.category, 'tecnologia');
 const after = quiz.tournament(CHAT, A, 'Alfa', 'status', [], 'reopen-tournament').state;
 assert.equal(after.id, before.id); assert.deepEqual(after.members, before.members); assert.equal(after.deadline, before.deadline);
});

test('tournament requires two voluntary participants, owner starts, one answer per round and bounded rewards', t => {
 const f = fixture(t); f.tournament('criar', ['matematica', 'medio']);
 assert.throws(() => f.tournament('iniciar'), /dois participantes/);
 f.tournament('entrar', [], B); assert.throws(() => f.tournament('iniciar', [], B), /organizador/);
 assert.throws(() => f.tournament('entrar', [], B), /já está inscrito/); f.tournament('iniciar');
 for (let round = 0; round < 5; round++) {
  const question = catalog.byId.get(f.state().deck[round]), args = [String(question.answer + 1), String(round + 1)];
  f.tournament('responder', args); assert.throws(() => f.tournament('responder', args), /já respondeu/);
  f.tournament('responder', args, B);
 }
 const state = f.state(); assert.equal(state.status, 'finished'); assert.ok(state.members.every(p => p.points === 75 && p.correct === 5));
 assert.equal(f.quiz.history(CHAT, A)[0].mode, 'torneio'); assert.equal(f.quiz.ranking(CHAT).length, 2);
 const points = f.db.prepare('SELECT SUM(points) points FROM arcade_scores WHERE chat_jid=?').get(CHAT).points;
 f.tournament('status'); assert.equal(f.db.prepare('SELECT SUM(points) points FROM arcade_scores WHERE chat_jid=?').get(CHAT).points, points);
 assert.throws(() => f.tournament('responder', ['1', '5']), /não está em andamento/);
 assert.throws(() => f.tournament('criar', ['ciencia']), /dez minutos/);
});

test('tournament timeouts move only valid periods and stale round tokens cannot answer a later question', t => {
 const f = fixture(t); f.tournament('criar', ['geografia']); f.tournament('entrar', [], B); f.tournament('iniciar');
 f.time += ROUND_MS;
 assert.throws(() => f.tournament('responder', ['1', '1']), /rodada atual/);
 const updated = f.tournament('status'); assert.equal(updated.state.round, 1);
 f.time += ROUND_MS * 10; const finished = f.tournament('status'); assert.equal(finished.state.status, 'finished');
 assert.ok(finished.state.members.every(p => p.points === 0));
 assert.equal(f.events.length, 0, 'A inscrição sem responder não completa missões.');
 const rows = f.db.prepare('SELECT COUNT(*) total FROM quiz_plus_results WHERE chat_jid=?').get(CHAT).total;
 f.tournament('status'); assert.equal(f.db.prepare('SELECT COUNT(*) total FROM quiz_plus_results WHERE chat_jid=?').get(CHAT).total, rows);
});

test('tournament has ten seats, handles departure and prevents cross-chat or private participation', t => {
 const f = fixture(t); f.tournament('criar', ['ciencia']);
 for (let i = 2; i <= 10; i++) f.tournament('entrar', [], `55119999999${i}@s.whatsapp.net`);
 assert.throws(() => f.tournament('entrar', [], '5511888888888@s.whatsapp.net'), /dez participantes/);
 assert.throws(() => f.tournament('entrar', [], B, OTHER), /Não há torneio/);
 assert.throws(() => f.tournament('criar', ['ciencia'], B, B), /grupos/);
 const leaving = '551199999992@s.whatsapp.net'; f.tournament('sair', [], leaving);
 assert.equal(f.state().members.length, 9); f.tournament('cancelar'); assert.equal(f.state().status, 'cancelled');
 assert.equal(f.db.prepare('SELECT COUNT(*) total FROM quiz_plus_results').get().total, 0);
});

test('unmapped LID is rejected; confirmed aliases share progress only inside their own chat', t => {
 const f = fixture(t), lid = '999999999999999@lid';
 assert.throws(() => f.solo('iniciar', ['ciencia'], lid), /confirmar seu número/);
 f.db.prepare('INSERT INTO universal_wallet_aliases VALUES(?,?,?)').run(CHAT, lid, A);
 f.solo('iniciar', ['ciencia'], A);
 assert.equal(f.solo('partida', [], lid).state.jid, A);
 assert.throws(() => f.solo('partida', [], lid, OTHER), /confirmar seu número/);
 assert.throws(() => f.solo('partida', [], A, OTHER), /Inicie/);
});

test('failure during reward transaction rolls back result, score, event and session completion', t => {
 const f = fixture(t); let result = f.solo('iniciar', ['ciencia', 'medio']);
 for (let round = 0; round < 4; round++) result = f.solo('resposta', [String(catalog.byId.get(result.state.deck[round]).answer + 1), String(round + 1)]);
 f.db.exec("CREATE TRIGGER fail_quiz_score BEFORE INSERT ON arcade_scores BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 const args = [String(catalog.byId.get(result.state.deck[4]).answer + 1), '5'];
 assert.throws(() => f.solo('resposta', args, A, CHAT, 'final-answer'), /fixture failure/);
 assert.equal(f.db.prepare('SELECT COUNT(*) total FROM quiz_plus_results').get().total, 0);
 assert.equal(f.db.prepare('SELECT 1 FROM quiz_plus_events WHERE event_id=?').get('final-answer'), undefined);
 assert.equal(f.solo('partida').state.round, 4);
 f.db.exec('DROP TRIGGER fail_quiz_score'); assert.equal(f.solo('resposta', args, A, CHAT, 'final-answer').type, 'solo-finished');
});

test('expanded wrapper preserves every legacy quiz invocation and registers the same aliases', async t => {
 const f = fixture(t), legacyCalls = [], sent = [];
 const previous = { name: 'quiz', aliases: ['perguntalegada'], category: 'jogos', handler: async (_sock, ctx) => legacyCalls.push(ctx.args) };
 let registered; register(def => { registered = def; }, new Map([['quiz', previous]]));
 assert.deepEqual(registered.aliases, previous.aliases); assert.equal(registered.replace, true);
 const handler = createExpandedQuizHandler({ legacy: previous.handler, service: f.quiz, prefix: () => '$$', now: () => f.time });
 const sock = { sendMessage: async (_jid, payload) => sent.push(payload.text) };
 for (const args of [[], ['1'], ['status'], ['parar'], ['novo'], ['iniciar']]) await handler(sock, { jid: CHAT, sender: A, msg: { key: { id: f.next() } }, args });
 assert.equal(legacyCalls.length, 6);
 await handler(sock, { jid: CHAT, sender: A, msg: { key: { id: f.next() } }, args: ['categorias'] });
 assert.ok(sent.at(-1).includes('$$quiz')); assert.ok(sent.at(-1).includes('Categoria') || sent.at(-1).includes('CATEGORIAS'));
 await handler(sock, { jid: CHAT, sender: A, pushName: 'Alfa', msg: { key: { id: f.next() } }, args: ['iniciar', 'ciencia', 'facil'] });
 assert.ok(sent.at(-1).replace(/[*`]/g, '').includes('$$quiz resposta')); assert.ok(!sent.at(-1).includes('undefined'));
});

test('active tournament rendering never leaks an answer or per-round correctness', t => {
 const f = fixture(t); f.tournament('criar', ['ciencia']); f.tournament('entrar', [], B); f.tournament('iniciar');
 const state = f.state(), question = catalog.byId.get(state.deck[0]); f.tournament('responder', [String(question.answer + 1), '1']);
 const rendered = renderResult(f.tournament('status'), '!', f.time);
 assert.ok(!rendered.includes(question.explanation)); assert.ok(!rendered.includes('Acertou')); assert.ok(!rendered.includes('Resposta:'));
 assert.match(rendered, /1\/2/);
});

test('concurrent reprocessing of the final answer produces one result and one score credit', async t => {
 const f = fixture(t); let result = f.solo('iniciar', ['tecnologia', 'dificil']);
 for (let round = 0; round < 4; round++) result = f.solo('resposta', [String(catalog.byId.get(result.state.deck[round]).answer + 1), String(round + 1)]);
 const args = [String(catalog.byId.get(result.state.deck[4]).answer + 1), '5'];
 const results = await Promise.all(Array.from({ length: 4 }, () => Promise.resolve().then(() => f.solo('resposta', args, A, CHAT, 'concurrent-final'))));
 assert.equal(results.filter(Boolean).length, 1);
 assert.equal(f.db.prepare('SELECT COUNT(*) total FROM quiz_plus_results').get().total, 1);
 assert.equal(f.db.prepare('SELECT points FROM arcade_scores WHERE chat_jid=? AND user_jid=?').get(CHAT, A).points, 100);
});

test('real mission records commit with quiz completion and roll back if mission persistence fails', t => {
 const f = fixture(t), quiz = createQuiz(f.db, { now: () => f.time, pick: () => 0 });
 let result = quiz.solo(CHAT, A, 'Alfa', 'iniciar', ['ciencia', 'facil'], 'mission-start');
 for (let round = 0; round < 4; round++) result = quiz.solo(CHAT, A, 'Alfa', 'resposta', [String(catalog.byId.get(result.state.deck[round]).answer + 1), String(round + 1)], 'mission-answer-' + round);
 const args = [String(catalog.byId.get(result.state.deck[4]).answer + 1), '5'];
 f.db.exec("CREATE TRIGGER reject_quiz_mission BEFORE INSERT ON mission_events WHEN NEW.kind='arcade_complete' BEGIN SELECT RAISE(ABORT,'mission write failure'); END");
 assert.throws(() => quiz.solo(CHAT, A, 'Alfa', 'resposta', args, 'mission-final'), /mission write failure/);
 assert.equal(f.db.prepare('SELECT COUNT(*) total FROM mission_events').get().total, 0);
 assert.equal(f.db.prepare('SELECT COUNT(*) total FROM quiz_plus_results').get().total, 0);
 f.db.exec('DROP TRIGGER reject_quiz_mission'); quiz.solo(CHAT, A, 'Alfa', 'resposta', args, 'mission-final');
 assert.equal(f.db.prepare('SELECT COUNT(*) total FROM mission_events').get().total, 2);
 assert.equal(f.db.prepare('SELECT COUNT(*) total FROM quiz_plus_results').get().total, 1);
});
