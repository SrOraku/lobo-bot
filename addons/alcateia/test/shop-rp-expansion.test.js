import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../src/game/players.js';
import { ensureRP } from '../src/rp/state.js';
import { JOBS, getJob, chooseJob, work } from '../src/rp/jobs.js';
import { RP_ITEMS, RP_SHOP_CATEGORIES, REST_COOLDOWN_MS, buyRPItem, useRPItem,
  equippedRPItem, workEquipment, restRP } from '../src/rp/shop.js';

const HOUR = 3_600_000;
const LEGACY = [
  ['pao', 5], ['refeicao', 20], ['banquete', 45], ['agua', 5], ['cafe', 10],
  ['energetico', 25], ['remedio', 30], ['kitmedico', 70], ['chocolate', 15],
  ['flores', 25], ['presente', 60], ['alianca', 150], ['apartamento', 1500],
  ['casa', 3500], ['mansao', 10000], ['bicicleta', 300], ['moto', 1500],
  ['carro', 5000], ['carroluxo', 12000],
];

function player(second = false) {
  const jid = second ? '5521999999999@s.whatsapp.net' : '5511999999999@s.whatsapp.net';
  const value = createPlayer({ jid, name: second ? 'Amigo' : 'Explorador' }, 0);
  ensureRP(value, 0);
  value.coins = 100_000;
  value.rp.experience = 1000;
  return value;
}

test('expanded catalog preserves all previous IDs/prices and exposes usable categories', () => {
  assert.deepEqual(RP_ITEMS.slice(0, LEGACY.length).map(item => [item.id, item.price]), LEGACY);
  assert.equal(new Set(RP_ITEMS.map(item => item.id)).size, RP_ITEMS.length);
  assert.ok(RP_ITEMS.length >= 50);
  const jobCategories = new Set(JOBS.map(job => job.category));
  for (const item of RP_ITEMS) {
    assert.ok(Number.isSafeInteger(item.price) && item.price > 0);
    assert.ok(Object.isFrozen(item));
    assert.ok(Object.values(RP_SHOP_CATEGORIES).some(types => types.includes(item.type)), item.id);
    if (item.type === 'equipment') {
      assert.ok(item.categories.length > 0);
      for (const category of item.categories) assert.ok(jobCategories.has(category), category);
    }
  }
});

test('new consumables charge once and restore only their RP stats with caps', () => {
  for (const item of RP_ITEMS.slice(LEGACY.length).filter(item => ['food', 'drink', 'medicine'].includes(item.type))) {
    const p = player();
    p.hp = 30;
    Object.assign(p.rp, { hunger: 95, energy: 98, health: 90 });
    const before = structuredClone(p.rp);
    const initialCoins = p.coins;
    buyRPItem(p, item.id, 1, { now: 1 });
    const used = useRPItem(p, item.id, { now: 2 });
    assert.equal(p.coins, initialCoins - item.price, item.id);
    assert.equal(p.hp, 30, 'RP consumables never heal Alcateia HP');
    for (const stat of ['hunger', 'energy', 'health']) {
      assert.equal(p.rp[stat], Math.min(100, before[stat] + (item.effects[stat] || 0)), item.id + ':' + stat);
    }
    assert.equal(p.rp.inventory[item.id], undefined);
    assert.ok(used.scene.includes(item.name));
  }
});

test('full stats do not waste a new item or change wallet and timestamps', () => {
  const p = player();
  buyRPItem(p, 'marmita', 2, { now: 1 });
  const before = structuredClone(p);
  assert.throws(() => useRPItem(p, 'marmita', { now: 2 }), /limite/i);
  assert.deepEqual(p, before);
  p.rp.health = 0;
  buyRPItem(p, 'balsamo', 1, { now: 3 });
  useRPItem(p, 'balsamo', { now: 4 });
  assert.equal(p.rp.health, 75, 'medicine can recover a character at zero RP health');
});

