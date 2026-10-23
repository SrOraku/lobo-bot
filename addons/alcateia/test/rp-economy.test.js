import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../src/game/players.js';
import { buyItem } from '../src/game/shop.js';
import { ensureRP } from '../src/rp/state.js';
import { JOBS, listJobs, getJob, chooseJob, work, performJobAction } from '../src/rp/jobs.js';
import { RP_ITEMS, getRPItem, buyRPItem, useRPItem } from '../src/rp/shop.js';

const HOUR = 3_600_000;
const ACTION_COOLDOWN = 300_000;

function player(index = 0, experience = 1000) {
  const number = index ? '5521999999999' : '5511999999999';
  const p = createPlayer({ name: `Lobo ${index}`, number, jid: `${number}@s.whatsapp.net` }, 0);
  const rp = ensureRP(p, 0);
  rp.experience = experience;
  return p;
}

test('RP initialization preserves the single existing balance and is idempotent', () => {
  const p = player();
  p.coins = 73;
  const first = ensureRP(p, 1000);
  first.energy = 75;
  first.inventory.pao = 2;
  const second = ensureRP(p, 2000);
  assert.equal(first, second);
  assert.equal(p.coins, 73);
  assert.equal(second.energy, 75);
  assert.equal(second.inventory.pao, 2);
  assert.equal(Object.hasOwn(second, 'coins'), false);
});

test('the career catalog includes at least 45 functional professions across categories', () => {
  assert.ok(JOBS.length >= 45);
  assert.equal(new Set(JOBS.map(job => job.id)).size, JOBS.length);
  assert.ok(new Set(JOBS.map(job => job.category)).size >= 8);
  for (const id of ['medico', 'advogado', 'policial', 'juiz', 'presidente', 'governador']) {
    const job = getJob(id);
    assert.ok(job.description && job.roleActionName && job.actionDescription);
    assert.ok(job.salary >= 20 && job.salary <= 120);
  }
  assert.ok(listJobs('saude').length > 0);
  assert.ok(listJobs('saude').every(job => job.category === 'Saúde'));
  assert.equal(getJob('Médico').id, 'medico');
});

test('choosing a profession respects experience requirements and grants no money', () => {
  const p = player(0, 0);
  const before = structuredClone(p);
  assert.throws(() => chooseJob(p, 'presidente', 1000), /XP|experi[eê]ncia/i);
  assert.deepEqual(p, before);
  assert.throws(() => chooseJob(p, 'inexistente', 1000), /profissão/i);
  assert.deepEqual(p, before);
  chooseJob(p, 'entregador', 1000);
  assert.equal(p.rp.jobId, 'entregador');
  assert.equal(p.coins, 100);
});

test('work pays into the existing balance and consumes needs while awarding experience', () => {
  const p = player(0, 0);
  chooseJob(p, 'entregador', 0);
  work(p, { now: 0, rng: () => 0.9 });
  assert.equal(p.coins, 100 + getJob('entregador').salary);
  assert.equal(p.rp.experience, 10);
  assert.deepEqual([p.rp.energy, p.rp.hunger], [90, 90]);
  assert.equal(p.rp.lastWork, 0);
});

test('changing professions cannot reset the hourly work cooldown, including timestamp zero', () => {
  const p = player();
  chooseJob(p, 'entregador', 0);
  work(p, { now: 0, rng: () => 0.9 });
  chooseJob(p, 'padeiro', 100);
  assert.equal(p.rp.lastWork, 0);
  const before = structuredClone(p);
  assert.throws(() => work(p, { now: HOUR - 1 }), /aguarde/i);
  assert.deepEqual(p, before);
  work(p, { now: HOUR });
  assert.equal(p.coins, 100 + getJob('entregador').salary + getJob('padeiro').salary);
});

