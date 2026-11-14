// Guerra de Alcateias: disputa semanal de territórios entre os clãs de um
// mesmo grupo, com uma alcateia controlada pelo bot que sempre ataca.
//
// Tudo aqui é síncrono e determinístico (relógio e sorteio são injetados),
// porque roda dentro da transação do jogo. O estado fica em game.war e vale
// só para o chat daquela partida.
import { GameError } from './validation.js';
import { applyBoosts } from './battle.js';
import { credit } from './wallet.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Horário de Brasília. O Brasil não tem horário de verão desde 2019.
const BRT_OFFSET = -3 * HOUR;

// Dono reservado da alcateia do bot. Nomes de clã não aceitam "@", então
// nenhum clã de jogadores consegue usar esta chave.
export const AI_KEY = '@sombra';
export const AI_NAME = 'Alcateia Sombria';

export const TERRITORIES = Object.freeze([
  { id: 'vale', name: 'Vale da Lua', emoji: '🌕' },
  { id: 'floresta', name: 'Floresta Negra', emoji: '🌲' },
  { id: 'pico', name: 'Pico do Uivo', emoji: '⛰️' },
  { id: 'ruinas', name: 'Ruínas Antigas', emoji: '🏛️' },
  { id: 'pantano', name: 'Pântano Sombrio', emoji: '🌫️' },
  { id: 'caverna', name: 'Caverna de Cristal', emoji: '💎' },
  { id: 'colina', name: 'Colina dos Ancestrais', emoji: '🌄' },
].map(Object.freeze));

export const WAR = Object.freeze({
  maxDefense: 100,
  aiStartDefense: 60, // territórios que começam com a Alcateia Sombria
  freeStartDefense: 40, // territórios livres no início da semana
  captureDefense: 35, // defesa de um território recém-conquistado
  actionCooldown: 20 * 60_000, // um ataque ou reforço por jogador a cada 20 min
  capturePoints: 50,
  holdPoints: 30, // por território mantido no fechamento da semana
  // Prêmio semanal em WoK coin para cada membro que participou, por colocação.
  prizes: Object.freeze([300, 150, 75]),
  prizeMembers: 10, // no máximo 10 membros premiados por alcateia
  // A Alcateia Sombria ataca nestes horários de Brasília, todos os dias.
  aiHours: Object.freeze([9, 12, 15, 18, 21]),
  aiDifficulty: 0.7, // força em relação à média dos jogadores: fácil, mas nem tanto
  aiSmartChance: 0.65, // chance de escolher o alvo mais fraco do líder
  aiRegen: 6, // defesa que os territórios dela recuperam a cada turno
  aiRegenCap: 70,
  aiMinPower: 6,
  aiMaxPower: 45,
  dormantAfter: 7 * DAY, // sem jogadores na guerra, ela para de atacar
  maxCatchUpTurns: 8,
  outboxSize: 12,
  historySize: 4,
});

function random(rng) {
  const value = rng();
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) throw new GameError('Sorteio inválido. Tente novamente.');
  return value;
}

/** Número da semana: vira toda segunda-feira à 00:00 de Brasília. */
export function weekOf(now) {
  return Math.floor((Math.floor((now + BRT_OFFSET) / DAY) + 3) / 7);
}

export function weekBounds(weekId) {
  const start = (weekId * 7 - 3) * DAY - BRT_OFFSET;
  return { start, end: start + 7 * DAY };
}

function freshTerritories() {
  // A Alcateia Sombria começa com três territórios alternados; o resto fica livre.
  return Object.fromEntries(TERRITORIES.map((territory, index) => {
    const ai = index % 2 === 1;
    return [territory.id, { owner: ai ? AI_KEY : null, defense: ai ? WAR.aiStartDefense : WAR.freeStartDefense }];
  }));
}

function freshWeek(war, now) {
  war.weekId = weekOf(now);
  war.territories = freshTerritories();
  war.scores = {};
  war.cooldowns = {};
  war.ai = { points: 0, damage: 0, conquests: 0, lastTurnAt: now };
}

