'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moonPhase, moonEffects, applyBattleEffects } = require('../src/wolves/moon-phase');

// Known new moon: January 6, 2000 at 18:14 UTC — fraction should be ~0
test('lua nova no epoch de referência', () => {
  const EPOCH = 947182440000;
  const phase = moonPhase(EPOCH);
  assert.equal(phase.id, 'nova');
  assert.ok(phase.fraction < 0.001, `fraction esperada ≈ 0, foi ${phase.fraction}`);
});

// Half-cycle forward should be near full moon
test('meia lua depois do epoch é lua cheia', () => {
  const EPOCH = 947182440000;
  const PERIOD = 29.53058867 * 86400000;
  const phase = moonPhase(EPOCH + PERIOD / 2);
  assert.equal(phase.id, 'cheia');
});

test('quarto crescente entre nova e cheia', () => {
  const EPOCH = 947182440000;
  const PERIOD = 29.53058867 * 86400000;
  const phase = moonPhase(EPOCH + PERIOD * 0.2);
  assert.equal(phase.id, 'quarto_crescente');
});

test('quarto minguante entre cheia e nova', () => {
  const EPOCH = 947182440000;
  const PERIOD = 29.53058867 * 86400000;
  const phase = moonPhase(EPOCH + PERIOD * 0.7);
  assert.equal(phase.id, 'quarto_minguante');
});

test('fração fica em [0, 1)', () => {
  for (let i = 0; i < 100; i++) {
    const { fraction } = moonPhase(Date.now() + i * 1_000_000);
    assert.ok(fraction >= 0 && fraction < 1, `fraction fora do intervalo: ${fraction}`);
  }
});

test('efeitos da lua cheia: attackMult 1.2, counterMult 1.0, xpMult 1.0', () => {
  const EPOCH = 947182440000;
  const PERIOD = 29.53058867 * 86400000;
  const moon = moonEffects(EPOCH + PERIOD / 2);
  assert.equal(moon.attackMult, 1.2);
  assert.equal(moon.counterMult, 1.0);
  assert.equal(moon.xpMult, 1.0);
});

test('efeitos do quarto crescente: attackMult 0.9', () => {
  const EPOCH = 947182440000;
  const PERIOD = 29.53058867 * 86400000;
  const moon = moonEffects(EPOCH + PERIOD * 0.2);
  assert.equal(moon.attackMult, 0.9);
});

test('efeitos do quarto minguante: counterMult 1.15', () => {
  const EPOCH = 947182440000;
  const PERIOD = 29.53058867 * 86400000;
  const moon = moonEffects(EPOCH + PERIOD * 0.7);
  assert.equal(moon.counterMult, 1.15);
});

test('applyBattleEffects: lua cheia aumenta dano de ataque em 20%', () => {
  const moon = { attackMult: 1.2, counterMult: 1.0 };
  const base = { atkDamage: 10, defDamage: 5, atkWolvesAfter: 95, defWolvesAfter: 90, winner: 'attacker' };
  const result = applyBattleEffects(base, { attackerWolves: 100, defenderWolves: 100, moon });
  assert.equal(result.atkDamage, 12); // 10 × 1.2
  assert.equal(result.defDamage, 5);  // sem mudança
  assert.equal(result.defWolvesAfter, 88); // 100 - 12
  assert.equal(result.atkWolvesAfter, 95); // 100 - 5
});

test('applyBattleEffects: quarto minguante aumenta contra-ataque em 15%', () => {
  const moon = { attackMult: 1.0, counterMult: 1.15 };
  const base = { atkDamage: 10, defDamage: 10, atkWolvesAfter: 90, defWolvesAfter: 90, winner: 'draw' };
  const result = applyBattleEffects(base, { attackerWolves: 100, defenderWolves: 100, moon });
  assert.equal(result.defDamage, 12); // 10 × 1.15 arredondado
  assert.equal(result.atkDamage, 10); // sem mudança
});

test('applyBattleEffects: cristal do poder (atkPower 1.25) multiplica dano', () => {
  const moon = { attackMult: 1.0, counterMult: 1.0 };
  const base = { atkDamage: 20, defDamage: 5, atkWolvesAfter: 95, defWolvesAfter: 80, winner: 'attacker' };
  const result = applyBattleEffects(base, { attackerWolves: 100, defenderWolves: 100, moon, atkPower: 1.25 });
  assert.equal(result.atkDamage, 25); // 20 × 1.25
});

test('applyBattleEffects: escudo da batalha (defArmor 0.7) reduz dano recebido', () => {
  const moon = { attackMult: 1.0, counterMult: 1.0 };
  const base = { atkDamage: 20, defDamage: 5, atkWolvesAfter: 95, defWolvesAfter: 80, winner: 'attacker' };
  const result = applyBattleEffects(base, { attackerWolves: 100, defenderWolves: 100, moon, defArmor: 0.7 });
  assert.equal(result.atkDamage, 14); // 20 × 0.7
  assert.equal(result.defWolvesAfter, 86); // 100 - 14
});

test('applyBattleEffects: dano mínimo de ataque é 1', () => {
  const moon = { attackMult: 0.001, counterMult: 0.001 };
  const base = { atkDamage: 1, defDamage: 1, atkWolvesAfter: 99, defWolvesAfter: 99, winner: 'draw' };
  const result = applyBattleEffects(base, { attackerWolves: 100, defenderWolves: 100, moon });
  assert.ok(result.atkDamage >= 1);
});

test('todas as fases têm emoji, nome e description definidos', () => {
  const EPOCH = 947182440000;
  const PERIOD = 29.53058867 * 86400000;
  const offsets = [0, 0.0625, 0.4375, 0.5625, 0.9375].map(f => EPOCH + PERIOD * f);
  for (const ts of offsets) {
    const moon = moonEffects(ts);
    assert.ok(moon.emoji, `sem emoji para fraction ${moon.fraction}`);
    assert.ok(moon.name, `sem nome para fraction ${moon.fraction}`);
    assert.ok(typeof moon.description === 'string' && moon.description.length > 5);
    assert.ok(typeof moon.attackMult === 'number');
    assert.ok(typeof moon.counterMult === 'number');
    assert.ok(typeof moon.xpMult === 'number');
  }
});
