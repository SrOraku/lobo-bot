import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlayer, registerPlayer, requirePlayer, addWolves, trainPlayer, setFormation, rankPlayers,
} from '../src/game/players.js';
import { SHOP_ITEMS, buyItem } from '../src/game/shop.js';
import { createClan, joinClan, clanProfile } from '../src/game/clans.js';
import { runEvent } from '../src/game/events.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NUMBERS = ['5511999999999', '5521999999999', '5531999999999', '5541999999999', '5551999999999', '5561999999999'];

function identity(index = 0) {
  const number = NUMBERS[index];
  return { name: `Lobo ${index + 1}`, number, jid: `${number}@s.whatsapp.net` };
}

function player(index = 0, now = 0) { return createPlayer(identity(index), now); }
function game() { return { players: {}, clans: {} }; }

function formationIsValid(p) {
  assert.ok(p.attack >= 0 && p.attack <= 40);
  assert.ok(p.defense >= 0 && p.defense <= 40);
  assert.ok(p.counter >= 0 && p.counter <= 20);
  assert.ok(p.attack + p.defense + p.counter <= p.wolves);
  assert.ok(p.wolves <= 100);
}

test('registration creates the complete initial player and does not duplicate rewards', () => {
  const state = game();
  const p = registerPlayer(state, identity(), 1000);
  assert.equal(state.players[p.jid], p);
  assert.equal(p.number, NUMBERS[0]);
  assert.equal(p.name, 'Lobo 1');
  assert.deepEqual([p.hp, p.wolves, p.attack, p.defense, p.counter, p.coins], [100, 20, 10, 8, 2, 100]);
  assert.deepEqual([p.wins, p.losses, p.draws], [0, 0, 0]);
  assert.equal(p.clan, null);
  assert.deepEqual(p.boosts, []);
  assert.equal(p.banned, false);
  assert.deepEqual([p.lastTraining, p.lastBattle, p.lastEvent], [null, null, null]);
  assert.deepEqual([p.createdAt, p.updatedAt], [1000, 1000]);
  const snapshot = structuredClone(state);
  assert.throws(() => registerPlayer(state, identity(), 2000), /já faz parte/i);
  assert.deepEqual(state, snapshot);
});

test('registration accepts only a Brazilian number matching the trusted phone JID', () => {
  for (const invalid of [
    { name: 'Estrangeiro', number: '14155552671', jid: '14155552671@s.whatsapp.net' },
    { name: 'Curto', number: '55123', jid: '55123@s.whatsapp.net' },
    { ...identity(), jid: `${NUMBERS[0]}@lid` },
    { ...identity(), jid: `${NUMBERS[1]}@s.whatsapp.net` },
  ]) assert.throws(() => createPlayer(invalid));
});

test('missing players and banned players cannot use the playable domain', () => {
  const state = game();
  assert.throws(() => requirePlayer(state, identity().jid), /start|registr|alcateia/i);
  const p = registerPlayer(state, identity());
  p.banned = true;
  assert.throws(() => requirePlayer(state, p.jid), /banido/i);
  assert.equal(requirePlayer(state, p.jid, { allowBanned: true }), p);
  const before = structuredClone(p);
  for (const action of [
    () => trainPlayer(p), () => setFormation(p, 'A', 5), () => buyItem(p, '1'),
    () => createClan(state, p, 'Banidos'), () => runEvent(p),
  ]) assert.throws(action, /banido/i);
  assert.deepEqual(p, before);
});

test('training distributes five new wolves across available positions', () => {
  const p = player();
  const values = [0, 0.5, 0.999, 0, 0.5];
  let index = 0;
  trainPlayer(p, { now: 0, rng: () => values[index++] });
  assert.equal(p.wolves, 25);
  assert.equal(p.attack + p.defense + p.counter, 25);
  assert.ok(p.attack > 10 && p.defense > 8 && p.counter > 2);
  assert.equal(p.lastTraining, 0);
  assert.equal(p.normalTrainingAt, 0);
  formationIsValid(p);
});

test('training cooldown handles timestamp zero and expires exactly after one hour', () => {
  const p = player();
  trainPlayer(p, { now: 0, rng: () => 0 });
  const before = structuredClone(p);
  assert.throws(() => trainPlayer(p, { now: HOUR - 1, rng: () => 0 }), /aguarde/i);
  assert.deepEqual(p, before);
  trainPlayer(p, { now: HOUR, rng: () => 0 });
  assert.equal(p.wolves, 30);
  assert.equal(p.lastTraining, HOUR);
});

test('training near the wolf limit adds only remaining vacancies and fills unsaturated roles', () => {
  const p = player();
  Object.assign(p, { wolves: 97, attack: 40, defense: 40, counter: 17 });
  trainPlayer(p, { now: 1000, rng: () => 0.999 });
  assert.deepEqual([p.wolves, p.attack, p.defense, p.counter], [100, 40, 40, 20]);
  const before = structuredClone(p);
  assert.throws(() => trainPlayer(p, { now: HOUR + 1000, rng: () => 0 }), /100/);
  assert.deepEqual(p, before);
});

