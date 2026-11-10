import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_ITEMS, buyItem, grantBoost } from '../src/game/shop.js';
import { createPlayer, trainPlayer } from '../src/game/players.js';
import { applyBoosts } from '../src/game/battle.js';
import { GameService } from '../src/game/service.js';
import { defaultGame } from '../src/store.js';
import { validatePlayer } from '../src/game/validation.js';
import { createGameCommandHandler } from '../src/game/commands.js';

const HOUR = 3_600_000;
const FIRST = '5511999999999@s.whatsapp.net', SECOND = '5521999999999@s.whatsapp.net';
function player(overrides = {}) { return Object.assign(createPlayer({ jid: FIRST, name: 'Guardião' }, 0), { coins: 5_000 }, overrides); }

test('catálogo lunar preserva os quatro itens originais e oferece oito novas escolhas funcionais', () => {
  assert.equal(SHOP_ITEMS.length, 12);
  assert.equal(new Set(SHOP_ITEMS.map(item => item.id)).size, SHOP_ITEMS.length);
  assert.deepEqual(SHOP_ITEMS.slice(0, 4).map(({ id, price, type, value, duration }) => ({ id, price, type, value, duration })), [
    { id: '1', price: 100, type: 'attack', value: 0.2, duration: HOUR },
    { id: '2', price: 100, type: 'defense', value: 0.2, duration: HOUR },
    { id: '3', price: 150, type: 'counter', value: 0.3, duration: HOUR },
    { id: '4', price: 200, type: 'training', value: 1, duration: 0 },
  ]);
  for (const item of SHOP_ITEMS) {
    assert.ok(Object.isFrozen(item));
    assert.ok(item.description.length > 10);
    assert.ok(Number.isSafeInteger(item.price) && item.price > 0);
  }
});

test('itens de recuperação podem tirar a Alcateia de zero HP e cobram uma única compra', () => {
  for (const [id, hp] of [['5', 25], ['6', 60], ['7', 100]]) {
    const p = player({ hp: 0 });
    const item = SHOP_ITEMS.find(entry => entry.id === id);
    const result = buyItem(p, id, { now: 1_000 });
    assert.equal(p.hp, hp);
    assert.equal(result.healthRecovered, hp);
    assert.equal(result.hp, hp);
    assert.equal(result.coins, 5_000 - item.price);
    assert.match(result.message, /curandeira/);
    assert.deepEqual(p.boosts, []);
  }
});

test('recuperação respeita 100 HP e rejeita compra sem efeito sem alterar moedas ou estado', () => {
  const p = player({ hp: 99.5, lastBattle: 1_000, lastTraining: 500, normalTrainingAt: 500 });
  const result = buyItem(p, '7', { now: 2_000 });
  assert.equal(result.healthRecovered, 0.5);
  assert.equal(p.hp, 100);
  assert.deepEqual([p.lastBattle, p.lastTraining, p.normalTrainingAt], [1_000, 500, 500]);
  for (const id of ['5', '6', '7']) {
    const before = structuredClone(p);
    assert.throws(() => buyItem(p, id, { now: 3_000 }), { code: 'HP_FULL' });
    assert.deepEqual(p, before);
  }
});

test('compras novas recusam saldo insuficiente, banimento e parâmetros inválidos sem mutação parcial', () => {
  for (const item of SHOP_ITEMS.slice(4)) {
    const poor = player({ hp: 0, coins: item.price - 1 });
    const before = structuredClone(poor);
    assert.throws(() => buyItem(poor, item.id, { now: 1_000 }), { code: 'BALANCE' });
    assert.deepEqual(poor, before);
    const banned = player({ hp: 0, banned: true });
    const bannedBefore = structuredClone(banned);
    assert.throws(() => buyItem(banned, item.id, { now: 1_000 }), { code: 'BANNED' });
    assert.deepEqual(banned, bannedBefore);
  }
  for (const [id, now] of [['999', 0], ['0', 0], ['5', -1], ['8', Number.MAX_SAFE_INTEGER], ['11', NaN]]) {
    const p = player({ hp: 20 });
    const before = structuredClone(p);
    assert.throws(() => buyItem(p, id, { now }));
    assert.deepEqual(p, before);
  }
});

test('boosts novos usam valor e duração próprios, expiram e não acumulam multiplicadores', () => {
  for (const [id, stat, expected] of [['8', 'attack', 13], ['9', 'defense', 10.4], ['10', 'counter', 2.8]]) {
    const p = player();
    const base = p[stat];
    buyItem(p, id, { now: 0 });
    assert.equal(applyBoosts(p, 0)[stat], expected);
    assert.equal(applyBoosts(p, 2 * HOUR)[stat], base);
    buyItem(p, id, { now: 1_000 });
    assert.equal(p.boosts.filter(boost => boost.type === stat).length, 1);
    assert.equal(p.boosts[0].expiresAt, 2 * HOUR + 1_000);
    assert.equal(p[stat], base);
  }
  const p = player();
  buyItem(p, '8', { now: 0 });
  buyItem(p, '1', { now: 2_000 });
  assert.equal(p.boosts.length, 1);
  assert.equal(p.boosts[0].value, 0.2);
  assert.equal(p.boosts[0].expiresAt, HOUR + 2_000);
  assert.equal(grantBoost(p, 'defense', 3_000).expiresAt, HOUR + 3_000);
});

