import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { GameService } from '../src/game/service.js';
import { createPlayer } from '../src/game/players.js';
import { ensureRP } from '../src/rp/state.js';

const OWNER = '5543920030769@s.whatsapp.net';
const OTHER_OWNER = '5543996375955@s.whatsapp.net';
const FIRST = '5511999999999@s.whatsapp.net';
const SECOND = '5511888888888@s.whatsapp.net';
const THIRD = '5511777777777@s.whatsapp.net';
const CHAT = '120363000000000001@g.us';
const OTHER_CHAT = '120363000000000002@g.us';
const NOW = 1_700_000_000_000;

function fixture(t, { rng = () => 0 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-game-service-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data', 'database.json');
  const store = new Store(file);
  const service = new GameService({ store, now: () => NOW, rng });
  function seed(jid, overrides = {}) {
    const player = { ...createPlayer({ jid, name: `Lobo ${jid.slice(2, 4)}` }, NOW - 1_000), ...overrides };
    store.data.game.players[jid] = player;
    return player;
  }
  function execute(jid, input, { at = NOW, chatId = CHAT, target, actor = {}, using = service } = {}) {
    const [command, ...args] = input.trim().split(/\s+/);
    return using.execute({ command, args, argText: input.trim().slice(command.length).trim(),
      actor: { jid, name: 'Jogador', ...actor }, target: target ? { jid: target } : undefined,
      chatId, now: at });
  }
  return { file, store, service, seed, execute };
}

test('opening a legacy database preserves every group setting while migrating empty game state', t => {
  const f = fixture(t);
  const legacy = { version: 1, groups: { [CHAT]: { enabled: true, antilink: true, rules: 'Respeito.', warnings: { [FIRST]: 2 }, warnLimit: 3 } } };
  fs.mkdirSync(path.dirname(f.file), { recursive: true });
  fs.writeFileSync(f.file, JSON.stringify(legacy));
  const migrated = new Store(f.file);
  assert.deepEqual(migrated.data.groups, legacy.groups);
  assert.deepEqual(migrated.data.game.players, {});
  migrated.save();
  assert.deepEqual(new Store(f.file).data, migrated.data);
});

test('game transaction rollback leaves data intact and allows the queued next transaction to recover', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.store.save();
  const before = fs.readFileSync(f.file, 'utf8');
  const failed = f.store.transactionGame(game => {
    game.players[FIRST].coins = 0;
    throw new Error('cancel this operation');
  });
  const next = f.store.transactionGame(game => { game.players[FIRST].coins += 1; return game.players[FIRST]; });
  await assert.rejects(failed, /cancel this operation/);
  const player = await next;
  assert.equal(player.coins, 101);
  assert.equal(f.store.data.game.players[FIRST].coins, 101);
  assert.equal(JSON.parse(before).game.players[FIRST].coins, 100);
  assert.equal(new Store(f.file).data.game.players[FIRST].coins, 101);
});

test('failed atomic save restores in-memory game and leaves the previous on-disk database intact', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.store.save();
  const before = fs.readFileSync(f.file, 'utf8');
  const rename = t.mock.method(fs, 'renameSync', () => { throw new Error('disk write rejected'); });
  await assert.rejects(f.store.transactionGame(game => { game.players[FIRST].coins = 1; }), /disk write rejected/);
  assert.equal(f.store.data.game.players[FIRST].coins, 100);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  rename.mock.restore();
  await f.store.transactionGame(game => { game.players[FIRST].coins = 150; });
  assert.equal(new Store(f.file).data.game.players[FIRST].coins, 150);
});