test('wolf additions cannot overflow the total or formation capacities', () => {
  const p = player();
  addWolves(p, 1000, () => 0.999, 1234);
  assert.deepEqual([p.wolves, p.attack, p.defense, p.counter], [100, 40, 40, 20]);
  formationIsValid(p);
  const before = structuredClone(p);
  for (const value of [0, -1, 1.5, NaN, Infinity, '2e1']) assert.throws(() => addWolves(p, value));
  assert.deepEqual(p, before);
});

test('an extra training credit permits one immediate training without changing the normal cooldown', () => {
  const p = player();
  p.coins = 500;
  trainPlayer(p, { now: 0, rng: () => 0 });
  buyItem(p, '4', { now: 100 });
  assert.equal(p.extraTraining, 1);
  assert.equal(p.normalTrainingAt, 0);
  trainPlayer(p, { now: 200, rng: () => 0.5 });
  assert.equal(p.extraTraining, 0);
  assert.equal(p.lastTraining, 200);
  assert.equal(p.normalTrainingAt, 0);
  assert.equal(p.wolves, 30);
  assert.throws(() => trainPlayer(p, { now: HOUR - 1, rng: () => 0 }), /aguarde/i);
  trainPlayer(p, { now: HOUR, rng: () => 0 });
  assert.equal(p.wolves, 35);
});

test('formation enforces per-position and total wolf limits without mutating invalid requests', () => {
  const p = player();
  setFormation(p, 'A', 0, 1);
  assert.equal(p.attack, 0);
  setFormation(p, 'd', 18, 2);
  assert.equal(p.defense, 18);
  const before = structuredClone(p);
  for (const [position, quantity] of [
    ['A', 41], ['D', 41], ['C', 21], ['A', 1], ['A', -1],
    ['D', 1.5], ['C', NaN], ['X', 1], ['A', '1e1'],
  ]) {
    assert.throws(() => setFormation(p, position, quantity, 3));
    assert.deepEqual(p, before);
  }
  formationIsValid(p);
});

test('a full army permits exactly 40 attack, 40 defense and 20 counter', () => {
  const p = player();
  p.wolves = 100;
  setFormation(p, 'A', 40);
  setFormation(p, 'D', 40);
  setFormation(p, 'C', 20);
  assert.equal(p.attack + p.defense + p.counter, 100);
  formationIsValid(p);
});

test('ranking uses wins, coins, wolves, fewer losses and excludes banned players', () => {
  const state = game();
  const entries = NUMBERS.map((_n, index) => registerPlayer(state, identity(index)));
  Object.assign(entries[0], { wins: 2, coins: 0 });
  Object.assign(entries[1], { wins: 1, coins: 300, wolves: 20, losses: 0 });
  Object.assign(entries[2], { wins: 1, coins: 200, wolves: 60, losses: 4 });
  Object.assign(entries[3], { wins: 1, coins: 200, wolves: 50, losses: 0 });
  Object.assign(entries[4], { wins: 1, coins: 200, wolves: 50, losses: 1 });
  Object.assign(entries[5], { wins: 999, coins: 999999, banned: true });
  assert.deepEqual(rankPlayers(state).map(p => p.jid), entries.slice(0, 5).map(p => p.jid));
});

test('shop exposes the specified prices and charges only successful purchases', () => {
  assert.deepEqual(SHOP_ITEMS.map(item => item.price), [100, 100, 150, 200]);
  const p = player();
  const before = structuredClone(p);
  assert.throws(() => buyItem(p, '3', { now: 100 }), /saldo|moedas/i);
  assert.deepEqual(p, before);
  assert.throws(() => buyItem(p, '9', { now: 100 }), /item/i);
  assert.deepEqual(p, before);
  buyItem(p, '2', { now: 100 });
  assert.equal(p.coins, 0);
  assert.deepEqual(p.boosts, [{ type: 'defense', effect: 'multiplier', value: 0.2, activatedAt: 100, expiresAt: HOUR + 100 }]);
  assert.deepEqual([p.attack, p.defense, p.counter], [10, 8, 2]);
});

test('repeated temporary purchases replace the same boost instead of stacking its effect', () => {
  const p = player();
  p.coins = 500;
  buyItem(p, '1', { now: 0 });
  buyItem(p, '3', { now: 500 });
  buyItem(p, '1', { now: 1000 });
  assert.equal(p.coins, 150);
  assert.equal(p.boosts.filter(boost => boost.type === 'attack').length, 1);
  assert.equal(p.boosts.find(boost => boost.type === 'attack').expiresAt, HOUR + 1000);
  assert.equal(p.boosts.find(boost => boost.type === 'counter').value, 0.3);
});

test('extra training purchases refuse a full army without debiting coins', () => {
  const p = player();
  p.coins = 500;
  p.wolves = 100;
  const before = structuredClone(p);
  assert.throws(() => buyItem(p, '4', { now: 1000 }), /100/);
  assert.deepEqual(p, before);
});