test('ritual fortalece os três atributos sem reduzir bônus superiores nem multiplicar pilhas', () => {
  const p = player();
  buyItem(p, '8', { now: 0 });
  const result = buyItem(p, '11', { now: 1_000 });
  assert.equal(result.boosts.length, 3);
  assert.deepEqual(p.boosts.map(boost => boost.type).sort(), ['attack', 'counter', 'defense']);
  const attack = p.boosts.find(boost => boost.type === 'attack');
  assert.equal(attack.value, 0.3);
  assert.equal(attack.expiresAt, 2 * HOUR);
  assert.deepEqual(p.boosts.filter(boost => boost.type !== 'attack').map(boost => boost.expiresAt), [HOUR * 1.5 + 1_000, HOUR * 1.5 + 1_000]);
  assert.deepEqual([applyBoosts(p, 1_000).attack, applyBoosts(p, 1_000).defense, applyBoosts(p, 1_000).counter], [13, 9.6, 2.6]);
  buyItem(p, '11', { now: 2_000 });
  assert.equal(p.boosts.length, 3);
  assert.equal(p.boosts.find(boost => boost.type === 'attack').value, 0.3);
  assert.equal(p.boosts.find(boost => boost.type === 'defense').expiresAt, HOUR * 1.5 + 2_000);
});

test('expedição fornece três treinos extras e mantém cooldown normal e limite de lobisomens', () => {
  const p = player({ normalTrainingAt: 0, lastTraining: 0 });
  buyItem(p, '12', { now: 1_000 });
  assert.equal(p.extraTraining, 3);
  for (const now of [2_000, 3_000, 4_000]) {
    assert.equal(trainPlayer(p, { now, rng: () => 0 }).usedExtra, true);
  }
  assert.equal(p.extraTraining, 0);
  assert.equal(p.normalTrainingAt, 0);
  assert.equal(p.wolves, 35);
  assert.throws(() => trainPlayer(p, { now: 5_000, rng: () => 0 }), { code: 'COOLDOWN' });
  const full = player({ wolves: 100 });
  const before = structuredClone(full);
  assert.throws(() => buyItem(full, '12', { now: 1_000 }), /100/);
  assert.deepEqual(full, before);
  const overflow = player({ extraTraining: Number.MAX_SAFE_INTEGER - 2 });
  const overflowBefore = structuredClone(overflow);
  assert.throws(() => buyItem(overflow, '12', { now: 1_000 }));
  assert.deepEqual(overflow, overflowBefore);
});

test('compra de cura permite voltar à batalha real e os efeitos sobrevivem à serialização do perfil', () => {
  const game = defaultGame();
  const p = player({ hp: 0 });
  const enemy = createPlayer({ jid: SECOND, name: 'Sentinela' }, 0);
  game.players[p.jid] = p;
  game.players[enemy.jid] = enemy;
  const service = new GameService({ store: null });
  const request = { command: 'ataque', args: [], actor: { jid: p.jid }, target: { jid: enemy.jid }, chatId: '120600000003@g.us' };
  assert.throws(() => service.dispatch(game, request, 1_000), { code: 'HP' });
  const purchase = service.dispatch(game, { command: 'comprar', args: ['7'], actor: { jid: p.jid } }, 2_000);
  assert.equal(purchase.healthRecovered, 100);
  assert.equal(service.dispatch(game, request, 3_000).type, 'battle');
  buyItem(p, '10', { now: 4_000 });
  const restored = JSON.parse(JSON.stringify(p));
  assert.deepEqual(validatePlayer(restored), p);
  assert.equal(restored.hp, p.hp);
  assert.equal(applyBoosts(restored, 4_001).counter, applyBoosts(p, 4_001).counter);
});

test('loja lunar permite navegar sem cadastrar jogador e rejeita páginas inválidas', () => {
  const game = defaultGame(), service = new GameService({ store: null });
  const request = { command: 'loja', args: [], actor: { jid: FIRST } };
  const first = service.dispatch(game, request, 1_000);
  const last = service.dispatch(game, { ...request, args: ['2'] }, 2_000);
  assert.deepEqual([first.page, first.totalPages, last.page], [1, 2, 2]);
  assert.deepEqual([...first.items, ...last.items].map(item => item.id), SHOP_ITEMS.map(item => item.id));
  assert.ok(first.items.length <= 8 && last.items.length <= 8);
  for (const args of [['0'], ['3'], ['abc'], ['1', '2']]) {
    assert.throws(() => service.dispatch(game, { ...request, args }, 3_000));
  }
  assert.deepEqual(game.players, {});
});

test('mensagens da loja mostram duração real, cura específica e navegação com prefixo personalizado', async () => {
  const game = defaultGame(), service = new GameService({ store: null }), replies = [];
  const ctx = {
    command: 'loja', args: [], senderPhone: FIRST, displayName: 'Guardião', chatId: '120600000003@g.us',
    config: { prefix: '!!' }, msg: { message: { conversation: '!!loja' } },
    reply: async text => replies.push(text),
  };
  const page = service.dispatch(game, { command: 'loja', args: [], actor: { jid: FIRST } }, 1_000);
  const handler = result => createGameCommandHandler({ service: { execute: async () => result }, backupManager: {}, now: () => 1_000 });
  await handler(page)(ctx);
  const plain = text => text.replace(/[*_`]/g, '');
  assert.match(plain(replies[0]), /1 hora/);
  assert.match(plain(replies[0]), /2 horas/);
  assert.match(plain(replies[0]), /25 HP da Alcateia/);
  assert.ok(plain(replies[0]).includes('!!loja 2'));
  assert.ok(plain(replies[0]).includes('!!comprar ID'));
  const p = player({ hp: 0 }), purchase = buyItem(p, '6', { now: 1_000 });
  await handler({ type: 'purchase', player: p, ...purchase })({ ...ctx, command: 'comprar', args: ['6'] });
  assert.match(plain(replies[1]), /60 HP da Alcateia/);
  assert.match(plain(replies[1]), /90 WoK coin/);
  assert.doesNotMatch(replies[1], /undefined|NaN|Boost ativo/);
});
