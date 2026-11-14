import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, defaultGame } from '../src/store.js';
import { GameService } from '../src/game/service.js';
import { createPlayer } from '../src/game/players.js';
import { createClan, joinClan } from '../src/game/clans.js';
import { normalizeClanName } from '../src/game/validation.js';
import { AI_KEY, AI_NAME, TERRITORIES, WAR, weekOf, weekBounds, ensureWar, findTerritory, attackTerritory,
  reinforceTerritory, ranking, advanceWar, drainWarOutbox, warCommand } from '../src/game/war.js';
import { warText, warAnnouncement } from '../src/game/war-messages.js';

const HOUR = 3_600_000, DAY = 24 * HOUR;
// Terça-feira, 10/11/2026, 10:00 em Brasília (13:00 UTC).
const NOW = Date.parse('2026-11-10T13:00:00Z');
const MONDAY = Date.parse('2026-11-09T03:00:00Z');
const jid = n => `55119${String(n).padStart(8, '0')}@s.whatsapp.net`;

// Partida em memória com jogadores já ricos o bastante para fundar alcateias.
function world({ clans = { Lua: [1, 2], Garras: [3] }, stats = {} } = {}) {
  const game = defaultGame();
  const players = {};
  for (const [name, members] of Object.entries(clans)) {
    members.forEach((n, index) => {
      const player = { ...createPlayer({ jid: jid(n), name: `Lobo ${n}` }, NOW - DAY), coins: 1000, ...(stats[n] || {}) };
      game.players[player.jid] = player; players[n] = player;
      if (index === 0) createClan(game, player, name, NOW - DAY); else joinClan(game, player, name, NOW - DAY);
    });
  }
  return { game, players, key: name => normalizeClanName(name).key };
}
const at = (value = 0.5) => ({ now: NOW, rng: () => value });

test('a semana da guerra vira na segunda-feira, 00h de Brasília', () => {
  assert.equal(weekOf(MONDAY), weekOf(MONDAY + 7 * DAY - 1));
  assert.equal(weekOf(MONDAY - 1), weekOf(MONDAY) - 1);
  assert.equal(weekOf(MONDAY + 7 * DAY), weekOf(MONDAY) + 1);
  assert.deepEqual(weekBounds(weekOf(NOW)), { start: MONDAY, end: MONDAY + 7 * DAY });
});

test('mapa inicial: sete territórios, três com a Alcateia Sombria e nenhum clã pode usar a chave dela', () => {
  const { game } = world();
  const war = ensureWar(game, NOW);
  assert.equal(TERRITORIES.length, 7);
  assert.deepEqual(Object.keys(war.territories), TERRITORIES.map(territory => territory.id));
  const owners = TERRITORIES.map(territory => war.territories[territory.id]);
  assert.deepEqual(owners.map(state => state.owner), [null, AI_KEY, null, AI_KEY, null, AI_KEY, null]);
  assert.deepEqual(owners.map(state => state.defense), [40, 60, 40, 60, 40, 60, 40]);
  assert.equal(war.weekId, weekOf(NOW)); assert.equal(war.announce, true); assert.deepEqual(war.outbox, []);
  assert.throws(() => normalizeClanName(AI_KEY), /nome do clã/);
  assert.equal(ensureWar(game, NOW + 5), war, 'reabrir não recria a semana');
});

test('territórios são encontrados por número, id ou nome, sem depender de acentos', () => {
  assert.equal(findTerritory('1').id, 'vale'); assert.equal(findTerritory('7').id, 'colina');
  assert.equal(findTerritory('RUINAS').id, 'ruinas'); assert.equal(findTerritory('ruínas antigas').id, 'ruinas');
  assert.equal(findTerritory('pântano').id, 'pantano'); assert.equal(findTerritory('Cristal').id, 'caverna');
  for (const bad of ['', '0', '8', 'a', 'território inexistente']) assert.throws(() => findTerritory(bad), { code: 'WAR_TERRITORY' }, bad);
});