test('clan creation charges 300 and preserves the leader-player membership relation', () => {
  const state = game();
  const p = registerPlayer(state, identity());
  p.coins = 500;
  const clan = createClan(state, p, 'Lobos da Lua', 1000);
  assert.equal(p.coins, 200);
  assert.equal(p.clan, clan.key);
  assert.equal(state.clans[p.clan], clan);
  assert.equal(clan.leader, p.jid);
  assert.deepEqual(clan.members, [p.jid]);
  assert.deepEqual([clan.wins, clan.losses, clan.coins, clan.createdAt], [0, 0, 0, 1000]);
  const profile = clanProfile(state, p);
  assert.equal(profile.ranking, 1);
  profile.members.push('outside');
  assert.deepEqual(clan.members, [p.jid]);
});

test('clan names are unique across case and players cannot join a second clan', () => {
  const state = game();
  const leader = registerPlayer(state, identity());
  const member = registerPlayer(state, identity(1));
  leader.coins = member.coins = 500;
  const first = createClan(state, leader, 'Lobos da Lua', 1000);
  const beforeDuplicate = structuredClone(state);
  assert.throws(() => createClan(state, member, 'lobos da lua', 2000), /existe/i);
  assert.deepEqual(state, beforeDuplicate);
  joinClan(state, member, 'LOBOS DA LUA', 3000);
  assert.equal(member.clan, first.key);
  assert.deepEqual(first.members, [leader.jid, member.jid]);
  const beforeSecond = structuredClone(state);
  assert.throws(() => createClan(state, member, 'Outra Lua', 4000), /já participa/i);
  assert.throws(() => joinClan(state, member, 'Lobos da Lua', 4000), /já participa/i);
  assert.deepEqual(state, beforeSecond);
});

test('clan invalid names, unknown clans and insufficient creation balances do not modify state', () => {
  const state = game();
  const p = registerPlayer(state, identity());
  const before = structuredClone(state);
  assert.throws(() => createClan(state, p, 'Lobos', 1000), /saldo|moedas/i);
  assert.throws(() => createClan(state, p, '', 1000));
  assert.throws(() => joinClan(state, p, 'Inexistente', 1000), /existe/i);
  assert.throws(() => clanProfile(state, p), /clã/i);
  assert.deepEqual(state, before);
});

test('a clan named __proto__ remains a real clan without changing dictionary prototypes', () => {
  const state = game();
  const p = registerPlayer(state, identity());
  p.coins = 500;
  const originalPrototype = Object.getPrototypeOf(state.clans);
  const clan = createClan(state, p, '__proto__', 100);
  assert.equal(Object.getPrototypeOf(state.clans), originalPrototype);
  assert.equal(Object.hasOwn(state.clans, clan.key), true);
  assert.equal(clanProfile(state, p).leader, p.jid);
  assert.equal({}.leader, undefined);
});

test('lunar event awards coins and enforces the 24 hour boundary including timestamp zero', () => {
  const p = player();
  runEvent(p, { now: 0, rng: () => 0 });
  assert.equal(p.coins, 180);
  assert.equal(p.lastEvent, 0);
  const before = structuredClone(p);
  assert.throws(() => runEvent(p, { now: DAY - 1, rng: () => 0 }), /aguarde/i);
  assert.deepEqual(p, before);
  runEvent(p, { now: DAY, rng: () => 0 });
  assert.equal(p.coins, 260);
  assert.equal(p.lastEvent, DAY);
});

test('event wolf and HP rewards respect their upper limits', () => {
  const wolves = player();
  Object.assign(wolves, { wolves: 98, attack: 40, defense: 40, counter: 18 });
  runEvent(wolves, { now: 100, rng: () => 0.2 });
  assert.equal(wolves.wolves, 100);
  formationIsValid(wolves);
  const hp = player();
  hp.hp = 90;
  runEvent(hp, { now: 100, rng: () => 0.6 });
  assert.equal(hp.hp, 100);
  assert.equal(hp.lastEvent, 100);
  const zeroHp = player();
  zeroHp.hp = 0;
  runEvent(zeroHp, { now: 100, rng: () => 0.6 });
  assert.equal(zeroHp.hp, 25);
});

test('event can grant a one-hour boost without charging coins', () => {
  const p = player();
  runEvent(p, { now: 500, rng: () => 0.4 });
  assert.equal(p.coins, 100);
  assert.equal(p.boosts.length, 1);
  assert.ok(['attack', 'defense', 'counter'].includes(p.boosts[0].type));
  assert.equal(p.boosts[0].expiresAt, HOUR + 500);
});

test('an event without reward still starts cooldown without changing player wealth', () => {
  const p = player();
  runEvent(p, { now: 100, rng: () => 0.8 });
  assert.equal(p.coins, 100);
  assert.equal(p.wolves, 20);
  assert.equal(p.hp, 100);
  assert.equal(p.lastEvent, 100);
  const before = structuredClone(p);
  assert.throws(() => runEvent(p, { now: 101, rng: () => 0 }), /aguarde/i);
  assert.deepEqual(p, before);
});