test('work requires a chosen career, adequate needs, health and no active jail sentence', () => {
  const withoutJob = player();
  assert.throws(() => work(withoutJob), /profissão/i);
  for (const change of [
    { energy: 14 }, { hunger: 9 }, { health: 0 }, { jailedUntil: 1001 },
  ]) {
    const p = player();
    chooseJob(p, 'entregador', 0);
    Object.assign(p.rp, change);
    const before = structuredClone(p);
    assert.throws(() => work(p, { now: 1000 }));
    assert.deepEqual(p, before);
  }
  const p = player();
  chooseJob(p, 'entregador', 0);
  Object.assign(p.rp, { energy: 15, hunger: 10, jailedUntil: 1000 });
  work(p, { now: 1000 });
  assert.deepEqual([p.rp.energy, p.rp.hunger], [5, 0]);
});

test('fictional illegal work can fine only the acting player and creates a timed jail sentence', () => {
  const p = player();
  const other = player(1);
  chooseJob(p, 'ladrao', 0);
  const otherBefore = structuredClone(other);
  const result = work(p, { now: 1000, rng: () => 0 });
  assert.equal(result.event, 'fine');
  assert.equal(p.coins, 80);
  assert.equal(p.rp.wanted, 1);
  assert.equal(p.rp.jailedUntil, 1000 + 600_000);
  assert.deepEqual(other, otherBefore);
  assert.throws(() => work(p, { now: 1001, rng: () => 0.9 }), /prisão/i);
});

test('fictional fines never make a balance negative and successful scenes still affect only the actor', () => {
  const poor = player();
  poor.coins = 3;
  chooseJob(poor, 'ladrao', 0);
  work(poor, { now: 1000, rng: () => 0 });
  assert.equal(poor.coins, 0);
  const success = player();
  chooseJob(success, 'ladrao', 0);
  work(success, { now: 1000, rng: () => 0.99 });
  assert.equal(success.coins, 100 + getJob('ladrao').salary);
  assert.equal(success.rp.wanted, 1);
  assert.equal(success.rp.jailedUntil, null);
});

test('medical role actions charge the doctor, restore target RP health and have their own cooldown', () => {
  const doctor = player();
  const patient = player(1);
  chooseJob(doctor, 'medico', 0);
  patient.rp.health = 90;
  const patientCoins = patient.coins;
  performJobAction(doctor, 'tratar', patient, { now: 0 });
  assert.equal(patient.rp.health, 100);
  assert.equal(patient.coins, patientCoins);
  assert.equal(doctor.coins, 80);
  assert.equal(doctor.rp.energy, 90);
  assert.equal(doctor.rp.lastJobAction, 0);
  const before = structuredClone(doctor);
  assert.throws(() => performJobAction(doctor, 'tratar', patient, { now: ACTION_COOLDOWN - 1 }), /aguarde/i);
  assert.deepEqual(doctor, before);
  patient.rp.health = 50;
  performJobAction(doctor, 'tratar', patient, { now: ACTION_COOLDOWN });
  assert.equal(patient.rp.health, 70);
  assert.equal(doctor.coins, 60);
});

test('failed health treatment does not charge coins or consume an action cooldown', () => {
  const doctor = player();
  const patient = player(1);
  chooseJob(doctor, 'enfermeiro', 0);
  const doctorBefore = structuredClone(doctor);
  const patientBefore = structuredClone(patient);
  assert.throws(() => performJobAction(doctor, 'tratar', patient, { now: 1000 }), /completa/i);
  assert.deepEqual(doctor, doctorBefore);
  assert.deepEqual(patient, patientBefore);
  patient.rp.health = 50;
  doctor.coins = 19;
  const poorDoctor = structuredClone(doctor);
  assert.throws(() => performJobAction(doctor, 'tratar', patient, { now: 1000 }), /moedas|saldo/i);
  assert.deepEqual(doctor, poorDoctor);
  assert.equal(patient.rp.health, 50);
});

test('justice actions reduce only the actor wanted level and cannot target another player', () => {
  const lawyer = player();
  const other = player(1);
  chooseJob(lawyer, 'advogado', 0);
  lawyer.rp.wanted = 2;
  other.rp.wanted = 7;
  const before = structuredClone(lawyer);
  assert.throws(() => performJobAction(lawyer, 'recurso', other, { now: 1000 }), /próprio/i);
  assert.deepEqual(lawyer, before);
  performJobAction(lawyer, 'recurso', undefined, { now: 1000 });
  assert.equal(lawyer.rp.wanted, 1);
  assert.equal(lawyer.coins, 60);
  assert.equal(other.rp.wanted, 7);
});