test('atacar exige alcateia, tira defesa, pontua pelo dano e respeita os 20 minutos', () => {
  const { game, players, key } = world({ clans: { Lua: [1] }, stats: { 1: { wolves: 40, attack: 20, defense: 10, counter: 4 } } });
  const loner = { ...createPlayer({ jid: jid(9), name: 'Sozinho' }, NOW), coins: 0 };
  game.players[loner.jid] = loner;
  assert.throws(() => attackTerritory(game, loner, '1', at()), { code: 'WAR_NO_CLAN' });

  // Força = ataque × 1,2 + contra × 0,5 = 26; com sorteio 0,5 o fator é 1,0.
  const result = attackTerritory(game, players[1], '2', at(0.5));
  assert.equal(result.type, 'war'); assert.equal(result.view, 'attack');
  assert.equal(result.damage, 26); assert.equal(result.before, 60); assert.equal(result.after, 34); assert.equal(result.captured, false);
  assert.equal(result.previousOwner, AI_NAME); assert.equal(result.points, 26); assert.equal(result.total, 26);
  assert.equal(game.war.territories.floresta.defense, 34); assert.equal(game.war.territories.floresta.owner, AI_KEY);
  assert.deepEqual(game.war.scores[key('Lua')].participants, { [jid(1)]: 1 });
  assert.equal(game.war.lastHumanAt, NOW);

  assert.throws(() => attackTerritory(game, players[1], '2', at()), { code: 'COOLDOWN' });
  assert.throws(() => attackTerritory(game, players[1], '2', { now: NOW + WAR.actionCooldown - 1, rng: () => 0.5 }), /Aguarde/);
  assert.equal(game.war.territories.floresta.defense, 34, 'ação recusada não muda o mapa');
  // Sorteio mínimo e máximo: 80% a 120% da força.
  assert.equal(attackTerritory(game, players[1], '4', { now: NOW + WAR.actionCooldown, rng: () => 0 }).damage, 21);
  assert.equal(attackTerritory(game, players[1], '6', { now: NOW + 2 * WAR.actionCooldown, rng: () => 0.999 }).damage, 31);
  assert.throws(() => attackTerritory(game, players[1], '1', { now: NOW + 3 * WAR.actionCooldown, rng: () => 1 }), /Sorteio inválido/);
});

test('zerar a defesa conquista o território: +50 pontos, defesa 35 e glória para o clã', () => {
  const { game, players, key } = world({ clans: { Lua: [1], Garras: [3] }, stats: { 1: { wolves: 60, attack: 40, defense: 10, counter: 10 } } });
  // Força 53: o território livre (40) cai no primeiro ataque.
  const result = attackTerritory(game, players[1], 'vale', at(0.5));
  assert.equal(result.captured, true); assert.equal(result.damage, 40); assert.equal(result.after, 0); assert.equal(result.previousOwner, null);
  assert.equal(result.points, 40 + WAR.capturePoints); assert.equal(result.defense, WAR.captureDefense);
  assert.deepEqual(game.war.territories.vale, { owner: key('Lua'), defense: 35 });
  assert.equal(game.clans[key('Lua')].warConquests, 1);
  assert.equal(game.war.scores[key('Lua')].conquests, 1);
  assert.throws(() => attackTerritory(game, players[1], 'vale', { now: NOW + DAY, rng: () => 0.5 }), { code: 'WAR_OWN' });
  // Outra alcateia pode tomar de volta, e o território troca de dono.
  game.players[jid(3)].wolves = 60; game.players[jid(3)].attack = 40;
  const back = attackTerritory(game, players[3], 'vale', at(0.5));
  assert.equal(back.captured, true); assert.equal(back.previousOwner, 'Lua'); assert.equal(game.war.territories.vale.owner, key('Garras'));
});

