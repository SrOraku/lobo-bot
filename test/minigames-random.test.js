'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomInt } = require('node:crypto');
const engine = require('../src/games/engine');
const modules = require('../src/games/registry');
const random = require('../src/games/random');

// Sorteio reproduzível para comparar partidas diferentes.
function picker(seed) { const state = { seed }; return n => random.int(state, n); }
const starts = (game, count = 40) => Array.from({ length: count }, (_, i) => modules.get(game).start(picker(i + 1)));

test('caça-palavras: palavras, posições e direções mudam a cada partida e estão mesmo no tabuleiro', () => {
  const game = modules.get('cacapalavras');
  const games = starts('cacapalavras');
  const grid = s => s.rows.join('');
  assert.ok(new Set(games.map(grid)).size > 35, 'tabuleiros diferentes');
  assert.ok(new Set(games.flatMap(s => s.words)).size > 10, 'muitas palavras diferentes aparecem');
  const directions = new Set();
  for (const s of [...games, game.start(() => 0)]) {
    assert.equal(s.words.length, 4); assert.equal(s.rows.length, game.SIZE);
    assert.ok(s.rows.every(row => /^[A-Z]{8}$/.test(row)));
    for (const word of s.words) {
      // Procura a palavra em todas as direções e conta quais apareceram.
      let found = null;
      for (let r = 0; r < game.SIZE && !found; r++) for (let c = 0; c < game.SIZE && !found; c++) for (const [dr, dc] of game.DIRECTIONS) {
        if ([...word].every((ch, k) => s.rows[r + dr * k]?.[c + dc * k] === ch)) { found = `${dr},${dc}`; break; }
      }
      assert.ok(found, `${word} precisa estar no tabuleiro`);
      directions.add(found);
    }
  }
  assert.ok(directions.size >= 6, `várias direções, inclusive diagonais e invertidas (${[...directions]})`);
  assert.ok(![...games].every(s => s.words.join() === 'LOBO,LUA,ROSA'), 'não é mais sempre LOBO, LUA e ROSA');
  // A tela mostra a lista e risca as encontradas.
  const s = games[0], result = engine.advance('cacapalavras', s, s.words[0].toLowerCase());
  assert.match(game.view(result.state), new RegExp(`~${s.words[0]}~ ✓`)); assert.match(game.view(result.state), /Faltam `?3`?/);
});

test('anagrama: embaralhamento de verdade, nunca igual à palavra', () => {
  const { words } = modules.get('anagrama');
  assert.ok(words.length >= 25);
  const games = starts('anagrama', 200);
  for (const s of [...games, modules.get('anagrama').start(() => 0)]) {
    assert.notEqual(s.scrambled, s.word);
    assert.deepEqual([...s.scrambled].sort(), [...s.word].sort(), 'mesmas letras');
  }
  // O jogo antigo só movia a 1ª letra para o fim: agora isso é exceção, não regra.
  const rotated = games.filter(s => s.scrambled === s.word.slice(1) + s.word[0]).length;
  assert.ok(rotated < 10, `rotação simples em ${rotated} de 200`);
  assert.ok(new Set(games.map(s => s.word)).size > 15);
});

test('digitação: frase sorteada e copiar e colar não vale', () => {
  const game = modules.get('digitacao');
  assert.ok(game.phrases.length >= 15);
  assert.ok(new Set(starts('digitacao').map(s => s.text)).size > 8, 'frases diferentes');
  const s = game.start(() => 3);
  const shown = game.view(s);
  const copied = /`([^`]+)`/.exec(shown)[1];
  assert.notEqual(copied, s.text, 'a frase exibida tem um marcador invisível');
  assert.equal(copied.replace(/​/g, ''), s.text);
  const pasted = engine.advance('digitacao', s, copied);
  assert.equal(pasted.finished, false); assert.equal(pasted.points, 0); assert.match(pasted.text, /Copiar e colar não vale/);
  const typed = engine.advance('digitacao', s, s.text.toUpperCase());
  assert.equal(typed.won, true); assert.equal(typed.points, 25);
});

test('matemática e batalha de números: cada rodada é sorteada, não uma sequência fixa', () => {
  for (const id of ['matematica', 'batalhanumeros']) {
    const sequences = new Set();
    for (const first of starts(id, 30)) {
      let s = first; const seen = [];
      for (let round = 0; round < 5; round++) {
        seen.push(`${s.a},${s.b}`);
        assert.ok(s.a >= 1 && s.a <= 20 && s.b >= 1 && s.b <= 20);
        s = engine.advance(id, s, id === 'matematica' ? String(s.a + s.b) : (s.a * 3 === s.b * 2 ? 'empate' : s.a * 3 > s.b * 2 ? '1' : '2')).state;
      }
      sequences.add(seen.slice(1).join('|'));
    }
    assert.ok(sequences.size > 25, `${id}: rodadas seguintes variam (${sequences.size}/30)`);
    // O jogo antigo derivava a 2ª rodada da 1ª: a = a % 20 + 1. Isso não vale mais.
    const predictable = starts(id, 50).filter(s => { const next = engine.advance(id, s, '1').state; return next.a === s.a % 20 + 1 && next.b === (s.b * 3) % 20 + 1; }).length;
    assert.ok(predictable < 5, `${id}: ${predictable} de 50 seguiram a sequência antiga`);
  }
});

test('2048: peça nova em casa sorteada e às vezes vale 4', () => {
  const spawns = new Set(), values = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const s = { board: [2, 2, ...Array(14).fill(0)], score: 0, seed };
    const after = engine.advance('2048', s, 'esquerda').state;
    assert.equal(after.board[0], 4);
    const spawned = after.board.findIndex((value, index) => index > 0 && value);
    spawns.add(spawned); values.add(after.board[spawned]);
  }
  assert.ok(spawns.size >= 12, `nasce em várias casas (${spawns.size})`);
  assert.deepEqual([...values].sort(), [2, 4]);
  const first = starts('2048', 40);
  assert.ok(new Set(first.map(s => s.board.join())).size > 30, 'tabuleiro inicial varia');
  assert.ok(first.every(s => s.board.filter(Boolean).length === 2));
});

test('partidas salvas antes desta versão (sem semente) continuam jogáveis', () => {
  const legacy = { round: 2, correct: 1, a: 3, b: 4 };
  const result = engine.advance('matematica', legacy, '7');
  assert.equal(result.state.correct, 2); assert.equal(result.state.round, 3); assert.ok(Number.isInteger(result.state.seed));
  assert.deepEqual(legacy, { round: 2, correct: 1, a: 3, b: 4 }, 'o estado original não é alterado');
  const board = engine.advance('2048', { board: [2, 2, ...Array(14).fill(0)], score: 0 }, 'esquerda').state.board;
  assert.equal(board.filter(Boolean).length, 2);
  const oldWords = { words: ['LOBO', 'LUA', 'ROSA'], rows: ['LOBOAB', 'CLUADF', 'EROSAG'], found: [] };
  assert.equal(engine.advance('cacapalavras', oldWords, 'lobo').text, '✅ *Palavra encontrada!*');
});

test('o motor de verdade (crypto.randomInt) também gera partidas válidas', () => {
  for (let i = 0; i < 50; i++) {
    for (const id of ['cacapalavras', 'anagrama', 'digitacao', 'matematica', 'batalhanumeros', '2048']) {
      const s = engine.start(id, randomInt);
      assert.ok(modules.get(id).view(s));
      if (id === 'cacapalavras') assert.equal(s.words.length, 4);
      if (id === 'anagrama') assert.notEqual(s.scrambled, s.word);
    }
  }
});
