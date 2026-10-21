import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, defaultGame } from '../src/store.js';
import { GameService } from '../src/game/service.js';
import { createPlayer } from '../src/game/players.js';
import { BackupManager } from '../src/game/backup.js';
import { ensureRP } from '../src/rp/state.js';

const OWNER = '5543920030769@s.whatsapp.net';
const FIRST = '5511999999999@s.whatsapp.net';
const SECOND = '5511888888888@s.whatsapp.net';
const THIRD = '5511777777777@s.whatsapp.net';
const CHAT = '120363000000000001@g.us';
const OTHER_CHAT = '120363000000000002@g.us';
const NOW = 1_700_000_000_000;

function fixture(t, { rng = () => 0.9 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-rp-service-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'database.json');
  const store = new Store(file);
  const service = new GameService({ store, now: () => NOW, rng });
  let sequence = 0;
  function seed(jid, { rp = true, coins = 100, ...overrides } = {}) {
    const player = { ...createPlayer({ jid, name: 'Lobo RP' }, NOW), coins, ...overrides };
    if (rp) ensureRP(player, NOW);
    store.data.game.players[jid] = player;
    return player;
  }
  function execute(jid, input, { at, chatId = CHAT, target, mentionCount, using = service } = {}) {
    const [command, ...args] = input.trim().split(/\s+/);
    return using.execute({ command, args, argText: input.trim().slice(command.length).trim(),
      actor: { jid, name: 'Lobo RP' }, target: target ? { jid: target } : undefined,
      mentionCount: mentionCount ?? (target ? 1 : 0), chatId, now: at ?? NOW + sequence++ * 1_000 });
  }
  function player(jid = FIRST) { return store.data.game.players[jid]; }
  function total() {
    return Object.values(store.data.game.players).reduce((sum, entry) => sum + entry.coins, 0) +
      Object.values(store.data.game.rp?.families || {}).reduce((sum, family) => sum + family.coins, 0);
  }
  return { directory, file, store, service, seed, execute, player, total };
}

function domainState(f) {
  return structuredClone({ players: f.store.data.game.players, world: f.store.data.game.rp });
}

test('RP registration reuses an existing wallet and repeated registration preserves progress without a bonus', async t => {
  const f = fixture(t);
  f.seed(FIRST, { rp: false, coins: 2_450, hp: 37, wolves: 30 });
  const registration = await f.execute(FIRST, 'rp iniciar');
  assert.equal(registration.type, 'rp-registered');
  assert.equal(registration.already, false);
  assert.equal(registration.player.coins, 2_450);
  assert.equal(f.player().hp, 37);
  assert.equal(f.player().wolves, 30);
  f.player().rp.inventory.agua = 2;
  f.player().rp.experience = 45;
  const repeated = await f.execute(FIRST, 'rp iniciar');
  assert.equal(repeated.already, true);
  assert.equal(f.player().coins, 2_450);
  assert.equal(f.player().rp.inventory.agua, 2);
  assert.equal(f.player().rp.experience, 45);
  assert.equal(Object.keys(f.store.data.game.players).length, 1);
});

test('starting RP first grants the single initial wallet and does not grant another wolf-registration bonus', async t => {
  const f = fixture(t);
  assert.equal((await f.execute(FIRST, 'rp iniciar')).type, 'rp-registered');
  assert.equal(f.player().coins, 100);
  assert.equal(f.player().wolves, 20);
  assert.equal(f.player().hp, 100);
  const duplicate = await f.execute(FIRST, 'start');
  assert.equal(duplicate.type, 'error');
  assert.equal(duplicate.code, 'ALREADY_REGISTERED');
  assert.equal((await f.execute(FIRST, 'rp iniciar')).already, true);
  assert.equal(f.player().coins, 100);
});