test('a game transaction cannot overwrite a group update made while its callback awaited', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  let release;
  let notify;
  const started = new Promise(resolve => { notify = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const pending = f.store.transactionGame(async game => {
    game.players[FIRST].coins += 10;
    notify();
    await gate;
  });
  await started;
  const group = f.store.group(CHAT);
  group.rules = 'Configuração nova durante o jogo.';
  group.warnings[FIRST] = 2;
  f.store.save();
  release();
  await pending;
  const restored = new Store(f.file);
  assert.equal(restored.group(CHAT).rules, group.rules);
  assert.equal(restored.group(CHAT).warnings[FIRST], 2);
  assert.equal(restored.data.game.players[FIRST].coins, 110);
});

test('concurrent registration is unique globally across chats and keeps the initial player intact', async t => {
  const f = fixture(t);
  const results = await Promise.all([
    f.execute(FIRST, 'start'),
    f.execute(FIRST, 'start', { at: NOW + 1_000, chatId: OTHER_CHAT }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['registered', 'error']);
  assert.equal(results[1].code, 'ALREADY_REGISTERED');
  assert.equal(Object.keys(f.store.data.game.players).length, 1);
  assert.equal(f.store.data.game.players[FIRST].coins, 100);
  assert.equal(f.store.data.game.players[FIRST].createdAt, NOW);
});

test('failed game commands consume accepted anti-spam tokens without mutating player data', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  const before = structuredClone(f.store.data.game.players);
  const invalid = await f.execute(FIRST, 'formacao A 999');
  assert.equal(invalid.type, 'error');
  assert.deepEqual(f.store.data.game.players, before);
  assert.deepEqual(f.store.data.game.rateLimits[FIRST].timestamps, [NOW]);
  const spam = await f.execute(FIRST, 'perfil', { at: NOW + 1 });
  assert.equal(spam.type, 'rate-limit');
  assert.equal(spam.reason, 'second');
  const allowed = await f.execute(FIRST, 'perfil', { at: NOW + 1_000 });
  assert.equal(allowed.type, 'profile');
});

test('game anti-spam remains global across conversations and survives reloading the database', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  assert.equal((await f.execute(FIRST, 'perfil')).type, 'profile');
  const restored = new Store(f.file);
  const restarted = new GameService({ store: restored });
  assert.equal((await f.execute(FIRST, 'perfil', { at: NOW + 999, chatId: OTHER_CHAT, using: restarted })).type, 'rate-limit');
  assert.equal((await f.execute(FIRST, 'perfil', { at: NOW + 1_000, chatId: OTHER_CHAT, using: restarted })).type, 'profile');
});

test('both exact owners can administer the game without registration; group-admin flags never grant access', async t => {
  const f = fixture(t);
  for (const jid of [OWNER, OTHER_OWNER]) {
    const result = await f.execute(jid, 'admin status');
    assert.equal(result.type, 'admin-status');
    assert.deepEqual(result.stats, { players: 0, battles: 0, clans: 0 });
  }
  const impostor = await f.execute(FIRST, 'admin status', { actor: { isOwner: true, isAdmin: true, name: 'Dono' } });
  assert.equal(impostor.type, 'error');
  assert.equal(impostor.code, 'OWNER');
  const lid = await f.execute('5543920030769@lid', 'admin status');
  assert.equal(lid.type, 'error');
  assert.equal(lid.code, 'IDENTITY');
});

test('owners also respect the one-second and fifty-per-hour game-command limits', async t => {
  const f = fixture(t);
  assert.equal((await f.execute(OWNER, 'admin status')).type, 'admin-status');
  assert.equal((await f.execute(OWNER, 'admin backup', { at: NOW + 1 })).type, 'rate-limit');
  for (let index = 1; index < 50; index++) {
    assert.equal((await f.execute(OWNER, 'admin status', { at: NOW + index * 1_000 })).type, 'admin-status');
  }
  const quota = await f.execute(OWNER, 'admin status', { at: NOW + 50_000 });
  assert.equal(quota.type, 'rate-limit');
  assert.equal(quota.reason, 'hour');
  assert.equal(f.store.data.game.rateLimits[OWNER].timestamps.length, 50);
});

test('two owners adding coins concurrently cannot overwrite each other', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  const results = await Promise.all([
    f.execute(OWNER, `admin addmoedas ${FIRST.split('@')[0]} 500`),
    f.execute(OTHER_OWNER, `admin addmoedas ${FIRST.split('@')[0]} 600`, { chatId: OTHER_CHAT }),
  ]);
  assert.ok(results.every(result => result.type === 'admin-updated'));
  assert.equal(f.store.data.game.players[FIRST].coins, 1_200);
  assert.equal(new Store(f.file).data.game.players[FIRST].coins, 1_200);
});

test('concurrent purchases across services and chats cannot spend the same balance twice', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 300 });
  const otherService = new GameService({ store: f.store });
  const results = await Promise.all([
    f.execute(FIRST, 'comprar 4'),
    f.execute(FIRST, 'comprar 4', { at: NOW + 1_000, chatId: OTHER_CHAT, using: otherService }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['purchase', 'error']);
  assert.equal(results[1].code, 'BALANCE');
  assert.equal(f.store.data.game.players[FIRST].coins, 100);
  assert.equal(f.store.data.game.players[FIRST].extraTraining, 1);
});

