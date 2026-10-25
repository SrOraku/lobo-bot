'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createArcade } = require('../src/games/service');
const { start, advance, view } = require('../src/games/engine');
const { WORDS, QUIZ, ROUTES, ENDINGS } = require('../src/games/content');
const { CHARACTERS, QUESTIONS, nextQuestion } = require('../src/games/characters');

test('forca valida letras, impede repetição e finaliza vitória e derrota', () => {
  let state = start('forca', () => 0);
  assert.throws(() => advance('forca', state, '123'), /letra/);
  const first = advance('forca', state, 'a'); state = first.state;
  assert.throws(() => advance('forca', state, 'á'), /usada/);
  let result;
  for (const letter of new Set(WORDS[0][0])) if (letter !== 'a') { result = advance('forca', state, letter); state = result.state; }
  assert.equal(result.finished, true); assert.equal(result.won, true);
  state = start('forca', () => 0);
  for (const letter of 'bdfghj') { result = advance('forca', state, letter); state = result.state; }
  assert.equal(result.finished, true); assert.equal(result.won, false);
});
test('número secreto oferece pistas e respeita sete tentativas', () => {
  let state = start('adivinhar', () => 49);
  assert.throws(() => advance('adivinhar', state, '1.5'), /inteiro/);
  let result = advance('adivinhar', state, '40'); state = result.state;
  assert.equal(state.low, 41);
  assert.throws(() => advance('adivinhar', state, '39'), /pistas/);
  result = advance('adivinhar', state, '50'); assert.equal(result.won, true);
  state = start('adivinhar', () => 99);
  for (let i = 1; i <= 7; i++) { result = advance('adivinhar', state, String(i)); state = result.state; }
  assert.equal(result.finished, true); assert.equal(result.won, false);
});
test('quiz tem cinco perguntas distintas, explicações e placar correto', () => {
  let state = start('quiz', () => 0), result;
  assert.equal(new Set(state.deck).size, 5);
  assert.ok(view('quiz', state, '?').includes('?quiz'));
  for (let i = 0; i < 5; i++) {
    const answer = QUIZ[state.deck[state.round]][2] + 1;
    result = advance('quiz', state, String(answer)); state = result.state;
  }
  assert.equal(result.points, 50); assert.equal(result.won, true); assert.equal(result.finished, true);
});
test('todas as rotas de aventura são válidas e oito finais são alcançáveis', () => {
  const visited = new Set();
  function visit(node) {
    if (visited.has(node)) return; visited.add(node);
    if (ENDINGS[node]) return;
    assert.ok(ROUTES[node], node);
    for (const next of ROUTES[node][2]) visit(next);
  }
  visit('inicio');
  for (const ending of Object.keys(ENDINGS)) assert.ok(visited.has(ending), ending);
  let state = start('aventura');
  state = advance('aventura', state, '1').state;
  state = advance('aventura', state, '1').state;
  assert.equal(advance('aventura', state, '1').won, true);
});
test('akinator identifica todo personagem pelas respostas, sem sorteio de hipótese', () => {
  for (let target = 0; target < CHARACTERS.length; target++) {
    let state = start('akinator'), loops = 0;
    while (state.candidates.length > 1 && nextQuestion(state) !== -1) {
      assert.ok(loops++ < QUESTIONS.length);
      const key = QUESTIONS[nextQuestion(state)][0];
      state = advance('akinator', state, CHARACTERS[target][1].includes(key) ? 'sim' : 'não').state;
    }
    assert.deepEqual(state.candidates, [target]);
    assert.equal(advance('akinator', state, 'sim').won, true);
  }
});
test('partidas persistem, isolam chats, deduplicam pontos e aplicam cooldown', t => {
  const db = new Database(':memory:'); t.after(() => db.close()); runMigrations(db);
  let clock = 100000, id = 0;
  let arcade = createArcade(db, { now: () => clock, pick: () => 0 });
  const play = (chat, input, event = String(++id)) => arcade.play(chat, 'user', 'Lobo', 'adivinhar', input, event, '!');
  play('A', ''); play('B', '');
  arcade = createArcade(db, { now: () => clock, pick: () => 0 });
  assert.ok(play('A', 'status').includes('*Tentativas:* `0/7`'));
  assert.throws(() => play('A', '500'), /inteiro/);
  assert.ok(play('A', '1', 'win').includes('Acertou'));
  assert.equal(play('A', '1', 'win'), null);
  assert.equal(arcade.profile('A', 'user').points, 37);
  assert.equal(arcade.profile('B', 'user'), undefined);
  assert.throws(() => play('A', ''), /Aguarde/);
  clock += 61000; play('A', '');
  assert.ok(play('A', 'parar').includes('preservados'));
  assert.equal(arcade.profile('A', 'user').points, 37);
  assert.equal(arcade.ranking('A').length, 1);
  assert.ok(play('B', 'status').includes('*Tentativas:* `0/7`'));
});