test('RP wages are immediately available in the wolf shop through the same shared balance', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  assert.equal((await f.execute(FIRST, 'profissao cozinheiro')).type, 'rp-job');
  const work = await f.execute(FIRST, 'trabalhar');
  assert.equal(work.type, 'rp-work');
  assert.equal(work.reward.amount, 45);
  assert.equal(f.player().coins, 145);
  assert.equal((await f.execute(FIRST, 'comprar 1')).type, 'purchase');
  assert.equal(f.player().coins, 45);
  assert.equal(f.player().boosts[0].type, 'attack');
  assert.equal((await f.execute(FIRST, 'carteira')).player.coins, 45);
  assert.equal((await f.execute(FIRST, 'perfil')).player.coins, 45);
});

test('simultaneous RP and wolf purchases across services cannot double-spend the shared wallet', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 150 });
  const otherService = new GameService({ store: f.store });
  const results = await Promise.all([
    f.execute(FIRST, 'rpcomprar refeicao 5', { at: NOW }),
    f.execute(FIRST, 'comprar 1', { at: NOW + 1_000, chatId: OTHER_CHAT, using: otherService }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['rp-purchase', 'error']);
  assert.equal(results[1].code, 'BALANCE');
  assert.equal(f.player().coins, 50);
  assert.equal(f.player().rp.inventory.refeicao, 5);
  assert.deepEqual(f.player().boosts, []);
});

test('concurrent transfers conserve total money and do not auto-register or reward recipient RP profiles', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.seed(SECOND, { rp: false });
  f.seed(THIRD);
  const before = f.total();
  const results = await Promise.all([
    f.execute(FIRST, 'transferir @segundo 60', { target: SECOND, at: NOW }),
    f.execute(FIRST, 'transferir @terceiro 60', { target: THIRD, at: NOW + 1_000, chatId: OTHER_CHAT }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['rp-transfer', 'error']);
  assert.equal(results[1].code, 'BALANCE');
  assert.equal(f.player().coins, 40);
  assert.equal(f.player(SECOND).coins, 160);
  assert.equal(f.player(SECOND).rp, undefined);
  assert.equal(f.player(THIRD).coins, 100);
  assert.equal(f.total(), before);
  assert.equal((await f.execute(SECOND, 'rp iniciar', { at: NOW + 2_000 })).type, 'rp-registered');
  assert.equal(f.player(SECOND).coins, 160);
  assert.equal(f.total(), before);
});

test('invalid transfer targets and multiple mentions do not create players or move funds', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  const missing = await f.execute(FIRST, 'transferir @ausente 10', { target: SECOND });
  assert.equal(missing.type, 'error');
  assert.equal(missing.code, 'NOT_REGISTERED');
  assert.equal(f.player().coins, 100);
  assert.equal(f.player(SECOND), undefined);
  f.seed(SECOND);
  const ambiguous = await f.execute(FIRST, 'transferir @a @b 10', { target: SECOND, mentionCount: 2 });
  assert.equal(ambiguous.type, 'error');
  assert.equal(f.player().coins, 100);
  assert.equal(f.player(SECOND).coins, 100);
});

test('family consent and treasury transactions preserve wallets across joins, leadership changes and closure', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 1_000 });
  f.seed(SECOND, { coins: 1_000 });
  const created = await f.execute(FIRST, 'familia criar Luna');
  assert.equal(created.type, 'rp-family');
  const familyId = created.family.id;
  const total = f.total();
  assert.equal(total, 1_800);
  const targetBefore = structuredClone(f.player(SECOND));
  const invitation = await f.execute(FIRST, 'familia convidar @segundo irmao', { target: SECOND });
  assert.equal(invitation.type, 'rp-invite');
  assert.deepEqual(f.player(SECOND), targetBefore);
  assert.equal((await f.execute(SECOND, `familia aceitar ${invitation.invite.id}`)).type, 'rp-family-response');
  assert.equal(f.player(SECOND).rp.familyId, familyId);
  assert.equal((await f.execute(SECOND, 'familia depositar 50')).type, 'rp-family-bank');
  assert.equal(f.total(), total);
  assert.equal((await f.execute(SECOND, 'familia retirar 10')).code, 'FAMILY_LEADER');
  assert.equal((await f.execute(FIRST, 'familia retirar 20')).type, 'rp-family-bank');
  assert.equal(f.store.data.game.rp.families[familyId].coins, 30);
  assert.equal(f.total(), total);
  assert.equal((await f.execute(FIRST, 'familia sair')).newLeader, SECOND);
  const closed = await f.execute(SECOND, 'familia sair');
  assert.equal(closed.type, 'rp-family-left');
  assert.equal(closed.refunded, 30);
  assert.equal(f.store.data.game.rp.families[familyId], undefined);
  assert.equal(f.total(), total);
});