test('reforçar só vale para território próprio, para no limite e rende metade em pontos', () => {
  const { game, players, key } = world({ clans: { Lua: [1, 2] }, stats: { 1: { wolves: 60, attack: 40, counter: 10, defense: 10 }, 2: { wolves: 60, attack: 0, defense: 40, counter: 20 } } });
  assert.throws(() => reinforceTerritory(game, players[2], '2', at()), { code: 'WAR_NOT_OWN' });
  assert.equal(game.war.cooldowns[jid(2)], undefined, 'erro não gasta a ação');
  attackTerritory(game, players[1], 'vale', at(0.5));
  // Força de defesa = defesa + contra × 0,5 = 50.
  const first = reinforceTerritory(game, players[2], 'vale', at(0.5));
  assert.equal(first.view, 'defend'); assert.equal(first.before, 35); assert.equal(first.after, 85); assert.equal(first.amount, 50); assert.equal(first.points, 25);
  const second = reinforceTerritory(game, players[2], '1', { now: NOW + WAR.actionCooldown, rng: () => 0.5 });
  assert.equal(second.after, WAR.maxDefense); assert.equal(second.amount, 15); assert.equal(second.points, 7);
  assert.throws(() => reinforceTerritory(game, players[2], '1', { now: NOW + 2 * WAR.actionCooldown, rng: () => 0.5 }), { code: 'WAR_FULL' });
  assert.equal(game.war.scores[key('Lua')].reinforced, 65);
  assert.equal(game.war.scores[key('Lua')].points, 40 + 50 + 25 + 7);
});

test('boosts ativos da loja aumentam a força na guerra', () => {
  const { game, players } = world({ clans: { Lua: [1] }, stats: { 1: { wolves: 40, attack: 20, defense: 10, counter: 4 } } });
  players[1].boosts = [{ type: 'attack', effect: 'multiplier', value: 0.5, activatedAt: NOW - 1000, expiresAt: NOW + HOUR }];
  // Ataque 20 × 1,5 = 30 → 30 × 1,2 + 4 × 0,5 = 38.
  assert.equal(attackTerritory(game, players[1], '2', at(0.5)).damage, 38);
});

test('a Alcateia Sombria dorme até alguém jogar e depois ataca nos horários marcados', () => {
  const { game, players, key } = world({ clans: { Lua: [1] }, stats: { 1: { wolves: 60, attack: 40, defense: 10, counter: 10 } } });
  ensureWar(game, NOW);
  assert.deepEqual(advanceWar(game, NOW + 3 * DAY, () => 0.5), [], 'sem jogadores na guerra ela não age');
  const start = NOW + 3 * DAY; // sexta, 10h de Brasília
  attackTerritory(game, players[1], 'vale', { now: start, rng: () => 0.5 });
  assert.equal(game.war.territories.vale.owner, key('Lua'));
  assert.deepEqual(advanceWar(game, start + HOUR, () => 0.5), [], '11h: ainda não é horário');
  // 12h: primeiro ataque. Força = 53 (média) × 0,7 × 1,0 = 37 → toma o Vale (35).
  const events = advanceWar(game, start + 2 * HOUR, () => 0.5);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { type: 'ai-attack', at: start + 2 * HOUR, territory: 'vale', owner: 'Lua', damage: 35, before: 35, after: 0, captured: true });
  assert.equal(game.war.territories.vale.owner, AI_KEY); assert.equal(game.war.territories.vale.defense, WAR.captureDefense);
  assert.equal(game.war.ai.conquests, 1); assert.equal(game.war.ai.points, 35 + WAR.capturePoints);
  assert.deepEqual(advanceWar(game, start + 2 * HOUR, () => 0.5), [], 'repetir no mesmo instante não ataca de novo');
  // Territórios dela recuperam defesa a cada turno, até o teto.
  assert.equal(game.war.territories.floresta.defense, 60 + WAR.aiRegen);
  // Sem territórios de jogadores, ataca os livres em silêncio.
  const quiet = advanceWar(game, start + 5 * HOUR, () => 0.5);
  assert.equal(quiet.length, 1); assert.equal(quiet[0].owner, null);
  assert.deepEqual(drainWarOutbox(game).map(event => event.territory), ['vale'], 'só o ataque a jogadores vira aviso');
  assert.deepEqual(drainWarOutbox(game), []);
});