test('police, teacher, political and ordinary careers execute state-changing role actions', () => {
  const police = player();
  chooseJob(police, 'policial', 0);
  performJobAction(police, 'patrulhar', undefined, { now: 0 });
  assert.equal(police.coins, 110);
  assert.equal(police.rp.experience, 1005);
  const teacher = player();
  const student = player(1);
  chooseJob(teacher, 'professor', 0);
  performJobAction(teacher, 'ensinar', student, { now: 0 });
  assert.equal(student.rp.experience, 1002);
  assert.equal(teacher.rp.experience, 1005);
  for (const id of ['presidente', 'governador', 'programador', 'cozinheiro']) {
    const p = player();
    const job = getJob(id);
    chooseJob(p, id, 0);
    performJobAction(p, job.roleActionName, undefined, { now: 0 });
    assert.equal(p.rp.reputation, 1);
    assert.equal(p.rp.experience, 1005);
    assert.equal(p.rp.energy, 90);
  }
});

test('wrong career actions and low energy do not grant money, XP or reputation', () => {
  const p = player();
  chooseJob(p, 'policial', 0);
  const before = structuredClone(p);
  assert.throws(() => performJobAction(p, 'tratar', undefined, { now: 0 }), /função/i);
  assert.deepEqual(p, before);
  p.rp.energy = 9;
  const tired = structuredClone(p);
  assert.throws(() => performJobAction(p, 'patrulhar', undefined, { now: 0 }), /energia/i);
  assert.deepEqual(p, tired);
});

test('work, RP purchases and wolf-game purchases all spend the same WoK coin balance', () => {
  const p = player();
  chooseJob(p, 'entregador', 0);
  work(p, { now: 0 });
  buyRPItem(p, 'cafe', 1, { now: 1000 });
  buyItem(p, '1', { now: 1000 });
  assert.equal(p.coins, 100 + getJob('entregador').salary - 10 - 100);
  assert.equal(p.rp.inventory.cafe, 1);
  assert.equal(p.boosts.length, 1);
});

test('RP shop includes food, medicine, gifts, rings, housing and vehicles', () => {
  const types = new Set(RP_ITEMS.map(item => item.type));
  for (const type of ['food', 'medicine', 'gift', 'ring', 'home', 'vehicle']) assert.ok(types.has(type));
  assert.equal(new Set(RP_ITEMS.map(item => item.id)).size, RP_ITEMS.length);
  assert.equal(getRPItem('Café').id, 'cafe');
});

test('RP purchases validate quantities, available balance and inventory capacity before debiting', () => {
  const p = player();
  const before = structuredClone(p);
  for (const qty of [0, -1, 101, 1.5, Infinity, '1e1']) {
    assert.throws(() => buyRPItem(p, 'pao', qty, { now: 1000 }));
    assert.deepEqual(p, before);
  }
  assert.throws(() => buyRPItem(p, 'carro', 1, { now: 1000 }), /saldo|moedas/i);
  assert.deepEqual(p, before);
  p.coins = 1000;
  p.rp.inventory.pao = 999;
  const full = structuredClone(p);
  assert.throws(() => buyRPItem(p, 'pao', 1, { now: 1000 }), /estoque|999/i);
  assert.deepEqual(p, full);
  delete p.rp.inventory.pao;
  buyRPItem(p, 'pao', 3, { now: 1000 });
  assert.equal(p.rp.inventory.pao, 3);
  assert.equal(p.coins, 985);
});