test('simultaneous acceptance of a marriage invitation consumes one ring and adds one spouse', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 1_000 });
  f.seed(SECOND);
  f.player().rp.inventory.alianca = 2;
  await f.execute(FIRST, 'familia criar Luna', { at: NOW });
  const proposal = await f.execute(FIRST, 'familia casar @segundo', { target: SECOND, at: NOW + 1_000 });
  const results = await Promise.all([
    f.execute(SECOND, `familia aceitar ${proposal.invite.id}`, { at: NOW + 2_000 }),
    f.execute(SECOND, `familia aceitar ${proposal.invite.id}`, { at: NOW + 3_000, chatId: OTHER_CHAT }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['rp-family-response', 'error']);
  assert.equal(f.player().rp.inventory.alianca, 1);
  assert.equal(f.player().rp.relationship.spouse, SECOND);
  assert.equal(f.player(SECOND).rp.relationship.spouse, FIRST);
  assert.equal(Object.values(f.store.data.game.rp.families)[0].members.length, 2);
});

test('gift use requires a target, consumes the sender inventory and changes only recipient RP reputation', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.seed(SECOND, { hp: 42 });
  f.player().rp.inventory.presente = 1;
  const missingTarget = await f.execute(FIRST, 'usar presente');
  assert.equal(missingTarget.type, 'error');
  assert.equal(f.player().rp.inventory.presente, 1);
  const used = await f.execute(FIRST, 'usar presente @segundo', { target: SECOND });
  assert.equal(used.type, 'rp-use');
  assert.equal(used.result.targetJid, SECOND);
  assert.equal(f.player().rp.inventory.presente, undefined);
  assert.equal(f.player(SECOND).rp.reputation, 3);
  assert.equal(f.player(SECOND).hp, 42);
  assert.equal(f.player().coins, 100);
  assert.equal(f.player(SECOND).coins, 100);
});

test('medical actions charge the doctor and restore RP health without touching wolf HP or the target wallet', async t => {
  const f = fixture(t);
  f.seed(FIRST, { hp: 11 });
  f.seed(SECOND, { hp: 27 });
  f.player().rp.jobId = 'medico';
  f.player().rp.experience = 100;
  f.player(SECOND).rp.health = 60;
  const action = await f.execute(FIRST, 'acao @segundo', { target: SECOND });
  assert.equal(action.type, 'rp-action');
  assert.equal(action.result.healthGain, 20);
  assert.equal(f.player().coins, 80);
  assert.equal(f.player(SECOND).coins, 100);
  assert.equal(f.player(SECOND).rp.health, 80);
  assert.equal(f.player().hp, 11);
  assert.equal(f.player(SECOND).hp, 27);
  assert.equal(f.player().rp.experience, 105);
});

test('a professional action against an unstarted RP target never starts, charges or changes that target', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.seed(SECOND, { rp: false });
  f.player().rp.jobId = 'medico';
  f.player().rp.experience = 100;
  const before = structuredClone(f.player(SECOND));
  const result = await f.execute(FIRST, 'acao @segundo', { target: SECOND });
  assert.equal(result.type, 'error');
  assert.deepEqual(f.player(SECOND), before);
  assert.equal(f.player().coins, 100);
  assert.equal(f.player().rp.lastJobAction, null);
});