test('a força dela acompanha o grupo: fácil, mas nem tanto', () => {
  const weak = world({ clans: { Lua: [1] } });
  const strong = world({ clans: { Lua: [1] }, stats: { 1: { wolves: 60, attack: 40, defense: 0, counter: 20 } } });
  for (const { game, players } of [weak, strong]) {
    game.players[jid(1)].wolves = Math.max(game.players[jid(1)].wolves, 60);
    attackTerritory(game, players[1], 'vale', at(0.5));
    game.war.territories.vale = { owner: game.players[jid(1)].clan, defense: 100 };
    advanceWar(game, NOW + 2 * HOUR, () => 0.5);
  }
  // Jogador inicial: força 13 → 9 de dano. Jogador no máximo: força 58 → 41 (teto 45).
  assert.equal(100 - weak.game.war.territories.vale.defense, 9);
  assert.equal(100 - strong.game.war.territories.vale.defense, 41);
  assert.ok(41 < 58 && 9 < 13, 'sempre abaixo da força média dos jogadores');
});

test('ela pressiona o líder, alcança o atraso com limite e volta a dormir depois de 7 dias', () => {
  const { game, players, key } = world({ clans: { Lua: [1], Garras: [3] }, stats: { 1: { wolves: 60, attack: 40, defense: 10, counter: 10 }, 3: { wolves: 60, attack: 40, defense: 10, counter: 10 } } });
  attackTerritory(game, players[1], 'vale', at(0.5));
  attackTerritory(game, players[3], 'pico', at(0.5));
  attackTerritory(game, players[1], 'pantano', { now: NOW + WAR.actionCooldown, rng: () => 0.5 });
  game.war.territories.vale.defense = 90; game.war.territories.pantano.defense = 80; game.war.territories.pico.defense = 20;
  // Sorteio baixo (< 65%): escolhe o território mais fraco do LÍDER (Lua), não o mais fraco do mapa.
  const [smart] = advanceWar(game, NOW + 2 * HOUR, () => 0.1);
  assert.equal(smart.territory, 'pantano'); assert.equal(smart.owner, 'Lua');
  assert.equal(game.war.territories.pico.owner, key('Garras'));

  // Bot desligado por dias: no máximo 8 turnos atrasados são executados de uma vez.
  game.war.lastHumanAt = NOW + 5 * DAY;
  const late = advanceWar(game, NOW + 6 * DAY, () => 0.5);
  assert.ok(late.length > 0 && late.length <= WAR.maxCatchUpTurns, String(late.length));
  assert.ok(game.war.outbox.length <= WAR.outboxSize);

  // Mais de 7 dias sem nenhum jogador agir: ela para.
  game.war.lastHumanAt = NOW;
  assert.deepEqual(advanceWar(game, NOW + 8 * DAY + 12 * HOUR, () => 0.5).filter(event => event.type === 'ai-attack'), []);
});