export function ensureWar(game, now) {
  if (!game.war || typeof game.war !== 'object' || game.war.version !== 1) {
    game.war = { version: 1, announce: true, outbox: [], history: [], lastHumanAt: null };
    freshWeek(game.war, now);
  }
  const war = game.war;
  // Estados antigos ou editados à mão voltam a um formato válido sem perder a semana.
  if (!war.territories || typeof war.territories !== 'object') war.territories = freshTerritories();
  for (const [id, initial] of Object.entries(freshTerritories())) {
    const current = war.territories[id];
    if (!current || !Number.isFinite(current.defense)) war.territories[id] = initial;
  }
  for (const id of Object.keys(war.territories)) if (!TERRITORIES.some(territory => territory.id === id)) delete war.territories[id];
  if (!war.scores || typeof war.scores !== 'object') war.scores = {};
  if (!war.cooldowns || typeof war.cooldowns !== 'object') war.cooldowns = {};
  if (!war.ai || typeof war.ai !== 'object') war.ai = { points: 0, damage: 0, conquests: 0, lastTurnAt: now };
  if (!Array.isArray(war.outbox)) war.outbox = [];
  if (!Array.isArray(war.history)) war.history = [];
  if (typeof war.announce !== 'boolean') war.announce = true;
  return war;
}

function clanOf(game, player) {
  const clan = player.clan && Object.hasOwn(game.clans, player.clan) ? game.clans[player.clan] : null;
  return clan && clan.members.includes(player.jid) ? clan : null;
}

function requireClan(game, player) {
  const clan = clanOf(game, player);
  if (!clan) throw new GameError('Você precisa de uma alcateia para entrar na guerra. Use !clan criar Nome ou !clan entrar Nome.', 'WAR_NO_CLAN');
  return clan;
}

function ownerName(game, owner) {
  if (owner === AI_KEY) return AI_NAME;
  if (owner === null || owner === undefined) return null;
  return Object.hasOwn(game.clans, owner) ? game.clans[owner].name : null;
}

function plain(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().trim();
}

export function findTerritory(value) {
  const query = plain(value);
  if (!query) throw new GameError('Informe o território pelo número ou pelo nome. Veja o mapa com !guerra.', 'WAR_TERRITORY');
  if (/^\d+$/.test(query)) {
    const territory = TERRITORIES[Number(query) - 1];
    if (!territory) throw new GameError(`Os territórios vão de 1 a ${TERRITORIES.length}. Veja o mapa com !guerra.`, 'WAR_TERRITORY');
    return territory;
  }
  const matches = TERRITORIES.filter(territory => territory.id === query || plain(territory.name) === query);
  const partial = matches.length ? matches : TERRITORIES.filter(territory => plain(territory.name).includes(query));
  if (partial.length !== 1) throw new GameError('Não encontrei esse território. Use o número do mapa: !guerra.', 'WAR_TERRITORY');
  return partial[0];
}

function scoreOf(war, key) {
  if (!Object.hasOwn(war.scores, key)) {
    Object.defineProperty(war.scores, key, { value: { points: 0, damage: 0, conquests: 0, reinforced: 0, participants: {} }, enumerable: true, writable: true, configurable: true });
  }
  return war.scores[key];
}

function assertReady(war, player, now) {
  const last = Number(war.cooldowns[player.jid]) || 0;
  const remaining = last + WAR.actionCooldown - now;
  if (last && remaining > 0) throw new GameError(`Aguarde ${formatWait(remaining)} para a próxima ação de guerra.`, 'COOLDOWN');
}

function formatWait(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}min`;
  if (seconds < DAY / 1000) return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`;
}

function countAction(war, score, player, now) {
  score.participants[player.jid] = (Number(score.participants[player.jid]) || 0) + 1;
  war.cooldowns[player.jid] = now;
  war.lastHumanAt = now;
}

