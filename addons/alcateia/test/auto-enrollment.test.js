import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { GameService } from '../src/game/service.js';
import { createPlayer, ensurePlayer } from '../src/game/players.js';
import { ensureRP } from '../src/rp/state.js';

const FIRST = '5511999999999@s.whatsapp.net';
const SECOND = '5511888888888@s.whatsapp.net';
const CHAT = '120363000000000001@g.us';
const OTHER = '120363000000000002@g.us';
const NOW = 1_700_000_000_000;

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-auto-enrollment-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'game.json'), store = new Store(file);
  const service = new GameService({ store, now: () => NOW, rng: () => 0.9 });
  let sequence = 0;
  const execute = (input, { actor = FIRST, at = NOW + sequence++ * 1000, target, using = service } = {}) => {
    const [command, ...args] = input.trim().split(/\s+/);
    return using.execute({ command, args, argText: args.join(' '), actor: { jid: actor, name: 'Jogador' },
      target: target ? { jid: target } : undefined, mentionCount: target ? 1 : 0, chatId: CHAT, now: at });
  };
  return { file, store, service, execute, player: jid => store.data.game.players[jid || FIRST] };
}

test('first wolf training automatically enrolls the actor and applies the requested action once', async t => {
  const f = fixture(t); const result = await f.execute('treino');
  assert.equal(result.type, 'training'); assert.equal(f.player().wolves, 25);
  assert.equal(f.player().coins, 100); assert.equal(f.player().lastTraining, NOW);
  const again = await f.execute('treino');
  assert.equal(again.code, 'COOLDOWN'); assert.equal(f.player().wolves, 25); assert.equal(f.player().coins, 100);
  assert.equal(new Store(f.file).data.game.players[FIRST].wolves, 25);
});

test('RP profile, profession and work are usable without start or rp iniciar', async t => {
  const f = fixture(t);
  assert.equal((await f.execute('rp perfil')).type, 'rp-profile');
  assert.ok(f.player().rp); assert.equal(f.player().rp.jobId, null);
  assert.equal((await f.execute('profissao cozinheiro')).type, 'rp-job');
  const work = await f.execute('trabalhar');
  assert.equal(work.type, 'rp-work'); assert.equal(f.player().coins, 145);
  assert.equal((await f.execute('perfil')).player.coins, 145);
});

test('choosing a first profession creates both profiles without a separate signup command', async t => {
  const f = fixture(t); const result = await f.execute('profissao cozinheiro');
  assert.equal(result.type, 'rp-job'); assert.equal(f.player().rp.jobId, 'cozinheiro');
  assert.equal(f.player().coins, 100); assert.equal(f.player().wolves, 20);
});

test('universal wallet seed wins over the standalone starter amount, with no second reward', async t => {
  const f = fixture(t); f.store.data.game.universalBalances = { [FIRST]: 777 };
  assert.equal((await f.execute('carteira')).player.coins, 777);
  assert.equal((await f.execute('rp perfil')).player.coins, 777);
  const manual = await f.execute('rp iniciar');
  assert.equal(manual.already, true); assert.equal(manual.player.coins, 777);
  assert.equal((await f.execute('start')).code, 'ALREADY_REGISTERED');
  assert.equal(f.player().createdAt, NOW);
});

test('first RP use preserves an existing wolf profile, cooldown, balance and inventory', async t => {
  const f = fixture(t); const player = createPlayer({ jid: FIRST, name: 'Perfil antigo' }, NOW - 5000);
  Object.assign(player, { hp: 34, coins: 2450, wolves: 67, attack: 40, defense: 25, counter: 2, lastTraining: NOW - 20, normalTrainingAt: NOW - 20 });
  ensureRP(player, NOW - 4000); player.rp.inventory.agua = 2; player.rp.experience = 45; player.rp.lastWork = NOW - 100;
  f.store.data.game.players[FIRST] = player; const before = structuredClone(player);
  assert.equal((await f.execute('rp perfil')).type, 'rp-profile');
  assert.equal((await f.execute('perfil')).type, 'profile');
  assert.deepEqual(f.player(), before);
});

test('concurrent first uses create one profile and one starter wallet', async t => {
  const f = fixture(t);
  const values = await Promise.all([f.execute('perfil', { at: NOW }), f.execute('rp perfil', { at: NOW + 1000 })]);
  assert.deepEqual(values.map(v => v.type), ['profile', 'rp-profile']);
  assert.equal(Object.keys(f.store.data.game.players).length, 1);
  assert.equal(f.player().coins, 100); assert.equal(f.player().wolves, 20); assert.equal(f.player().createdAt, NOW);
});