test('RP consumables clamp needs at 100 and never heal the separate wolf HP', async t => {
  const f = fixture(t);
  f.seed(FIRST, { hp: 17 });
  Object.assign(f.player().rp, { hunger: 98, energy: 95, health: 90,
    inventory: { banquete: 1, agua: 1, remedio: 1 } });
  assert.equal((await f.execute(FIRST, 'usar banquete')).type, 'rp-use');
  assert.equal((await f.execute(FIRST, 'usar agua')).type, 'rp-use');
  assert.equal((await f.execute(FIRST, 'usar remedio')).type, 'rp-use');
  assert.equal(f.player().rp.hunger, 100);
  assert.equal(f.player().rp.energy, 100);
  assert.equal(f.player().rp.health, 100);
  assert.equal(f.player().hp, 17);
  assert.equal(f.player().coins, 100);
  const profile = await f.execute(FIRST, 'rp perfil');
  assert.equal(profile.type, 'rp-profile');
  assert.equal(profile.player.coins, 100);
  assert.equal(profile.rp.health, 100);
});

test('duplicate work across chats awards one salary, and changing careers does not reset its cooldown', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.player().rp.jobId = 'cozinheiro';
  const results = await Promise.all([
    f.execute(FIRST, 'trabalhar', { at: NOW }),
    f.execute(FIRST, 'trabalhar', { at: NOW + 1_000, chatId: OTHER_CHAT }),
  ]);
  assert.deepEqual(results.map(result => result.type), ['rp-work', 'error']);
  assert.equal(results[1].code, 'COOLDOWN');
  assert.equal(f.player().coins, 145);
  assert.equal((await f.execute(FIRST, 'profissao padeiro', { at: NOW + 2_000 })).type, 'rp-job');
  assert.equal((await f.execute(FIRST, 'trabalhar', { at: NOW + 3_000 })).code, 'COOLDOWN');
  assert.equal(f.player().coins, 145);
});

test('game bans block RP operations while voluntary family departure remains available', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 500 });
  const family = await f.execute(FIRST, 'familia criar Luna', { at: NOW });
  await f.execute(FIRST, 'familia depositar 100', { at: NOW + 1_000 });
  const ban = await f.execute(OWNER, `admin ban ${FIRST.split('@')[0]}`, { at: NOW + 2_000 });
  assert.equal(ban.type, 'admin-updated');
  for (const [index, command] of ['rp perfil', 'rploja', 'trabalhar', 'familia perfil'].entries()) {
    const result = await f.execute(FIRST, command, { at: NOW + (index + 3) * 1_000 });
    assert.equal(result.type, 'error');
    assert.equal(result.code, 'BANNED');
  }
  const departure = await f.execute(FIRST, 'familia sair', { at: NOW + 8_000 });
  assert.equal(departure.type, 'rp-family-left');
  assert.equal(departure.refunded, 100);
  assert.equal(f.player().coins, 300);
  assert.equal(f.store.data.game.rp.families[family.family.id], undefined);
  assert.equal(f.player().banned, true);
});

test('RP and wolf commands share a persisted per-user quota instead of independent allowances', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  assert.equal((await f.execute(FIRST, 'carteira', { at: NOW })).type, 'rp-wallet');
  assert.equal((await f.execute(FIRST, 'perfil', { at: NOW + 1 })).type, 'rate-limit');
  const restored = new Store(f.file);
  const restarted = new GameService({ store: restored });
  const rejected = await f.execute(FIRST, 'rp perfil', { at: NOW + 999, using: restarted });
  assert.equal(rejected.type, 'rate-limit');
  assert.equal((await f.execute(FIRST, 'perfil', { at: NOW + 1_000, using: restarted })).type, 'profile');
});

