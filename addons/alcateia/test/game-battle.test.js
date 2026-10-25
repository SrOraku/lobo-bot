import test from 'node:test';
import assert from 'node:assert/strict';
import {

  applyBoosts, calculateDamage, getBattleResult, resolveBattle, generateBattleMessage,
} from '../src/game/battle.js';

function plain(value, prefix = '!') { return String(value).split(prefix).join('\u0000').replace(/[*_`]/g, '').split('\u0000').join(prefix); }

const NOW = 1_800_000_000_000;
const A = '5543920030769@s.whatsapp.net';
const D = '5543996375955@s.whatsapp.net';
const player = (overrides = {}) => ({
  jid: A, number: A.split('@')[0], name: 'Lobo Rosa', hp: 100,
  attack: 10, defense: 8, counter: 2, coins: 100, boosts: [], ...overrides,
});
const boost = (type, value, overrides = {}) => ({
  type, effect: 'multiplier', value, activatedAt: NOW - 1000, expiresAt: NOW + 3_599_000,
  ...overrides,
});

test('official damage formula includes attack, enemy defense and own counter', () => {
  assert.equal(calculateDamage(player(), player(), { now: NOW }), 6.6);
  assert.equal(calculateDamage(player({ attack: 40, counter: 20 }), player({ defense: 40 }), { now: NOW }), 26);
});

test('negative damage is clamped to zero and rounded to two decimals', () => {
  assert.equal(calculateDamage(player({ attack: 0, counter: 0 }), player({ defense: 40 }), { now: NOW }), 0);
  assert.equal(calculateDamage(player({ attack: 1.123, counter: 0 }), player({ defense: 0 }), { now: NOW }), 1.35);
});

test('active boosts apply once and leave the base formation unchanged', () => {
  const own = player({ attack: 40, boosts: [boost('attack', 0.2), boost('counter', 0.3)] });
  const enemy = player({ defense: 40, boosts: [boost('defense', 0.2)] });
  const snapshot = structuredClone(own);
  assert.equal(applyBoosts(own, NOW).attack, 48);
  assert.equal(applyBoosts(own, NOW).counter, 2.6);
  assert.equal(calculateDamage(own, enemy, { now: NOW }), 20.5);
  assert.deepEqual(own, snapshot);
  assert.equal(enemy.defense, 40);
});

test('boost activation and expiry boundaries are exact and repeated types do not stack', () => {
  const own = player({ boosts: [
    boost('attack', 0.2), boost('attack', 0.1), boost('defense', 0.2, { expiresAt: NOW }),
    boost('counter', 0.3, { activatedAt: NOW + 1 }),
  ] });
  assert.equal(applyBoosts(own, NOW).attack, 12);
  assert.equal(applyBoosts(own, NOW).defense, 8);
  assert.equal(applyBoosts(own, NOW).counter, 2);
  assert.equal(applyBoosts(player({ boosts: [boost('attack', 0.2, { activatedAt: NOW })] }), NOW).attack, 12);
  assert.equal(applyBoosts(own, NOW + 3_599_000).attack, 10);
});

test('malformed, unsupported and negative boosts do not affect the battle', () => {
  const own = player({ boosts: [
    null, boost('attack', Number.NaN), boost('attack', -1), boost('hp', 100),
    boost('attack', 0.2, { effect: 'unknown' }), boost('attack', 0.2, { expiresAt: Infinity }),
  ] });
  assert.equal(applyBoosts(own, NOW).attack, 10);
});

test('HP classification preserves the 20 and 50 percent boundaries', () => {
  assert.equal(getBattleResult(100), 'win');
  assert.equal(getBattleResult(50.01), 'win');
  assert.equal(getBattleResult(50), 'draw');
  assert.equal(getBattleResult(20), 'draw');
  assert.equal(getBattleResult(19.99), 'loss');
  assert.equal(getBattleResult(0), 'loss');
});

test('same HP band produces one consistent draw even with unequal HP', () => {
  const result = resolveBattle(player(), player({ jid: D, hp: 90 }), { now: NOW });
  assert.equal(result.outcome, 'draw');
  assert.equal(result.attacker.hpAfter, 93.4);
  assert.equal(result.defender.hpAfter, 83.4);
  assert.equal(result.attacker.hpClass, 'win');
  assert.equal(result.defender.hpClass, 'win');
  assert.equal(result.attacker.outcome, 'draw');
  assert.equal(result.defender.outcome, 'draw');
  assert.equal(result.attacker.coinChange, 10);
  assert.equal(result.defender.coinsAfter, 110);
});

test('different HP bands award one winner and one loser with safe coin deductions', () => {
  const result = resolveBattle(player(), player({ jid: D, hp: 40, coins: 7 }), { now: NOW });
  assert.equal(result.outcome, 'attacker');
  assert.equal(result.attacker.outcome, 'win');
  assert.equal(result.defender.outcome, 'loss');
  assert.equal(result.attacker.coinsAfter, 150);
  assert.equal(result.defender.coinChange, -7);
  assert.equal(result.defender.coinsAfter, 0);
  const reversed = resolveBattle(player({ hp: 40 }), player({ jid: D }), { now: NOW });
  assert.equal(reversed.outcome, 'defender');
  assert.equal(reversed.attacker.coinChange, -25);
});

test('both damage values are simultaneous and HP stays between zero and 100', () => {
  const result = resolveBattle(player({ hp: 1, attack: 40, counter: 20 }), player({ jid: D, hp: 1, attack: 40, counter: 20 }), { now: NOW });
  assert.equal(result.attacker.damage, 51.6);
  assert.equal(result.defender.damage, 51.6);
  assert.equal(result.attacker.hpAfter, 0);
  assert.equal(result.defender.hpAfter, 0);
  assert.equal(result.outcome, 'draw');
  const bounded = resolveBattle(player({ hp: 200, attack: 0, counter: 0 }), player({ jid: D, hp: -50, attack: 0, counter: 0 }), { now: NOW });
  assert.equal(bounded.attacker.hpAfter, 100);
  assert.equal(bounded.defender.hpAfter, 0);
});

test('battle resolution does not mutate players or boost records', () => {
  const attacker = player({ boosts: [boost('attack', 0.2)] });
  const defender = player({ jid: D, hp: 25, boosts: [boost('defense', 0.2)] });
  const before = structuredClone({ attacker, defender });
  const result = resolveBattle(attacker, defender, { now: NOW });
  assert.deepEqual({ attacker, defender }, before);
  assert.equal(result.at, NOW);
});

test('non-finite attributes and unsafe balances fail instead of producing NaN results', () => {
  for (const value of [NaN, Infinity, undefined, '10']) {
    assert.throws(() => calculateDamage(player({ attack: value }), player(), { now: NOW }), /finito/);
  }
  assert.throws(() => calculateDamage(player({ defense: -1 }), player(), { now: NOW }), /negativo/);
  assert.throws(() => resolveBattle(player({ hp: NaN }), player(), { now: NOW }), /HP/);
  assert.throws(() => resolveBattle(player({ coins: -1 }), player(), { now: NOW }), /Moedas/);
  assert.throws(() => resolveBattle(player({ coins: Number.MAX_SAFE_INTEGER }), player(), { now: NOW }), /saldo/);
});

test('battle message shows both participants, damage, final HP, result and coin changes', () => {
  const result = resolveBattle(player(), player({ jid: D, number: D.split('@')[0], name: 'Lobo Prata', hp: 40 }), { now: NOW });
  const message = generateBattleMessage(result);
  assert.match(plain(message), /BATALHA DA ALCATEIA/);
  assert.ok(message.startsWith('╭━━ 🌹'));
  assert.match(message, /▰/);
  assert.match(message, /`\+50` WoK coin/);
  assert.match(message, /`-25` WoK coin/);
  assert.match(plain(message), /Lobo Rosa/);
  assert.match(plain(message), /Lobo Prata/);
  assert.match(plain(message), /5543920030769/);
  assert.match(plain(message), /Danos: 6\.6 × 6\.6/);
  assert.match(plain(message), /HP final: 93\.4\/100 × 33\.4\/100/);
  assert.match(plain(message), /Vitória de Lobo Rosa/);
  assert.match(plain(message), /\+50 WoK coin/);
  assert.match(plain(message), /-25 WoK coin/);
  assert.doesNotMatch(message, /[+-]\d+ moedas/);
  assert.doesNotMatch(message, /🌹 Dev:/);
});