test('a repeated event or training in concurrent chats awards only once', async t => {
  for (const command of ['evento', 'treino']) {
    const f = fixture(t);
    f.seed(FIRST);
    const results = await Promise.all([
      f.execute(FIRST, command),
      f.execute(FIRST, command, { at: NOW + 1_000, chatId: OTHER_CHAT }),
    ]);
    assert.deepEqual(results.map(result => result.type), [command === 'evento' ? 'event' : 'training', 'error']);
    assert.equal(results[1].code, 'COOLDOWN');
    const player = f.store.data.game.players[FIRST];
    assert.equal(player.coins, command === 'evento' ? 180 : 100);
    assert.equal(player.wolves, command === 'treino' ? 25 : 20);
  }
});

test('simultaneous clan creation handles normalized uniqueness without charging the losing creator', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 400 });
  f.seed(SECOND, { coins: 400 });
  const results = await Promise.all([
    f.execute(FIRST, 'clan criar Lua Prateada'),
    f.execute(SECOND, 'clan criar LUA   PRATEADA', { chatId: OTHER_CHAT }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['clan', 'error']);
  const game = f.store.data.game;
  assert.equal(Object.keys(game.clans).length, 1);
  assert.equal(game.players[FIRST].coins, 100);
  assert.equal(game.players[SECOND].coins, 400);
  assert.equal(game.players[SECOND].clan, null);
  assert.equal(game.clans['lua prateada'].leader, FIRST);
  assert.deepEqual(game.clans['lua prateada'].members, [FIRST]);
});

function seedBattle(f) {
  const attacker = f.seed(FIRST, { attack: 40, defense: 0, counter: 20, wolves: 60 });
  const defender = f.seed(SECOND, { attack: 0, defense: 40, counter: 0, wolves: 40, hp: 60 });
  return { attacker, defender };
}

test('battle atomically updates both HP, coins, records, cooldowns, clan scores and persistent history', async t => {
  const f = fixture(t);
  seedBattle(f);
  for (const [jid, key] of [[FIRST, 'alpha'], [SECOND, 'beta']]) {
    f.store.data.game.players[jid].clan = key;
    f.store.data.game.clans[key] = { key, name: key, leader: jid, members: [jid], wins: 0, losses: 0, coins: 0, createdAt: NOW - 1_000, updatedAt: NOW - 1_000 };
  }
  const result = await f.execute(FIRST, 'ataque @lobo', { target: SECOND });
  assert.equal(result.type, 'battle');
  const game = f.store.data.game;
  assert.equal(game.players[FIRST].hp, 100);
  assert.equal(game.players[SECOND].hp, 34);
  assert.equal(game.players[FIRST].coins, 150);
  assert.equal(game.players[SECOND].coins, 75);
  assert.equal(game.players[FIRST].wins, 1);
  assert.equal(game.players[SECOND].losses, 1);
  assert.equal(game.players[FIRST].lastBattle, NOW);
  assert.equal(game.players[SECOND].lastBattle, NOW);
  assert.equal(game.clans.alpha.wins, 1);
  assert.equal(game.clans.beta.losses, 1);
  assert.equal(game.clans.alpha.coins, 50);
  assert.equal(game.battles.length, 1);
  assert.equal(game.battles[0].chatId, CHAT);
  assert.equal(game.battles[0].date, '2023-11-14');
  assert.equal(game.battles[0].time, '22:13:20.000');
  assert.equal(game.battles[0].attacker.damage, 26);
  assert.equal(game.battles[0].defender.damage, 0);
  assert.deepEqual(new Store(f.file).data.game, game);
});