test('legacy game data migrates RP without changing coins, group settings or clan records and is included in backups', async t => {
  const f = fixture(t);
  const legacyPlayer = createPlayer({ jid: FIRST, name: 'Lobo antigo' }, NOW - 1_000);
  legacyPlayer.coins = 321;
  legacyPlayer.clan = 'antigo';
  const legacy = { version: 1, groups: { [CHAT]: { rules: 'Preservar.', warnings: { [FIRST]: 2 } } },
    game: { ...defaultGame(), players: { [FIRST]: legacyPlayer },
      clans: { antigo: { key: 'antigo', name: 'Antigo', leader: FIRST, members: [FIRST], coins: 9, wins: 2, losses: 0 } } } };
  fs.writeFileSync(f.file, JSON.stringify(legacy));
  const migrated = new Store(f.file);
  const migratedService = new GameService({ store: migrated });
  assert.equal((await f.execute(FIRST, 'rp iniciar', { using: migratedService, at: NOW })).type, 'rp-registered');
  assert.equal((await f.execute(FIRST, 'rpcomprar agua', { using: migratedService, at: NOW + 1_000 })).type, 'rp-purchase');
  const restored = new Store(f.file);
  assert.equal(restored.data.game.players[FIRST].coins, 316);
  assert.equal(restored.data.game.players[FIRST].rp.inventory.agua, 1);
  assert.deepEqual(restored.data.groups, legacy.groups);
  assert.deepEqual(restored.data.game.clans, legacy.game.clans);
  const backupManager = new BackupManager({ store: restored, directory: path.join(f.directory, 'backups'), now: () => NOW });
  const file = await backupManager.create();
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(backup.data.game, restored.data.game);
  assert.deepEqual(backup.data.groups, legacy.groups);
  assert.equal(Object.hasOwn(backup.data, 'auth'), false);
});

test('a failed RP purchase save rolls back both shared money and inventory before a later retry', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.store.save();
  const before = fs.readFileSync(f.file, 'utf8');
  const rename = t.mock.method(fs, 'renameSync', () => { throw new Error('disk unavailable'); });
  await assert.rejects(f.execute(FIRST, 'rpcomprar refeicao', { at: NOW }), /disk unavailable/);
  assert.equal(f.player().coins, 100);
  assert.equal(f.player().rp.inventory.refeicao, undefined);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  rename.mock.restore();
  assert.equal((await f.execute(FIRST, 'rpcomprar refeicao', { at: NOW + 1_000 })).type, 'rp-purchase');
  assert.equal(f.player().coins, 80);
  assert.equal(f.player().rp.inventory.refeicao, 1);
});

test('invalid professional action arguments do not run a default action or award money and experience', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  Object.assign(f.player().rp, { jobId: 'policial', experience: 200 });
  const before = domainState(f);
  const result = await f.execute(FIRST, 'acao acao-inexistente');
  assert.equal(result.type, 'error');
  assert.match(result.message, /Use !acao/);
  assert.deepEqual(domainState(f), before);
  assert.equal(f.player().coins, 100);
  assert.equal(f.player().rp.lastJobAction, null);
});

test('an unresolved action mention never falls back to healing or charging the sender', async t => {
  const f = fixture(t);
  f.seed(FIRST, { hp: 11 });
  Object.assign(f.player().rp, { jobId: 'medico', experience: 100, health: 50 });
  const before = domainState(f);
  const result = await f.execute(FIRST, 'acao @incerto', { mentionCount: 1 });
  assert.equal(result.type, 'error');
  assert.match(result.message, /identificar.*mencionado/);
  assert.deepEqual(domainState(f), before);
  assert.equal(f.player().rp.health, 50);
  assert.equal(f.player().coins, 100);
  assert.equal(f.player().hp, 11);
});

test('unresolved item mentions never consume inventory or apply self-care, including hidden mention metadata', async t => {
  const f = fixture(t);
  f.seed(FIRST, { hp: 17 });
  Object.assign(f.player().rp, { health: 50, inventory: { remedio: 1 } });
  const before = domainState(f);
  for (const input of ['usar remedio @incerto', 'usar remedio']) {
    const result = await f.execute(FIRST, input, { mentionCount: 1 });
    assert.equal(result.type, 'error');
    assert.match(result.message, /identificar.*mencionado/);
    assert.deepEqual(domainState(f), before);
  }
  assert.equal(f.player().rp.health, 50);
  assert.equal(f.player().rp.inventory.remedio, 1);
  assert.equal(f.player().coins, 100);
  assert.equal(f.player().hp, 17);
});