test('food, coffee and medicine consume inventory while capping RP needs at 100', () => {
  const p = player();
  p.coins = 500;
  Object.assign(p.rp, { hunger: 95, energy: 90, health: 80 });
  buyRPItem(p, 'pao', 2, { now: 0 });
  buyRPItem(p, 'cafe', 1, { now: 0 });
  buyRPItem(p, 'remedio', 1, { now: 0 });
  const coins = p.coins;
  useRPItem(p, 'pao', { now: 1000 });
  useRPItem(p, 'cafe', { now: 1000 });
  useRPItem(p, 'remedio', { now: 1000 });
  assert.deepEqual([p.rp.hunger, p.rp.energy, p.rp.health], [100, 100, 100]);
  assert.equal(p.rp.inventory.pao, 1);
  assert.equal(p.rp.inventory.cafe, undefined);
  assert.equal(p.rp.inventory.remedio, undefined);
  assert.equal(p.coins, coins);
  assert.equal(p.hp, 100);
  const before = structuredClone(p);
  assert.throws(() => useRPItem(p, 'pao', { now: 1001 }), /limite/i);
  assert.deepEqual(p, before);
});

test('consumables cannot be applied to another player and unused rings remain in inventory', () => {
  const p = player();
  const target = player(1);
  p.coins = 500;
  target.rp.hunger = 50;
  buyRPItem(p, 'pao', 1, { now: 0 });
  buyRPItem(p, 'alianca', 1, { now: 0 });
  const before = structuredClone(p);
  const targetBefore = structuredClone(target);
  assert.throws(() => useRPItem(p, 'pao', { now: 1000, target }), /próprio/i);
  assert.throws(() => useRPItem(p, 'alianca', { now: 1000 }), /casamento/i);
  assert.deepEqual(p, before);
  assert.deepEqual(target, targetBefore);
});

test('gifts require another existing RP character and consume only the giver inventory', () => {
  const p = player();
  const target = player(1);
  buyRPItem(p, 'flores', 2, { now: 0 });
  const before = structuredClone(p);
  assert.throws(() => useRPItem(p, 'flores', { now: 1000 }), /outro/i);
  assert.throws(() => useRPItem(p, 'flores', { now: 1000, target: p }), /outro/i);
  assert.deepEqual(p, before);
  const targetCoins = target.coins;
  useRPItem(p, 'flores', { now: 1000, target });
  assert.equal(target.rp.reputation, 1);
  assert.equal(target.coins, targetCoins);
  assert.equal(p.rp.inventory.flores, 1);
});

test('housing and vehicles are persistent single properties with upgrades and no downgrade refunds', () => {
  const p = player();
  p.coins = 50_000;
  buyRPItem(p, 'apartamento', 1, { now: 1000 });
  buyRPItem(p, 'bicicleta', 1, { now: 1000 });
  assert.deepEqual(p.rp.home, { itemId: 'apartamento', name: 'Apartamento', level: 1, acquiredAt: 1000 });
  assert.deepEqual(p.rp.vehicle, { itemId: 'bicicleta', name: 'Bicicleta', level: 1, acquiredAt: 1000 });
  assert.equal(p.rp.inventory.apartamento, undefined);
  const before = structuredClone(p);
  assert.throws(() => buyRPItem(p, 'apartamento', 1, { now: 2000 }), /upgrade/i);
  assert.throws(() => buyRPItem(p, 'carro', 2, { now: 2000 }), /somente uma/i);
  assert.deepEqual(p, before);
  buyRPItem(p, 'mansao', 1, { now: 2000 });
  buyRPItem(p, 'carro', 1, { now: 2000 });
  assert.equal(p.rp.home.level, 3);
  assert.equal(p.rp.vehicle.level, 3);
  assert.equal(p.coins, 50_000 - 1500 - 300 - 10_000 - 5000);
  const upgraded = structuredClone(p);
  assert.throws(() => buyRPItem(p, 'casa', 1, { now: 3000 }), /upgrade/i);
  assert.throws(() => buyRPItem(p, 'moto', 1, { now: 3000 }), /upgrade/i);
  assert.deepEqual(p, upgraded);
});

test('banned players cannot work, perform career actions or make RP purchases', () => {
  const p = player();
  chooseJob(p, 'policial', 0);
  p.banned = true;
  const before = structuredClone(p);
  for (const action of [
    () => chooseJob(p, 'entregador', 1000),
    () => work(p, { now: 1000 }),
    () => performJobAction(p, 'patrulhar', undefined, { now: 1000 }),
    () => buyRPItem(p, 'pao', 1, { now: 1000 }),
  ]) assert.throws(action, /banido/i);
  assert.deepEqual(p, before);
});