test('new gifts benefit the mentioned character without transferring coins or granting self rewards', () => {
  const p = player(), target = player(true);
  buyRPItem(p, 'trofeu', 2, { now: 1 });
  const before = structuredClone(p);
  assert.throws(() => useRPItem(p, 'trofeu', { target: p, now: 2 }), /outro/i);
  assert.deepEqual(p, before);
  target.rp.reputation = Number.MAX_SAFE_INTEGER - 3;
  const targetCoins = target.coins;
  const result = useRPItem(p, 'trofeu', { target, now: 3 });
  assert.equal(result.effects.reputation, 3);
  assert.equal(target.rp.reputation, Number.MAX_SAFE_INTEGER);
  assert.equal(target.coins, targetCoins);
  assert.equal(p.rp.reputation, 0);
  assert.equal(p.rp.inventory.trofeu, 1);
  const capped = structuredClone(p);
  assert.throws(() => useRPItem(p, 'trofeu', { target, now: 4 }), /limite/i);
  assert.deepEqual(p, capped);
});

test('equipment must be owned, retains inventory and gives no immediate reward or stacked bonuses', () => {
  const p = player();
  const before = structuredClone(p);
  assert.throws(() => useRPItem(p, 'notebook', { now: 1 }), /não possui/i);
  assert.deepEqual(p, before);
  buyRPItem(p, 'notebook', 2, { now: 2 });
  const paid = p.coins, experience = p.rp.experience;
  const equipped = useRPItem(p, 'notebook', { now: 3 });
  assert.equal(equipped.equipped, true);
  assert.equal(p.rp.inventory.notebook, 2);
  assert.equal(p.coins, paid);
  assert.equal(p.rp.experience, experience);
  assert.equal(equippedRPItem(p).id, 'notebook');
  const active = structuredClone(p);
  assert.throws(() => useRPItem(p, 'notebook', { now: 4 }), /já está em uso/i);
  assert.deepEqual(p, active);
  assert.equal(workEquipment(p, 'Saúde'), null);
  assert.equal(workEquipment(p, 'Tecnologia').id, 'notebook');
  buyRPItem(p, 'kitclinico', 1, { now: 5 });
  const target = player(true);
  assert.throws(() => useRPItem(p, 'kitclinico', { now: 6, target }), /próprio/i);
  const switched = useRPItem(p, 'kitclinico', { now: 7 });
  assert.equal(switched.previousEquipment, 'notebook');
  assert.equal(equippedRPItem(p).id, 'kitclinico');
  assert.equal(workEquipment(p, 'Tecnologia'), null);
});

test('matching equipment modestly rewards work, mismatch and tool switching preserve cooldown', () => {
  const p = player();
  chooseJob(p, 'programador', 0);
  buyRPItem(p, 'kitclinico', 1, { now: 0 });
  buyRPItem(p, 'notebook', 2, { now: 0 });
  useRPItem(p, 'kitclinico', { now: 0 });
  const beforeFirst = p.coins;
  const first = work(p, { now: 0 });
  assert.equal(first.equipmentBonus, 0);
  assert.equal(first.experienceGain, 10);
  assert.equal(p.coins, beforeFirst + getJob('programador').salary);
  useRPItem(p, 'notebook', { now: 1 });
  const switched = structuredClone(p);
  assert.throws(() => work(p, { now: HOUR - 1 }), /aguarde/i);
  assert.deepEqual(p, switched);
  const beforeSecond = p.coins;
  const result = work(p, { now: HOUR });
  assert.equal(result.equipmentBonus, 8);
  assert.equal(result.equipmentExperience, 2);
  assert.equal(result.experienceGain, 12);
  assert.equal(p.coins, beforeSecond + getJob('programador').salary + 8);
  assert.equal(p.rp.inventory.notebook, 2, 'duplicate owned tools never multiply the reward');
});

test('without equipment or vehicle old work costs remain, vehicles only ease energy use', () => {
  for (const [vehicle, expectedCost] of [[null, 10], ['bicicleta', 9], ['motorhome', 4]]) {
    const p = player();
    chooseJob(p, 'entregador', 0);
    if (vehicle) buyRPItem(p, vehicle, 1, { now: 0 });
    const before = p.coins;
    const result = work(p, { now: 1 });
    assert.equal(result.energyCost, expectedCost);
    assert.equal(p.rp.energy, 100 - expectedCost);
    assert.equal(p.rp.hunger, 90);
    assert.equal(result.experienceGain, 10);
    assert.equal(p.coins, before + getJob('entregador').salary);
  }
});