test('fechamento semanal: bônus por território, pódio dos jogadores e prêmio só para quem participou', () => {
  const { game, players, key } = world({
    clans: { Lua: [1, 2, 3], Garras: [4, 5], Presas: [6], Uivo: [7], Sombras: [8] },
    stats: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, { wolves: 60, attack: 40, defense: 10, counter: 10 }])),
  });
  const before = Object.fromEntries(Object.entries(players).map(([n, player]) => [n, player.coins]));
  attackTerritory(game, players[1], 'vale', at(0.5)); // Lua: 90 pts, 1 território
  attackTerritory(game, players[2], 'floresta', at(0.5)); // Lua: +53
  attackTerritory(game, players[4], 'pico', at(0.5)); // Garras: 90 pts, 1 território
  attackTerritory(game, players[6], 'ruinas', at(0.5)); // Presas: 53
  attackTerritory(game, players[7], 'caverna', at(0)); // Uivo: 42 → fica em 4º, sem prêmio
  players[5].banned = false; // 5 e 3 são membros, mas não agiram na semana
  game.players[jid(8)].banned = true;

  const next = MONDAY + 7 * DAY + 5000;
  const events = advanceWar(game, next, () => 0.5);
  const result = events.find(event => event.type === 'week-result');
  assert.ok(result, 'o fechamento gera um resultado');
  assert.deepEqual(result.summary.podium.map(entry => [entry.position, entry.name, entry.points, entry.prize, entry.awarded]), [
    [1, 'Lua', 90 + 53 + WAR.holdPoints, 300, 2],
    [2, 'Garras', 90 + WAR.holdPoints, 150, 1],
    [3, 'Presas', 53, 75, 1],
  ]);
  // A Alcateia Sombria aparece na classificação, mas não ocupa vaga de prêmio.
  assert.equal(typeof result.summary.ai.position, 'number');
  const gained = n => game.players[jid(n)].coins - before[n];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(gained), [300, 300, 0, 150, 0, 75, 0, 0]);
  assert.equal(game.clans[key('Lua')].warTitles, 1); assert.equal(game.clans[key('Lua')].warPodiums, 1);
  assert.equal(game.clans[key('Garras')].warTitles, undefined); assert.equal(game.clans[key('Garras')].warPodiums, 1);
  // Nova semana: mapa e placar recomeçam; o histórico guarda o resultado.
  assert.equal(game.war.weekId, weekOf(next)); assert.deepEqual(game.war.scores, {}); assert.deepEqual(game.war.cooldowns, {});
  assert.deepEqual(TERRITORIES.map(territory => game.war.territories[territory.id].owner), [null, AI_KEY, null, AI_KEY, null, AI_KEY, null]);
  assert.equal(game.war.history.length, 1); assert.equal(game.war.history[0].weekId, weekOf(NOW));
  assert.deepEqual(drainWarOutbox(game).map(event => event.type), ['week-result']);
  // Fechar de novo na mesma semana não paga duas vezes.
  advanceWar(game, next + HOUR, () => 0.5);
  assert.deepEqual([1, 2, 4, 6].map(gained), [300, 300, 150, 75]);
});

test('o prêmio vai no máximo para 10 membros por alcateia e ex-membros ficam de fora', () => {
  const members = Array.from({ length: 12 }, (_, index) => index + 1);
  const { game, players, key } = world({ clans: { Lua: members }, stats: Object.fromEntries(members.map(n => [n, { wolves: 20, attack: 10, defense: 8, counter: 2 }])) });
  ensureWar(game, NOW);
  // A Floresta é mantida com defesa alta para que os 12 consigam atacar sem conquistá-la.
  const fortify = () => { game.war.territories.floresta = { owner: AI_KEY, defense: 100 }; };
  for (const n of members) { fortify(); attackTerritory(game, players[n], '2', at(0.5)); }
  // O 12º agiu duas vezes; o 1º saiu da alcateia antes do fechamento.
  fortify();
  attackTerritory(game, players[12], '2', { now: NOW + WAR.actionCooldown, rng: () => 0.5 });
  game.clans[key('Lua')].members = game.clans[key('Lua')].members.filter(member => member !== jid(1));
  const [event] = advanceWar(game, MONDAY + 7 * DAY + 1, () => 0.5);
  assert.equal(event.summary.podium[0].awarded, WAR.prizeMembers);
  const paid = members.filter(n => game.players[jid(n)].coins === 1300);
  assert.equal(paid.length, 10); assert.ok(paid.includes(12), 'quem mais agiu entra primeiro'); assert.ok(!paid.includes(1));
});

test('semana sem pontos de jogadores recomeça em silêncio', () => {
  const { game } = world();
  ensureWar(game, NOW);
  assert.deepEqual(advanceWar(game, MONDAY + 7 * DAY + 1, () => 0.5), []);
  assert.equal(game.war.weekId, weekOf(MONDAY + 7 * DAY + 1)); assert.deepEqual(game.war.history, []); assert.deepEqual(game.war.outbox, []);
});