test('scoped automatic enrollment remains independent for each group', async t => {
  const f = fixture(t), first = new GameService({ store: f.store.scoped(CHAT) }), other = new GameService({ store: f.store.scoped(OTHER) });
  assert.equal((await f.execute('treino', { at: NOW, using: first })).type, 'training');
  assert.equal((await f.execute('rp perfil', { at: NOW, using: other })).type, 'rp-profile');
  assert.equal(f.store.data.games[CHAT].players[FIRST].wolves, 25);
  assert.equal(f.store.data.games[CHAT].players[FIRST].rp, undefined);
  assert.equal(f.store.data.games[OTHER].players[FIRST].wolves, 20);
  assert.ok(f.store.data.games[OTHER].players[FIRST].rp);
});

test('browsing menus, rankings and catalogs never manufactures a player', async t => {
  const f = fixture(t);
  for (const command of ['rank', 'loja', 'profissoes', 'rploja', 'rp menu']) assert.notEqual((await f.execute(command)).type, 'error', command);
  assert.deepEqual(f.store.data.game.players, {});
});

test('invalid commands and malformed first actions cannot persist partial enrollment', async t => {
  const f = fixture(t);
  for (const command of ['desconhecido', 'formacao A 999', 'rp perfil extra', 'rpcomprar desconhecido', 'admin status']) {
    const result = await f.execute(command); assert.equal(result.type, 'error', command);
    assert.deepEqual(f.store.data.game.players, {}, command);
  }
});

test('game bans cannot be bypassed by automatic RP signup or old explicit signup commands', async t => {
  const f = fixture(t); f.store.data.game.players[FIRST] = { ...createPlayer({ jid: FIRST, name: 'Banido' }, NOW), banned: true };
  for (const command of ['treino', 'rp perfil', 'rp iniciar', 'carteira', 'rploja', 'familia sair']) {
    assert.equal((await f.execute(command)).code, 'BANNED', command);
    assert.equal(f.player().rp, undefined); assert.equal(f.player().banned, true);
  }
});

test('automatic enrollment never recreates a corrupt existing player', async t => {
  const f = fixture(t); f.store.data.game.players[FIRST] = { ...createPlayer({ jid: FIRST }, NOW), coins: -1 };
  const result = await f.execute('perfil'); assert.equal(result.type, 'error'); assert.equal(f.player().coins, -1);
});

test('mentioning another user does not create a character or accept an interaction for them', async t => {
  const f = fixture(t); f.store.data.game.players[FIRST] = createPlayer({ jid: FIRST }, NOW);
  ensureRP(f.player(), NOW); f.player().coins = 1000;
  const result = await f.execute('transferir @alvo 50', { target: SECOND });
  assert.equal(result.code, 'NOT_REGISTERED'); assert.equal(f.player(SECOND), undefined); assert.equal(f.player().coins, 1000);
});

test('disk failure during first use does not retain profiles or grant a second starter amount on retry', async t => {
  const f = fixture(t); const rename = t.mock.method(fs, 'renameSync', () => { throw Error('disk rejected'); });
  await assert.rejects(f.execute('rp perfil'), /disk rejected/); assert.deepEqual(f.store.data.game.players, {});
  rename.mock.restore(); assert.equal((await f.execute('rp perfil', { at: NOW + 1000 })).type, 'rp-profile');
  assert.equal(f.player().coins, 100); assert.equal(Object.keys(new Store(f.file).data.game.players).length, 1);
});

test('ensurePlayer is idempotent and preserves existing records for owner issuance callers', () => {
  const game = { players: {}, universalBalances: { [FIRST]: 0 } };
  const player = ensurePlayer(game, { jid: FIRST, name: 'Novo' }, NOW); assert.equal(player.coins, 0);
  player.coins = 500; player.hp = 7;
  assert.equal(ensurePlayer(game, { jid: FIRST, name: 'Outro nome' }, NOW + 1000), player);
  assert.equal(player.coins, 500); assert.equal(player.hp, 7); assert.equal(player.name, 'Novo');
  player.banned = true; assert.throws(() => ensurePlayer(game, { jid: FIRST }, NOW), { code: 'BANNED' });
});
