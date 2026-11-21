import test from 'node:test';
import assert from 'node:assert/strict';
import { expedition } from '../src/game/expedition.js';
import { workshop } from '../src/rp/workshop.js';
import { createPlayer } from '../src/game/players.js';
import { ensureRP } from '../src/rp/state.js';
import { defaultGame } from '../src/store.js';

function crew(size = 3) {
  const game = defaultGame();
  const players = Array.from({ length: size }, (_, i) => {
    const p = createPlayer({ jid: (5511999990000 + i) + '@s.whatsapp.net', name: 'Lobo ' + i }, 0);
    game.players[p.jid] = p;
    return p;
  });
  const move = (p, args, now = 1) => expedition(game, players[p], { args, chatId: '123@g.us' }, now, () => 0);
  const start = (now = 0) => {
    move(0, ['criar', 'estrategista'], now);
    const id = game.expedition.id;
    players.forEach((_, i) => { if (i) move(i, ['entrar', id, 'guardiao'], now); });
    move(0, ['iniciar'], now);
    return id;
  };
  return { game, players, move, start };
}

test('lobby membership, leadership, capacity, stale IDs and timeout are enforced', () => {
  const f = crew(6);
  f.move(0, ['criar']);
  const id = f.game.expedition.id;
  assert.throws(() => f.move(1, ['entrar', 'old']), /ID/);
  assert.throws(() => f.move(0, ['iniciar']), /mais um/);
  for (let i = 1; i < 5; i++) f.move(i, ['entrar', id]);
  assert.throws(() => f.move(5, ['entrar', id]), /vagas/);
  assert.throws(() => f.move(1, ['iniciar']), /líder/);
  f.move(0, ['sair']);
  f.move(1, ['iniciar']);
  const expired = 3 * 3600_000;
  assert.throws(() => f.move(2, ['escolher', id + '-1', 'sinalizar'], expired), /criar/);
  f.move(2, ['criar'], expired);
  assert.notEqual(f.game.expedition.id, id);
});

test('scouting forecasts the exact result and idle members cannot collect rewards', () => {
  const f = crew(3), id = f.start();
  const before = structuredClone(f.game);
  const prediction = f.move(0, ['explorar']);
  assert.deepEqual(f.game, before);
  assert.match(prediction.lines.join(' '), /sinalizar → luz 4\/7 • vigor 3/);
  f.move(0, ['escolher', id + '-1', 'sinalizar']);
  assert.equal(f.game.expedition.vigor, 3);
  f.move(1, ['escolher', id + '-2', 'acampar']);
  assert.throws(() => f.move(1, ['escolher', id + '-3', 'atravessar'], 1000), /sua vez/);
  const end = f.move(1, ['escolher', id + '-3', 'atravessar'], 300001);
  assert.match(end.lines[0], /acendeu/);
  assert.deepEqual(f.players.map(p => p.coins), [150, 160, 100]);
  assert.equal(f.players[2].fieldJournal, undefined);
  const second = f.start(400000);
  for (const [i, act] of ['sinalizar', 'acampar', 'atravessar'].entries()) f.move(i, ['escolher', second + '-' + (i + 1), act], 401000 + i);
  assert.deepEqual(f.players.map(p => p.coins), [150, 160, 150]);
  assert.equal(f.players[0].fieldJournal.victories, 2);
});

test('choices can exhaust a crew and a mismatched supply cannot be consumed', () => {
  const f = crew(3), id = f.start();
  ensureRP(f.players[0], 0).inventory.tala = 1;
  assert.throws(() => f.move(0, ['escolher', id + '-1', 'sinalizar', 'tala']), /não combina/);
  assert.equal(f.players[0].rp.inventory.tala, 1);
  for (let i = 0; i < 3; i++) f.move(i, ['escolher', id + '-' + (i + 1), 'sinalizar']);
  assert.match(f.game.expedition.summary[0], /outra noite/);
  assert.ok(f.players.every(p => p.coins === 100 && p.fieldJournal.victories === 0));
});

test('crafting checks all materials, energy and stock before consuming them, with a profession discount', () => {
  const f = crew(), p = f.players[0], rp = ensureRP(p, 0);
  rp.jobId = 'programador'; rp.inventory.prisma = 1;
  assert.throws(() => workshop(p, ['fabricar', 'lampiao'], 1), /ingredientes/);
  rp.inventory.resina = 1; rp.energy = 2;
  assert.throws(() => workshop(p, ['fabricar', 'lampiao'], 1), /energia/);
  rp.energy = 4; rp.inventory.lampiao = 999;
  assert.throws(() => workshop(p, ['fabricar', 'lampiao'], 1), /Estoque/);
  assert.deepEqual(rp.inventory, { prisma: 1, resina: 1, lampiao: 999 });
  rp.inventory.lampiao = 0;
  workshop(p, ['fabricar', 'lampiao'], 1);
  assert.deepEqual(rp.inventory, { lampiao: 1 }); assert.equal(rp.energy, 1);
});
