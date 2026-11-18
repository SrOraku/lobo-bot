import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultGame, Store } from '../src/store.js';
import { createPlayer } from '../src/game/players.js';
import { CLAN_LIMITS, createClan, joinClan, leaveClan, kickMember, transferLeadership, clanProfile } from '../src/game/clans.js';
import { normalizeClanName } from '../src/game/validation.js';
import { ensureWar, attackTerritory, advanceWar, AI_KEY } from '../src/game/war.js';
import { GameService } from '../src/game/service.js';
import { createGameCommandHandler } from '../src/game/commands.js';

const HOUR = 3_600_000, DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-18T13:00:00Z');
const jid = n => `55119${String(n).padStart(8, '0')}@s.whatsapp.net`;
const key = name => normalizeClanName(name).key;

function world(count = 4) {
  const game = defaultGame(), players = {};
  for (let n = 1; n <= count; n++) {
    players[n] = { ...createPlayer({ jid: jid(n), name: `Lobo ${n}` }, NOW - DAY), coins: 1000 };
    game.players[players[n].jid] = players[n];
  }
  return { game, players };
}

test('sair: o líder passa a liderança ao membro mais antigo e o último a sair desfaz o clã', () => {
  const { game, players } = world();
  createClan(game, players[1], 'Lua', NOW);
  joinClan(game, players[2], 'Lua', NOW + 1);
  joinClan(game, players[3], 'Lua', NOW + 2);
  const left = leaveClan(game, players[1], NOW + HOUR);
  assert.equal(left.newLeader, jid(2), 'o mais antigo depois do líder');
  assert.equal(left.dissolved, false);
  assert.equal(players[1].clan, null); assert.equal(players[1].clanLeftAt, NOW + HOUR);
  assert.equal(game.clans[key('Lua')].leader, jid(2));
  assert.deepEqual(game.clans[key('Lua')].members, [jid(2), jid(3)]);
  // Membro comum sai sem mudar o líder.
  assert.equal(leaveClan(game, players[3], NOW + HOUR).newLeader, null);
  assert.equal(game.clans[key('Lua')].leader, jid(2));
  const last = leaveClan(game, players[2], NOW + HOUR);
  assert.equal(last.dissolved, true); assert.equal(Object.hasOwn(game.clans, key('Lua')), false);
  assert.throws(() => leaveClan(game, players[2], NOW + HOUR), { code: 'CLAN_NONE' });
  assert.throws(() => clanProfile(game, players[2]), /não faz parte/);
});

test('o clã desfeito libera os territórios dele na guerra', () => {
  const { game, players } = world(2);
  players[1].wolves = 60; players[1].attack = 40; players[1].counter = 10;
  createClan(game, players[1], 'Lua', NOW);
  ensureWar(game, NOW);
  attackTerritory(game, players[1], 'vale', { now: NOW, rng: () => 0.5 });
  assert.equal(game.war.territories.vale.owner, key('Lua'));
  leaveClan(game, players[1], NOW + HOUR);
  assert.equal(game.war.territories.vale.owner, null);
  assert.ok(game.war.territories.vale.defense <= 40);
  assert.equal(game.war.territories.floresta.owner, AI_KEY, 'territórios da Alcateia Sombria não mudam');
});

test('quem sai espera 24 h para criar ou entrar em outro clã', () => {
  const { game, players } = world();
  createClan(game, players[1], 'Lua', NOW);
  createClan(game, players[3], 'Garras', NOW);
  joinClan(game, players[2], 'Lua', NOW);
  leaveClan(game, players[2], NOW + HOUR);
  assert.throws(() => joinClan(game, players[2], 'Garras', NOW + 2 * HOUR), error => error.code === 'CLAN_WAIT' && /Aguarde 23h/.test(error.message));
  assert.throws(() => createClan(game, players[2], 'Nova', NOW + 2 * HOUR), { code: 'CLAN_WAIT' });
  assert.equal(players[2].coins, 1000, 'tentar não cobra nada');
  assert.equal(joinClan(game, players[2], 'Garras', NOW + HOUR + CLAN_LIMITS.rejoinWait).name, 'Garras');
});