test('placar ordena por pontos e inclui a Alcateia Sombria', () => {
  const { game, players } = world({ clans: { Lua: [1], Garras: [3] }, stats: { 1: { wolves: 60, attack: 40, defense: 10, counter: 10 } } });
  attackTerritory(game, players[1], 'vale', at(0.5));
  attackTerritory(game, players[3], 'pico', at(0.5));
  const board = ranking(game, game.war);
  assert.deepEqual(board.map(entry => [entry.position, entry.name, entry.ai, entry.territories]), [[1, 'Lua', false, 1], [2, 'Garras', false, 0], [3, AI_NAME, true, 3]]);
  assert.ok(board[0].points > board[1].points && board[1].points > board[2].points);
});

test('avisos: só administradores ligam ou desligam, e desligado não entrega nada', () => {
  const { game, players } = world({ clans: { Lua: [1] }, stats: { 1: { wolves: 60, attack: 40, defense: 10, counter: 10 } } });
  const call = (args, extra = {}) => warCommand(game, players[1], { args, ...extra }, at(0.5));
  assert.throws(() => call(['avisos', 'off']), { code: 'WAR_ADMIN' });
  assert.throws(() => call(['avisos', 'talvez'], { isAdmin: true }), /avisos on ou/);
  attackTerritory(game, players[1], 'vale', at(0.5));
  advanceWar(game, NOW + 2 * HOUR, () => 0.5);
  assert.equal(game.war.outbox.length, 1);
  assert.deepEqual(call(['avisos', 'off'], { isAdmin: true }), { type: 'war', view: 'announce', announce: false });
  assert.deepEqual(game.war.outbox, []);
  game.war.outbox.push({ type: 'ai-attack', territory: 'vale', owner: 'Lua' });
  assert.deepEqual(drainWarOutbox(game), [], 'com avisos desligados nada é entregue');
  assert.equal(call(['avisos', 'on'], { isAdmin: true }).announce, true);
  assert.throws(() => call(['dançar']), /Use !guerra/);
});

function serviceFixture(t, rng = () => 0.5) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-war-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'data', 'database.json'));
  const CHAT = '120363000000000001@g.us', OTHER = '120363000000000002@g.us';
  let now = NOW;
  const service = chat => new GameService({ store: store.scoped(chat), now: () => now, rng });
  const run = (n, input, { chat = CHAT, wait = 2000, ...extra } = {}) => {
    now += wait;
    const [command, ...args] = input.trim().split(/\s+/);
    return service(chat).execute({ command, args, argText: args.join(' '), actor: { jid: jid(n), name: `Lobo ${n}` }, chatId: chat, now, ...extra });
  };
  const fund = (chat, n, coins = 1000) => { store.data.games[chat].players[jid(n)].coins = coins; };
  return { store, run, fund, CHAT, OTHER, time: () => now };
}

test('!guerra pelo serviço do jogo: mapa, ação, erro sem efeito colateral e isolamento por grupo', async t => {
  const f = serviceFixture(t);
  const map = await f.run(1, 'guerra');
  assert.equal(map.type, 'war'); assert.equal(map.view, 'map'); assert.equal(map.clan, null); assert.equal(map.territories.length, 7);
  assert.equal((await f.run(1, 'guerra atacar 1')).code, 'WAR_NO_CLAN');
  f.fund(f.CHAT, 1);
  assert.equal((await f.run(1, 'clan criar Lobos da Lua')).type, 'clan');
  const attack = await f.run(1, 'guerra atacar Vale da Lua');
  assert.equal(attack.view, 'attack'); assert.equal(attack.clan, 'Lobos da Lua'); assert.equal(attack.before, 40);
  const again = await f.run(1, 'guerra atacar 1');
  assert.equal(again.type, 'error'); assert.equal(again.code, 'COOLDOWN');
  assert.equal(f.store.data.games[f.CHAT].war.territories.vale.defense, attack.after);
  const mine = await f.run(1, 'guerra mapa');
  assert.equal(mine.clan, 'Lobos da Lua'); assert.ok(mine.ready > 0 && mine.ready <= WAR.actionCooldown);
  assert.equal((await f.run(1, 'guerra placar')).ranking[0].name, 'Lobos da Lua');
  assert.equal((await f.run(1, 'guerra regras')).view, 'rules');
  assert.equal((await f.run(1, 'guerra avisos off')).code, 'WAR_ADMIN');
  assert.equal((await f.run(1, 'guerra avisos off', { isAdmin: true })).announce, false);
  // Outro grupo tem outra guerra.
  const other = await f.run(1, 'guerra', { chat: f.OTHER });
  assert.equal(other.clan, null); assert.equal(other.territories[0].defense, 40); assert.equal(other.announce, true);
  assert.equal(f.store.data.games[f.OTHER].war.scores && Object.keys(f.store.data.games[f.OTHER].war.scores).length, 0);
});

