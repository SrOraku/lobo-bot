import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDuel, declineDuel, getDuelForPlayer, pruneExpiredDuels, takeDuel } from '../src/game/duels.js';
import { ANTI_SPAM_MESSAGE, consumeCommand } from '../src/game/rate-limit.js';
import { BackupManager } from '../src/game/backup.js';

const FIRST = '5543920030769@s.whatsapp.net';
const SECOND = '5543996375955@s.whatsapp.net';
const THIRD = '5511999999999@s.whatsapp.net';
const CHAT = '120363000000001@g.us';
const NOW = 1_000_000;

function state() {
  const player = jid => ({ jid, hp: 100, banned: false, lastBattle: null });
  const first = player(FIRST);
  const second = player(SECOND);
  const third = player(THIRD);
  return { players: { [FIRST]: first, [SECOND]: second, [THIRD]: third }, duels: {}, rateLimits: {} };
}

function challenge(game, now = NOW) {
  return createDuel(game, game.players[FIRST], game.players[SECOND], CHAT, now);
}

test('duel is persisted with its conversation, two-minute expiry and unique ID', () => {
  const game = state();
  const duel = challenge(game);
  assert.equal(game.duels[duel.id], duel);
  assert.equal(duel.chatId, CHAT);
  assert.equal(duel.attacker, FIRST);
  assert.equal(duel.defender, SECOND);
  assert.equal(duel.expiresAt, NOW + 120_000);
  assert.equal(getDuelForPlayer(game, FIRST, NOW), duel);
  assert.equal(getDuelForPlayer(game, SECOND, NOW), duel);
});

test('duel rejects self, unregistered, banned and zero-HP players without creating challenges', () => {
  const self = state();
  assert.throws(() => createDuel(self, self.players[FIRST], self.players[FIRST], CHAT, NOW), { code: 'SELF_DUEL' });
  const missing = state();
  delete missing.players[SECOND];
  assert.throws(() => createDuel(missing, missing.players[FIRST], { jid: SECOND }, CHAT, NOW), { code: 'NOT_REGISTERED' });
  for (const jid of [FIRST, SECOND]) {
    const banned = state();
    banned.players[jid].banned = true;
    assert.throws(() => challenge(banned), { code: 'BANNED' });
    assert.deepEqual(banned.duels, {});
    const dead = state();
    dead.players[jid].hp = 0;
    assert.throws(() => challenge(dead), { code: 'NO_HP' });
    assert.deepEqual(dead.duels, {});
  }
});

test('both duel participants respect battle cooldown and its exact five-minute boundary', () => {
  for (const jid of [FIRST, SECOND]) {
    const game = state();
    game.players[jid].lastBattle = NOW - 299_999;
    assert.throws(() => challenge(game), { code: 'BATTLE_COOLDOWN' });
    game.players[jid].lastBattle = NOW - 300_000;
    assert.ok(challenge(game));
  }
});

test('a pending duel prevents conflicting challenges in either role and in other groups', () => {
  const game = state();
  challenge(game);
  for (const [attacker, defender] of [[FIRST, THIRD], [THIRD, FIRST], [SECOND, THIRD], [THIRD, SECOND]]) {
    assert.throws(() => createDuel(game, game.players[attacker], game.players[defender], '999@g.us', NOW), { code: 'DUEL_CONFLICT' });
  }
  assert.equal(Object.keys(game.duels).length, 1);
});

test('only the challenged player in the same conversation can take or decline a duel', () => {
  const game = state();
  const duel = challenge(game);
  assert.throws(() => takeDuel(game, FIRST, CHAT, NOW), { code: 'DUEL_NOT_DEFENDER' });
  assert.throws(() => declineDuel(game, THIRD, CHAT, NOW), { code: 'NO_DUEL' });
  assert.throws(() => takeDuel(game, SECOND, 'other@g.us', NOW), { code: 'DUEL_WRONG_CHAT' });
  assert.equal(game.duels[duel.id], duel);
  assert.equal(takeDuel(game, SECOND, CHAT, NOW + 1), duel);
  assert.deepEqual(game.duels, {});
  assert.throws(() => takeDuel(game, SECOND, CHAT, NOW + 2), { code: 'NO_DUEL' });
});

test('duel expires exactly at two minutes, cannot be accepted and no longer blocks new challenges', () => {
  const game = state();
  challenge(game);
  assert.throws(() => takeDuel(game, SECOND, CHAT, NOW + 120_000), { code: 'DUEL_EXPIRED' });
  assert.deepEqual(game.duels, {});
  const renewed = challenge(game, NOW + 120_000);
  assert.equal(renewed.createdAt, NOW + 120_000);
  assert.equal(declineDuel(game, SECOND, CHAT, NOW + 120_001), renewed);
  assert.equal(getDuelForPlayer(game, FIRST, NOW + 120_001), null);
});

test('pruning expires stale or malformed challenges without deleting an active challenge', () => {
  const game = state();
  const active = challenge(game);
  game.duels.expired = { expiresAt: NOW };
  game.duels.invalid = { expiresAt: 'tomorrow' };
  pruneExpiredDuels(game, NOW);
  assert.deepEqual(Object.keys(game.duels), [active.id]);
});