test('expulsar: só o líder, nunca a si mesmo, só membros, inclusive banidos; o expulso entra em outro na hora', () => {
  const { game, players } = world();
  createClan(game, players[1], 'Lua', NOW);
  createClan(game, players[4], 'Garras', NOW);
  joinClan(game, players[2], 'Lua', NOW);
  joinClan(game, players[3], 'Lua', NOW);
  assert.throws(() => kickMember(game, players[2], players[3], NOW), { code: 'CLAN_LEADER' });
  assert.throws(() => kickMember(game, players[1], players[1], NOW), /clan sair/);
  assert.throws(() => kickMember(game, players[1], players[4], NOW), { code: 'CLAN_NOT_MEMBER' });
  players[3].banned = true;
  assert.equal(kickMember(game, players[1], players[3], NOW).target, jid(3));
  assert.deepEqual(game.clans[key('Lua')].members, [jid(1), jid(2)]); assert.equal(players[3].clan, null);
  assert.equal(players[3].clanLeftAt, undefined, 'expulsão não gera espera');
  kickMember(game, players[1], players[2], NOW);
  assert.equal(joinClan(game, players[2], 'Garras', NOW + 1).name, 'Garras');
});

test('passar a liderança: só o líder, para um membro', () => {
  const { game, players } = world();
  createClan(game, players[1], 'Lua', NOW);
  joinClan(game, players[2], 'Lua', NOW);
  assert.throws(() => transferLeadership(game, players[2], players[1], NOW), { code: 'CLAN_LEADER' });
  assert.throws(() => transferLeadership(game, players[1], players[3], NOW), { code: 'CLAN_NOT_MEMBER' });
  assert.throws(() => transferLeadership(game, players[1], players[1], NOW), /já é o líder/);
  assert.equal(transferLeadership(game, players[1], players[2], NOW).leader, jid(2));
  assert.equal(game.clans[key('Lua')].leader, jid(2));
  // Agora o antigo líder é membro comum e não expulsa ninguém.
  assert.throws(() => kickMember(game, players[1], players[2], NOW), { code: 'CLAN_LEADER' });
});

test(`limite de ${CLAN_LIMITS.maxMembers} membros por clã`, () => {
  const { game, players } = world(CLAN_LIMITS.maxMembers + 1);
  createClan(game, players[1], 'Lua', NOW);
  for (let n = 2; n <= CLAN_LIMITS.maxMembers; n++) joinClan(game, players[n], 'Lua', NOW);
  assert.equal(game.clans[key('Lua')].members.length, CLAN_LIMITS.maxMembers);
  assert.throws(() => joinClan(game, players[CLAN_LIMITS.maxMembers + 1], 'Lua', NOW), { code: 'CLAN_FULL' });
  leaveClan(game, players[2], NOW);
  assert.equal(joinClan(game, players[CLAN_LIMITS.maxMembers + 1], 'Lua', NOW).members.length, CLAN_LIMITS.maxMembers);
});

test('quem sai do clã antes do fechamento não recebe o prêmio da guerra', () => {
  const { game, players } = world(3);
  for (const n of [1, 2]) { players[n].wolves = 60; players[n].attack = 40; players[n].counter = 10; }
  createClan(game, players[1], 'Lua', NOW);
  joinClan(game, players[2], 'Lua', NOW);
  ensureWar(game, NOW);
  attackTerritory(game, players[1], 'vale', { now: NOW, rng: () => 0.5 });
  attackTerritory(game, players[2], 'pico', { now: NOW, rng: () => 0.5 });
  leaveClan(game, players[2], NOW + HOUR);
  const before = [players[1].coins, players[2].coins];
  advanceWar(game, Date.parse('2026-11-23T03:00:01Z'), () => 0.5);
  assert.deepEqual([players[1].coins - before[0], players[2].coins - before[1]], [300, 0]);
});