/** Ataque de um jogador a um território que não é da sua alcateia. */
export function attackTerritory(game, player, target, { now, rng }) {
  const war = ensureWar(game, now);
  const clan = requireClan(game, player);
  const territory = findTerritory(target);
  const state = war.territories[territory.id];
  if (state.owner === clan.key) throw new GameError(`${territory.name} já é da sua alcateia. Reforce com !guerra defender ${TERRITORIES.indexOf(territory) + 1}.`, 'WAR_OWN');
  assertReady(war, player, now);
  const stats = applyBoosts(player, now);
  const power = stats.attack * 1.2 + stats.counter * 0.5;
  const damage = Math.max(1, Math.round(power * (0.8 + random(rng) * 0.4)));
  const before = state.defense, previousOwner = state.owner;
  const after = Math.max(0, before - damage), effective = before - after;
  const score = scoreOf(war, clan.key);
  let points = effective;
  score.damage += effective;
  const captured = after === 0;
  if (captured) {
    state.owner = clan.key;
    state.defense = WAR.captureDefense;
    score.conquests += 1;
    points += WAR.capturePoints;
    clan.warConquests = (Number(clan.warConquests) || 0) + 1;
    clan.updatedAt = now;
  } else state.defense = after;
  score.points += points;
  countAction(war, score, player, now);
  return {
    type: 'war', view: 'attack', territory, damage: effective, before, after: captured ? 0 : after, captured,
    previousOwner: ownerName(game, previousOwner), previousAi: previousOwner === AI_KEY,
    clan: clan.name, points, total: score.points, defense: state.defense, player: player.name,
  };
}

/** Reforço da defesa de um território da própria alcateia. */
export function reinforceTerritory(game, player, target, { now, rng }) {
  const war = ensureWar(game, now);
  const clan = requireClan(game, player);
  const territory = findTerritory(target);
  const state = war.territories[territory.id];
  if (state.owner !== clan.key) throw new GameError(`${territory.name} não é da sua alcateia. Conquiste com !guerra atacar ${TERRITORIES.indexOf(territory) + 1}.`, 'WAR_NOT_OWN');
  if (state.defense >= WAR.maxDefense) throw new GameError(`${territory.name} já está com a defesa no máximo.`, 'WAR_FULL');
  assertReady(war, player, now);
  const stats = applyBoosts(player, now);
  const power = stats.defense + stats.counter * 0.5;
  const amount = Math.max(1, Math.round(power * (0.8 + random(rng) * 0.4)));
  const before = state.defense;
  state.defense = Math.min(WAR.maxDefense, before + amount);
  const effective = state.defense - before;
  const score = scoreOf(war, clan.key);
  const points = Math.floor(effective / 2);
  score.reinforced += effective;
  score.points += points;
  countAction(war, score, player, now);
  return { type: 'war', view: 'defend', territory, amount: effective, before, after: state.defense, clan: clan.name, points, total: score.points, player: player.name };
}

/** Placar da semana: clãs que pontuaram e a Alcateia Sombria. */
export function ranking(game, war) {
  const entries = Object.entries(war.scores)
    .filter(([key, score]) => Object.hasOwn(game.clans, key) && score.points > 0)
    .map(([key, score]) => ({ key, name: game.clans[key].name, ai: false, points: score.points, conquests: score.conquests, damage: score.damage }));
  entries.push({ key: AI_KEY, name: AI_NAME, ai: true, points: war.ai.points, conquests: war.ai.conquests, damage: war.ai.damage });
  return entries.sort((a, b) => b.points - a.points || b.conquests - a.conquests || b.damage - a.damage || a.name.localeCompare(b.name, 'pt-BR'))
    .map((entry, index) => ({ ...entry, position: index + 1, territories: Object.values(war.territories).filter(state => state.owner === entry.key).length }));
}

function pushOutbox(war, event) {
  war.outbox.push(event);
  if (war.outbox.length > WAR.outboxSize) war.outbox.splice(0, war.outbox.length - WAR.outboxSize);
}

// Força da Alcateia Sombria: acompanha a média dos jogadores que estão em
// alcateias, com desconto. Assim ela incomoda qualquer grupo sem atropelar.
function aiPower(game, rng) {
  const fighters = Object.values(game.players).filter(player => !player.banned && clanOf(game, player));
  const average = fighters.length
    ? fighters.reduce((sum, player) => sum + player.attack * 1.2 + player.counter * 0.5, 0) / fighters.length
    : WAR.aiMinPower / WAR.aiDifficulty;
  const power = average * WAR.aiDifficulty * (0.8 + random(rng) * 0.4);
  return Math.max(WAR.aiMinPower, Math.min(WAR.aiMaxPower, Math.round(power)));
}