test('anti-spam allows one command per second, with no owner exemption or denied-attempt extension', () => {
  const game = state();
  assert.deepEqual(consumeCommand(game, FIRST, 0), { allowed: true, reason: null, retryAfter: 0 });
  assert.deepEqual(consumeCommand(game, FIRST, 999), { allowed: false, reason: 'second', retryAfter: 1 });
  assert.equal(game.rateLimits[FIRST].timestamps.length, 1);
  assert.equal(consumeCommand(game, FIRST, 1_000).allowed, true);
  assert.equal(consumeCommand(game, SECOND, 1_000).allowed, true);
  assert.match(ANTI_SPAM_MESSAGE, /ANTI-SPAM/);
  assert.match(ANTI_SPAM_MESSAGE, /Calma, lobo/);
  assert.doesNotMatch(ANTI_SPAM_MESSAGE, /🌹 Dev:/);
});

test('anti-spam enforces a rolling 50-command hour and frees a slot at the exact boundary', () => {
  const game = state();
  for (let index = 0; index < 50; index++) assert.equal(consumeCommand(game, FIRST, index * 1_000).allowed, true);
  assert.deepEqual(consumeCommand(game, FIRST, 50_000), { allowed: false, reason: 'hour', retryAfter: 3_550_000 });
  assert.equal(game.rateLimits[FIRST].timestamps.length, 50);
  assert.equal(consumeCommand(game, FIRST, 3_600_000).allowed, true);
  assert.equal(game.rateLimits[FIRST].timestamps.length, 50);
  assert.equal(game.rateLimits[FIRST].timestamps.includes(0), false);
});

test('persisted rate quotas cannot be bypassed by restart, clock rollback or another user', () => {
  const game = state();
  for (let index = 0; index < 50; index++) consumeCommand(game, FIRST, NOW + index * 1_000);
  const restored = JSON.parse(JSON.stringify(game));
  assert.equal(consumeCommand(restored, FIRST, NOW + 50_000).allowed, false);
  assert.equal(consumeCommand(restored, FIRST, NOW - 1).allowed, false);
  assert.equal(consumeCommand(restored, THIRD, NOW + 50_000).allowed, true);
  assert.equal(restored.rateLimits[FIRST].timestamps.length, 50);
  consumeCommand(restored, THIRD, NOW + 3_700_000);
  assert.equal(restored.rateLimits[FIRST], undefined);
});

async function backupFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-backup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = { data: { version: 1, groups: { [CHAT]: { rules: 'Respeito.' } }, game: state(), auth: { secret: 'must-never-be-backed-up' } } };
  return { directory, store };
}

test('backup snapshot is complete, atomic, private and omits credentials', async t => {
  const { directory, store } = await backupFixture(t);
  const manager = new BackupManager({ store, directory: path.join(directory, 'backups'), now: () => NOW });
  const filename = await manager.create();
  const content = JSON.parse(await fs.readFile(filename, 'utf8'));
  assert.equal(content.version, 1);
  assert.equal(content.createdAt, NOW);
  assert.deepEqual(content.data.game, store.data.game);
  assert.deepEqual(content.data.groups, store.data.groups);
  assert.equal(content.data.auth, undefined);
  assert.equal((await fs.readdir(path.dirname(filename))).some(name => name.endsWith('.tmp')), false);
  if (process.platform !== 'win32') assert.equal((await fs.stat(filename)).mode & 0o777, 0o600);
});

test('concurrent backups create distinct valid files even with identical timestamps', async t => {
  const { directory, store } = await backupFixture(t);
  const manager = new BackupManager({ store, directory, now: () => NOW });
  const files = await Promise.all([manager.create(), manager.create(), manager.create()]);
  assert.equal(new Set(files).size, 3);
  for (const file of files) assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).data.game, store.data.game);
});

test('failed manual backup rejects cleanly and the queue recovers for a later backup', async t => {
  const { directory, store } = await backupFixture(t);
  const blocked = path.join(directory, 'blocked');
  await fs.writeFile(blocked, 'not a directory');
  const manager = new BackupManager({ store, directory: blocked, now: () => NOW });
  await assert.rejects(manager.create());
  await fs.unlink(blocked);
  const file = await manager.create();
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).data.version, 1);
});

test('failed atomic rename cleans up its temporary file', async t => {
  const { directory, store } = await backupFixture(t);
  const manager = new BackupManager({ store, directory, now: () => NOW });
  t.mock.method(fs, 'rename', async () => { throw new Error('disk failure'); });
  await assert.rejects(manager.create(), /disk failure/);
  assert.deepEqual(await fs.readdir(directory), []);
});

test('automatic backup failures are logged and do not stop scheduling or throw unhandled rejections', async t => {
  const { directory, store } = await backupFixture(t);
  const blocked = path.join(directory, 'blocked');
  await fs.writeFile(blocked, 'not a directory');
  const warnings = [];
  const manager = new BackupManager({ store, directory: blocked, intervalMs: 5,
    logger: { warn: (...args) => warnings.push(args) }, now: () => NOW });
  t.after(() => manager.stop());
  assert.equal(manager.start(), manager);
  const timer = manager.timer;
  manager.start();
  assert.equal(manager.timer, timer);
  await new Promise(resolve => setTimeout(resolve, 35));
  manager.stop();
  await manager.pending;
  assert.ok(warnings.length > 0);
  assert.equal(manager.timer, null);
});