test('!clan sair, expulsar e lider pelo serviço e pelas mensagens do WhatsApp', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-clans-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'db.json'));
  const CHAT = '120363000000000001@g.us';
  let now = NOW;
  const service = new GameService({ store: store.scoped(CHAT), now: () => now });
  const run = (n, text, target) => {
    now += 2000;
    const [command, ...args] = text.split(/\s+/);
    return service.execute({ command, args, argText: args.join(' '), actor: { jid: jid(n), name: `Lobo ${n}` }, chatId: CHAT, now,
      ...(target ? { target: { jid: jid(target) }, mentionCount: 1 } : {}) });
  };
  for (const n of [1, 2, 3]) { await run(n, 'perfil'); store.data.games[CHAT].players[jid(n)].coins = 1000; }
  assert.equal((await run(1, 'clan criar Lua')).type, 'clan');
  await run(2, 'clan entrar Lua'); await run(3, 'clan entrar Lua');
  assert.equal((await run(1, 'clan expulsar')).message, 'Mencione exatamente um membro: !clan expulsar @membro.');
  assert.equal((await run(2, 'clan expulsar @x', 3)).code, 'CLAN_LEADER');
  const kicked = await run(1, 'clan expulsar @x', 3);
  assert.deepEqual([kicked.type, kicked.action, kicked.targetName], ['clan-update', 'expulsar', 'Lobo 3']);
  const lead = await run(1, 'clan líder @x', 2);
  assert.deepEqual([lead.action, lead.targetName], ['lider', 'Lobo 2']);
  const left = await run(2, 'clan sair');
  assert.deepEqual([left.action, left.newLeader, left.newLeaderName, left.dissolved], ['sair', jid(1), 'Lobo 1', false]);
  assert.equal((await run(2, 'clan sair agora')).message, 'Use !clan sair.');
  assert.match((await run(2, 'clan dançar')).message, /!clan sair, !clan expulsar @membro ou !clan lider @membro/);
  assert.equal(store.data.games[CHAT].clans[key('Lua')].leader, jid(1));

  // Mensagens: o handler resolve a menção e mostra o resultado no grupo.
  const replies = [];
  const respond = response => createGameCommandHandler({ service: { execute: async request => { replies.push(request); return response; } }, backupManager: {}, now: () => NOW });
  const ctx = (input, mentions = []) => ({ command: 'clan', args: input.split(' '), argText: input, sender: jid(1), senderPhone: jid(1), displayName: 'Lobo 1', chatId: CHAT, isGroup: true,
    config: { prefix: '!' }, msg: { message: { extendedTextMessage: { text: '!clan ' + input, contextInfo: { mentionedJid: mentions } } } },
    reply: async text => replies.push(text.replace(/[*_`]/g, '')), resolveMember: async value => ({ jid: value, phoneNumber: value, inGroup: true }) });
  await respond({ type: 'clan-update', action: 'expulsar', clan: { name: 'Lua' }, targetName: 'Lobo 3' })(ctx('expulsar @x', [jid(3)]));
  assert.deepEqual(replies[0].target, { jid: jid(3), name: undefined }, 'a menção chega ao serviço');
  assert.match(replies.at(-1), /Lobo 3 foi removido do clã Lua/);
  replies.length = 0;
  await respond({ type: 'clan-update', action: 'sair', clan: { name: 'Lua' }, newLeader: jid(2), newLeaderName: 'Lobo 2', dissolved: false })(ctx('sair'));
  assert.match(replies.at(-1), /Você saiu do clã Lua/); assert.match(replies.at(-1), /Novo líder: Lobo 2/); assert.match(replies.at(-1), /24 h/);
  await respond({ type: 'clan-update', action: 'sair', clan: { name: 'Lua' }, newLeader: null, dissolved: true })(ctx('sair'));
  assert.match(replies.at(-1), /foi desfeito/);
  await respond({ type: 'clan-update', action: 'lider', clan: { name: 'Lua' }, targetName: 'Lobo 2' })(ctx('lider @x', [jid(2)]));
  assert.match(replies.at(-1), /Lobo 2 agora lidera o clã Lua/);
});