test('extra transfer arguments cannot move money or create a recipient RP profile', async t => {
  const f = fixture(t);
  f.seed(FIRST);
  f.seed(SECOND, { rp: false });
  const before = domainState(f);
  const result = await f.execute(FIRST, 'transferir @segundo palavra-extra 50', { target: SECOND });
  assert.equal(result.type, 'error');
  assert.match(result.message, /Use !transferir/);
  assert.deepEqual(domainState(f), before);
  assert.equal(f.player().coins, 100);
  assert.equal(f.player(SECOND).coins, 100);
  assert.equal(f.player(SECOND).rp, undefined);
});

test('invalid family relationship is rejected instead of silently creating a relative invitation', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 1_000 });
  f.seed(SECOND);
  const created = await f.execute(FIRST, 'familia criar Luna');
  assert.equal(created.type, 'rp-family');
  const before = domainState(f);
  const result = await f.execute(FIRST, 'familia convidar @segundo lider', { target: SECOND });
  assert.equal(result.type, 'error');
  assert.match(result.message, /Parentesco inválido/);
  assert.deepEqual(domainState(f), before);
  assert.deepEqual(f.store.data.game.rp.invites, {});
  assert.equal(f.player(SECOND).rp.familyId, null);
});

test('divorce without a marriage cannot delete a family or refund its treasury', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 1_000 });
  const created = await f.execute(FIRST, 'familia criar Luna');
  await f.execute(FIRST, 'familia depositar 100');
  const before = domainState(f);
  const result = await f.execute(FIRST, 'familia divorciar');
  assert.equal(result.type, 'error');
  assert.match(result.message, /não tem um casamento RP/);
  assert.deepEqual(domainState(f), before);
  assert.equal(f.player().rp.familyId, created.family.id);
  assert.equal(f.store.data.game.rp.families[created.family.id].coins, 100);
  assert.equal(f.player().coins, 700);
});

test('a confirmed divorce clears both marriage links and normalizes the remaining spouse role without stale profiles', async t => {
  const f = fixture(t);
  f.seed(FIRST, { coins: 1_000 });
  f.seed(SECOND);
  f.seed(THIRD);
  f.player().rp.inventory.alianca = 1;
  const created = await f.execute(FIRST, 'familia criar Luna');
  const invitation = await f.execute(FIRST, 'familia convidar @terceiro parente', { target: THIRD });
  assert.equal((await f.execute(THIRD, `familia aceitar ${invitation.invite.id}`)).type, 'rp-family-response');
  const proposal = await f.execute(FIRST, 'familia casar @segundo', { target: SECOND });
  assert.equal((await f.execute(SECOND, `familia aceitar ${proposal.invite.id}`)).type, 'rp-family-response');
  assert.equal(f.player().rp.relationship.spouse, SECOND);
  assert.equal(f.player(SECOND).rp.relationship.spouse, FIRST);
  assert.equal(f.player().rp.inventory.alianca, 0);
  const beforeCoins = f.total();
  const result = await f.execute(FIRST, 'familia divorciar');
  assert.equal(result.type, 'rp-family-left');
  assert.equal(result.newLeader, THIRD);
  assert.equal(f.player().rp.relationship, null);
  assert.equal(f.player(SECOND).rp.relationship, null);
  assert.equal(f.player().rp.familyId, null);
  assert.equal(f.player(SECOND).rp.familyId, created.family.id);
  const family = f.store.data.game.rp.families[created.family.id];
  assert.equal(family.members.find(member => member.jid === THIRD).role, 'leader');
  assert.equal(family.members.find(member => member.jid === SECOND).role, 'parente');
  assert.equal(family.members.some(member => member.jid === FIRST), false);
  assert.equal(f.total(), beforeCoins);
  const leftProfile = await f.execute(FIRST, 'rp perfil');
  assert.equal(leftProfile.family, null);
  assert.equal(leftProfile.rp.relationship, null);
  const remainingProfile = await f.execute(SECOND, 'rp perfil');
  assert.equal(remainingProfile.family.name, 'Luna');
  assert.equal(remainingProfile.rp.relationship, null);
});