function aiTurn(game, war, at, rng) {
  for (const state of Object.values(war.territories)) {
    if (state.owner === AI_KEY && state.defense < WAR.aiRegenCap) state.defense = Math.min(WAR.aiRegenCap, state.defense + WAR.aiRegen);
  }
  const owned = id => war.territories[id].owner;
  const ofPlayers = TERRITORIES.filter(territory => owned(territory.id) && owned(territory.id) !== AI_KEY && Object.hasOwn(game.clans, owned(territory.id)));
  const free = TERRITORIES.filter(territory => !ofPlayers.includes(territory) && owned(territory.id) !== AI_KEY);
  const weakest = list => [...list].sort((a, b) => war.territories[a.id].defense - war.territories[b.id].defense)[0];
  let target;
  if (ofPlayers.length) {
    const leader = ranking(game, war).find(entry => !entry.ai);
    const ofLeader = leader ? ofPlayers.filter(territory => owned(territory.id) === leader.key) : [];
    target = random(rng) < WAR.aiSmartChance
      ? weakest(ofLeader.length ? ofLeader : ofPlayers)
      : ofPlayers[Math.floor(random(rng) * ofPlayers.length)];
  } else if (free.length) target = weakest(free);
  else return null; // já domina o mapa inteiro: só recupera as defesas
  const state = war.territories[target.id];
  const previousOwner = state.owner;
  const damage = aiPower(game, rng);
  const before = state.defense, after = Math.max(0, before - damage), effective = before - after;
  war.ai.damage += effective;
  war.ai.points += effective;
  const captured = after === 0;
  if (captured) {
    state.owner = AI_KEY;
    state.defense = WAR.captureDefense;
    war.ai.conquests += 1;
    war.ai.points += WAR.capturePoints;
  } else state.defense = after;
  const event = { type: 'ai-attack', at, territory: target.id, owner: ownerName(game, previousOwner), damage: effective, before, after: captured ? 0 : after, captured };
  // Só vira aviso no grupo o que atinge jogadores; ataques a território livre são silenciosos.
  if (event.owner) pushOutbox(war, event);
  return event;
}

// Horários de ataque da Alcateia Sombria no intervalo (from, to].
function aiSlots(from, to) {
  const slots = [];
  const firstDay = Math.floor((from + BRT_OFFSET) / DAY), lastDay = Math.floor((to + BRT_OFFSET) / DAY);
  for (let day = Math.max(firstDay, lastDay - 2); day <= lastDay; day++) {
    for (const hour of WAR.aiHours) {
      const at = day * DAY + hour * HOUR - BRT_OFFSET;
      if (at > from && at <= to) slots.push(at);
    }
  }
  return slots.slice(-WAR.maxCatchUpTurns);
}

function closeWeek(game, war, now) {
  const closing = war.weekId;
  for (const state of Object.values(war.territories)) {
    if (state.owner === AI_KEY) war.ai.points += WAR.holdPoints;
    else if (state.owner && Object.hasOwn(game.clans, state.owner) && Object.hasOwn(war.scores, state.owner)) war.scores[state.owner].points += WAR.holdPoints;
  }
  const board = ranking(game, war);
  const podium = [];
  for (const [index, entry] of board.filter(item => !item.ai).slice(0, WAR.prizes.length).entries()) {
    const clan = game.clans[entry.key], prize = WAR.prizes[index];
    const participants = Object.entries(war.scores[entry.key].participants)
      .filter(([jid]) => clan.members.includes(jid) && Object.hasOwn(game.players, jid) && !game.players[jid].banned)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, WAR.prizeMembers);
    for (const [jid] of participants) {
      credit(game.players[jid], prize);
      game.players[jid].updatedAt = now;
    }
    clan.warPodiums = (Number(clan.warPodiums) || 0) + 1;
    if (index === 0) clan.warTitles = (Number(clan.warTitles) || 0) + 1;
    clan.updatedAt = now;
    podium.push({ position: index + 1, key: entry.key, name: entry.name, points: entry.points, conquests: entry.conquests, territories: entry.territories, prize, awarded: participants.length });
  }
  const ai = board.find(entry => entry.ai);
  const summary = { weekId: closing, closedAt: now, podium, ai: { position: ai.position, points: ai.points, territories: ai.territories } };
  const active = podium.length > 0;
  if (active) {
    war.history.unshift(summary);
    war.history.splice(WAR.historySize);
    pushOutbox(war, { type: 'week-result', at: now, summary });
  }
  freshWeek(war, now);
  return active ? summary : null;
}