test('two concurrent attackers cannot bypass the same defender battle cooldown', async t => {
  const f = fixture(t);
  seedBattle(f);
  f.seed(THIRD);
  const results = await Promise.all([
    f.execute(FIRST, 'ataque @lobo', { target: SECOND }),
    f.execute(THIRD, 'ataque @lobo', { target: SECOND, chatId: OTHER_CHAT }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['battle', 'error']);
  assert.equal(results[1].code, 'COOLDOWN');
  assert.equal(f.store.data.game.battles.length, 1);
  assert.equal(f.store.data.game.players[THIRD].lastBattle, null);
  assert.equal(f.store.data.game.players[THIRD].coins, 100);
});

test('partial battle mutations are discarded if updating clan coins fails validation', async t => {
  const f = fixture(t);
  seedBattle(f);
  f.store.data.game.players[FIRST].clan = 'alpha';
  f.store.data.game.clans.alpha = { key: 'alpha', name: 'Alpha', leader: FIRST, members: [FIRST], wins: 0, losses: 0, coins: Number.MAX_SAFE_INTEGER, createdAt: NOW };
  const before = structuredClone(f.store.data.game);
  const result = await f.execute(FIRST, 'ataque @lobo', { target: SECOND });
  assert.equal(result.type, 'error');
  assert.deepEqual(f.store.data.game.players, before.players);
  assert.deepEqual(f.store.data.game.clans, before.clans);
  assert.deepEqual(f.store.data.game.battles, []);
  assert.deepEqual(f.store.data.game.rateLimits[FIRST].timestamps, [NOW]);
});

test('removed duel commands cannot create challenges or execute a battle', async t => {
  const f = fixture(t);
  seedBattle(f);
  const before = structuredClone(f.store.data.game.players);
  for (const [index, command] of ['duelo @lobo', 'aceitar', 'recusar'].entries()) {
    const result = await f.execute(FIRST, command, { at: NOW + index * 1_000, target: SECOND });
    assert.equal(result.type, 'error');
    assert.match(result.message, /desconhecido/);
  }
  assert.equal(f.store.data.game.battles.length, 0);
  assert.deepEqual(f.store.data.game.players, before);
});

test('legacy pending duels cannot block direct attacks after duel removal', async t => {
  const f = fixture(t);
  seedBattle(f);
  f.store.data.game.duels.old = { id: 'old', attacker: FIRST, defender: SECOND, chatId: CHAT,
    createdAt: NOW, expiresAt: NOW + 120_000 };
  const result = await f.execute(FIRST, 'ataque @lobo', { target: SECOND });
  assert.equal(result.type, 'battle');
  assert.equal(f.store.data.game.battles.length, 1);
  assert.equal(f.store.data.game.battles[0].mode, 'pvp');
  assert.deepEqual(f.store.data.game.duels, {});
});

test('game bans cancel pending family invitations and preserve group moderation and warning data', async t => {
  const f = fixture(t);
  seedBattle(f);
  f.store.data.game.players[FIRST].coins = 400;
  ensureRP(f.store.data.game.players[FIRST], NOW);
  ensureRP(f.store.data.game.players[SECOND], NOW);
  const group = f.store.group(CHAT);
  group.rules = 'Regra de grupo preservada.';
  group.warnings[FIRST] = 2;
  assert.equal((await f.execute(FIRST, 'familia criar Luna')).type, 'rp-family');
  assert.equal((await f.execute(FIRST, 'familia convidar @lobo parente', { target: SECOND, at: NOW + 1_000 })).type, 'rp-invite');
  assert.equal(Object.keys(f.store.data.game.rp.invites).length, 1);
  assert.equal((await f.execute(OWNER, `admin ban ${FIRST.split('@')[0]}`, { at: NOW + 2_000 })).type, 'admin-updated');
  assert.equal(f.store.data.game.players[FIRST].banned, true);
  assert.deepEqual(f.store.data.game.rp.invites, {});
  assert.equal(group.warnings[FIRST], 2);
  assert.equal(group.rules, 'Regra de grupo preservada.');
  const blocked = await f.execute(FIRST, 'perfil', { at: NOW + 3_000 });
  assert.equal(blocked.type, 'error');
  assert.equal(blocked.code, 'BANNED');
  assert.equal((await f.execute(OTHER_OWNER, `admin unban ${FIRST.split('@')[0]}`, { at: NOW + 3_000 })).type, 'admin-updated');
  assert.equal((await f.execute(FIRST, 'perfil', { at: NOW + 4_000 })).type, 'profile');
});

test('admin quantity validation preserves balances and caps HP and wolves without corrupting formation', async t => {
  const f = fixture(t);
  f.seed(FIRST, { wolves: 99, attack: 40, defense: 39, counter: 20 });
  assert.equal((await f.execute(OWNER, `admin removemoedas ${FIRST.split('@')[0]} 101`)).type, 'error');
  assert.equal(f.store.data.game.players[FIRST].coins, 100);
  assert.equal((await f.execute(OWNER, `admin sethp ${FIRST.split('@')[0]} 101`, { at: NOW + 1_000 })).type, 'error');
  assert.equal(f.store.data.game.players[FIRST].hp, 100);
  assert.equal((await f.execute(OWNER, `admin sethp ${FIRST.split('@')[0]} 0`, { at: NOW + 2_000 })).type, 'admin-updated');
  assert.equal(f.store.data.game.players[FIRST].hp, 0);
  assert.equal((await f.execute(OWNER, `admin addlobos ${FIRST.split('@')[0]} 20`, { at: NOW + 3_000 })).type, 'admin-updated');
  const player = f.store.data.game.players[FIRST];
  assert.equal(player.wolves, 100);
  assert.deepEqual([player.attack, player.defense, player.counter], [40, 40, 20]);
});