test('new home and vehicle tiers remain paid upgrades with no downgrade or bulk-buy shortcut', () => {
  const p = player();
  buyRPItem(p, 'apartamento', 1, { now: 0 });
  buyRPItem(p, 'bicicleta', 1, { now: 0 });
  buyRPItem(p, 'refugiolunar', 1, { now: 1 });
  buyRPItem(p, 'motorhome', 1, { now: 1 });
  assert.equal(p.coins, 100_000 - 1500 - 300 - 30_000 - 32_000);
  assert.equal(p.rp.home.level, 5);
  assert.equal(p.rp.vehicle.level, 6);
  const before = structuredClone(p);
  for (const [id, qty] of [['chacara', 1], ['jipe', 1], ['refugiolunar', 2]]) {
    assert.throws(() => buyRPItem(p, id, qty, { now: 2 }));
    assert.deepEqual(p, before);
  }
});

test('home rest recovers capped RP stats, preserves coins/hunger/Alcateia HP and persists cooldown', () => {
  const p = player();
  buyRPItem(p, 'refugiolunar', 1, { now: 0 });
  Object.assign(p.rp, { energy: 85, health: 96, hunger: 40 });
  p.hp = 10;
  const coins = p.coins;
  const result = restRP(p, { now: 0 });
  assert.deepEqual(result.effects, { energy: 15, health: 4 });
  assert.equal(result.cooldownMs, REST_COOLDOWN_MS);
  assert.equal(p.rp.energy, 100);
  assert.equal(p.rp.health, 100);
  assert.equal(p.rp.hunger, 40);
  assert.equal(p.hp, 10);
  assert.equal(p.coins, coins);
  const reloaded = JSON.parse(JSON.stringify(p));
  reloaded.rp.energy = 50;
  const waiting = structuredClone(reloaded);
  assert.throws(() => restRP(reloaded, { now: REST_COOLDOWN_MS - 1 }), /aguarde/i);
  assert.deepEqual(reloaded, waiting);
  restRP(reloaded, { now: REST_COOLDOWN_MS });
  assert.equal(reloaded.rp.energy, 90);
});

test('rest requires a home, rejects jail/full stats and never consumes cooldown on rejection', () => {
  const p = player();
  assert.throws(() => restRP(p, { now: 1 }), /moradia/i);
  buyRPItem(p, 'apartamento', 1, { now: 1 });
  const full = structuredClone(p);
  assert.throws(() => restRP(p, { now: 2 }), /limite/i);
  assert.deepEqual(p, full);
  p.rp.energy = 50;
  p.rp.jailedUntil = 10;
  const jailed = structuredClone(p);
  assert.throws(() => restRP(p, { now: 9 }), /prisão/i);
  assert.deepEqual(p, jailed);
  restRP(p, { now: 10 });
  assert.equal(p.rp.energy, 70);
});

test('legacy saves gain only missing fields and keep owner data, balances, inventory and cooldowns', () => {
  const p = player();
  delete p.rp.equipment;
  delete p.rp.lastRest;
  p.rp.inventory.pao = 4;
  p.rp.lastWork = 123;
  p.rp.familyId = 'old-family';
  const old = structuredClone(p);
  ensureRP(p, 1000);
  assert.deepEqual(p, { ...old, rp: { ...old.rp, equipment: null, lastRest: null } });
  p.rp.inventory.notebook = 1;
  p.rp.equipment = 'notebook';
  p.rp.lastRest = 1000;
  const saved = JSON.parse(JSON.stringify(p));
  assert.equal(equippedRPItem(saved).id, 'notebook');
  assert.equal(ensureRP(saved, 2000).lastRest, 1000);
});

test('new purchase/equipment/rest paths keep bans and no-charge failures', () => {
  const p = player();
  p.coins = 1;
  const poor = structuredClone(p);
  assert.throws(() => buyRPItem(p, 'notebook', 1, { now: 1 }), /moedas|saldo/i);
  assert.deepEqual(p, poor);
  p.coins = 100_000;
  buyRPItem(p, 'notebook', 1, { now: 2 });
  buyRPItem(p, 'apartamento', 1, { now: 2 });
  p.rp.energy = 50;
  p.banned = true;
  const banned = structuredClone(p);
  for (const action of [
    () => buyRPItem(p, 'marmita', 1, { now: 3 }),
    () => useRPItem(p, 'notebook', { now: 3 }),
    () => restRP(p, { now: 3 }),
  ]) {
    assert.throws(action, /banido/i);
    assert.deepEqual(p, banned);
  }
});