/**
 * Põe a guerra em dia: fecha a semana vencida e executa os ataques da
 * Alcateia Sombria que já deveriam ter acontecido. Pode ser chamada a qualquer
 * momento; chamar de novo no mesmo instante não muda nada.
 */
export function advanceWar(game, now, rng = Math.random) {
  const war = ensureWar(game, now);
  const events = [];
  if (weekOf(now) !== war.weekId) {
    const summary = closeWeek(game, war, now);
    if (summary) events.push({ type: 'week-result', at: now, summary });
  }
  const hasClans = Object.keys(game.clans).length > 0;
  const awake = hasClans && Number.isFinite(war.lastHumanAt) && war.lastHumanAt !== null && now - war.lastHumanAt <= WAR.dormantAfter;
  const last = Number.isFinite(war.ai.lastTurnAt) ? Math.min(war.ai.lastTurnAt, now) : now;
  if (awake) {
    for (const at of aiSlots(last, now)) {
      const event = aiTurn(game, war, at, rng);
      if (event) events.push(event);
    }
  }
  war.ai.lastTurnAt = now;
  return events;
}

/** Entrega e esvazia os avisos pendentes para o grupo. */
export function drainWarOutbox(game) {
  const war = game.war;
  if (!war || !Array.isArray(war.outbox) || !war.outbox.length) return [];
  const events = war.outbox;
  war.outbox = [];
  return war.announce === false ? [] : events;
}

function mapView(game, war, player, now) {
  const clan = clanOf(game, player);
  const last = Number(war.cooldowns[player.jid]) || 0;
  return {
    type: 'war', view: 'map',
    territories: TERRITORIES.map((territory, index) => ({
      number: index + 1, ...territory, defense: war.territories[territory.id].defense,
      owner: ownerName(game, war.territories[territory.id].owner), ai: war.territories[territory.id].owner === AI_KEY,
      mine: !!clan && war.territories[territory.id].owner === clan.key,
    })),
    ranking: ranking(game, war).slice(0, 5),
    clan: clan?.name || null,
    ready: !last || last + WAR.actionCooldown <= now ? 0 : last + WAR.actionCooldown - now,
    endsIn: weekBounds(war.weekId).end - now,
    announce: war.announce,
  };
}

/** Roteia !guerra. O jogador já está inscrito no jogo. */
export function warCommand(game, player, request, { now, rng }) {
  advanceWar(game, now, rng);
  const war = ensureWar(game, now);
  const args = request.args || [];
  const action = plain(args[0] || 'mapa');
  const target = args.slice(1).join(' ');
  switch (action) {
    case 'mapa':
    case 'menu':
      return mapView(game, war, player, now);
    case 'atacar':
    case 'ataque':
    case 'invadir':
      return attackTerritory(game, player, target, { now, rng });
    case 'defender':
    case 'reforcar':
    case 'defesa':
      return reinforceTerritory(game, player, target, { now, rng });
    case 'placar':
    case 'rank':
    case 'ranking':
      return { type: 'war', view: 'ranking', ranking: ranking(game, war), endsIn: weekBounds(war.weekId).end - now, last: war.history[0] || null };
    case 'regras':
    case 'ajuda':
      return { type: 'war', view: 'rules' };
    case 'avisos': {
      const value = plain(args[1]);
      if (!['on', 'off'].includes(value)) throw new GameError('Use !guerra avisos on ou !guerra avisos off.');
      if (!request.isAdmin) throw new GameError('Somente administradores do grupo ligam ou desligam os avisos da guerra.', 'WAR_ADMIN');
      war.announce = value === 'on';
      if (!war.announce) war.outbox = [];
      return { type: 'war', view: 'announce', announce: war.announce };
    }
    default:
      throw new GameError('Use !guerra, !guerra atacar N, !guerra defender N, !guerra placar ou !guerra regras.');
  }
}

export { formatWait };