test('as mensagens mostram mapa, resultado e regras; o aviso do grupo junta tudo em um texto', async t => {
  const f = serviceFixture(t);
  await f.run(1, 'perfil'); f.fund(f.CHAT, 1);
  await f.run(1, 'clan criar Lobos da Lua');
  // O painel aplica negrito e monoespaçado; as conferências olham o texto sem essas marcas.
  const bare = text => text.replace(/[*`_]/g, '');
  const map = bare(warText(await f.run(1, 'guerra'), '!'));
  for (const piece of ['GUERRA DE ALCATEIAS', 'Vale da Lua', AI_NAME, 'livre', 'Placar da semana', 'Sua alcateia: Lobos da Lua', '!guerra atacar N']) assert.ok(map.includes(piece), piece);
  const attack = bare(warText(await f.run(1, 'guerra atacar 1'), '/'));
  assert.match(attack, /ATAQUE DE GUERRA/); assert.match(attack, /Lobo 1 atacou 🌕 Vale da Lua \(livre\)/); assert.match(attack, /pontos para Lobos da Lua/);
  const rules = bare(warText({ type: 'war', view: 'rules' }, '!'));
  for (const piece of ['9h, 12h, 15h, 18h, 21h', '300', '150', '75', 'segunda-feira', '!guerra avisos on/off']) assert.ok(rules.includes(piece), piece);
  const rawCaptured = warText({ type: 'war', view: 'attack', territory: TERRITORIES[0], damage: 3, before: 3, after: 0, captured: true, previousOwner: AI_NAME, clan: 'Lua', points: 53, total: 90, defense: 35, player: 'Luna*_`' }, '!');
  const captured = bare(rawCaptured);
  assert.match(captured, /TERRITÓRIO CONQUISTADO/); assert.match(captured, /agora é da alcateia Lua/); assert.match(captured, /!guerra defender 1/);
  assert.ok(!rawCaptured.includes('Luna*_`'), 'nomes não quebram a formatação');

  assert.equal(warAnnouncement([], '!'), null);
  const notice = warAnnouncement([
    { type: 'ai-attack', territory: 'vale', owner: 'Lua', before: 44, after: 28, captured: false },
    { type: 'ai-attack', territory: 'pico', owner: 'Garras', before: 10, after: 0, captured: true },
    { type: 'ai-attack', territory: 'ruinas', owner: null, before: 40, after: 20, captured: false },
  ], '!');
  assert.match(notice, /AVISO DE GUERRA/); assert.match(bare(notice), /atacou 🌕 Vale da Lua \(Lua\)/); assert.match(bare(notice), /tomou ⛰️ Pico do Uivo da alcateia Garras/);
  assert.ok(!notice.includes('Ruínas'), 'ataque a território livre não é anunciado'); assert.match(notice, /!guerra defender N/);
  const closing = warAnnouncement([{ type: 'week-result', summary: { podium: [{ position: 1, name: 'Lua', points: 173, prize: 300, awarded: 2 }], ai: { position: 2, points: 90, territories: 3 } } }], '!');
  assert.match(closing, /RESULTADO DA GUERRA/); assert.match(bare(closing), /🥇 Lua/); assert.match(bare(closing), /300 WoK coin para 2 membros/); assert.match(closing, /O mapa recomeçou/);
  for (const text of [map, attack, rules, captured, notice, closing]) assert.doesNotMatch(text, /\d{10,}/, 'nenhum telefone nos textos');
});
