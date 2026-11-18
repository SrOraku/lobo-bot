import { GameError, assertBalance, normalizeClanName, integer, formatRemaining } from './validation.js';
import { assertPlayable } from './players.js';

export const CLAN_LIMITS = Object.freeze({
  maxMembers: 15, // a guerra paga até 10 membros; 15 dá folga para quem joga menos
  rejoinWait: 24 * 3_600_000, // quem sai de um clã espera 24 h para criar ou entrar em outro
});

// Quem saiu por conta própria espera antes de mudar de clã (evita pular de clã para pegar prêmio).
function assertMayJoin(player, now) {
  const left = Number(player.clanLeftAt) || 0;
  const remaining = left + CLAN_LIMITS.rejoinWait - now;
  if (left && remaining > 0) throw new GameError(`Você saiu de um clã há pouco. Aguarde ${formatRemaining(remaining)} para criar ou entrar em outro.`, 'CLAN_WAIT');
}

function currentClan(game, player) {
  const clan = player.clan && Object.hasOwn(game.clans, player.clan) ? game.clans[player.clan] : null;
  if (!clan || !clan.members.includes(player.jid)) throw new GameError('Você ainda não faz parte de um clã.', 'CLAN_NONE');
  return clan;
}

function assertLeader(clan, player) {
  if (clan.leader !== player.jid) throw new GameError('Somente o líder do clã pode fazer isso.', 'CLAN_LEADER');
}

// Clã sem membros deixa de existir; os territórios dele na guerra ficam livres.
function dissolve(game, clan) {
  delete game.clans[clan.key];
  for (const state of Object.values(game.war?.territories || {})) {
    if (state.owner === clan.key) { state.owner = null; state.defense = Math.min(state.defense, 40); }
  }
}

export function createClan(game, player, rawName, now = Date.now()) {
  assertPlayable(player);
  const { key, name } = normalizeClanName(rawName);
  integer(now, { min: 0, label: 'Data' });
  if (player.clan) throw new GameError('Você já participa de um clã.');
  assertMayJoin(player, now);
  if (Object.hasOwn(game.clans, key)) throw new GameError('Já existe um clã com esse nome.');
  assertBalance(player, 300);
  const clan = { key, name, leader: player.jid, members: [player.jid], wins: 0, losses: 0, coins: 0, createdAt: now, updatedAt: now };
  Object.defineProperty(game.clans, key, { value: clan, enumerable: true, writable: true, configurable: true });
  player.coins -= 300;
  player.clan = key;
  player.updatedAt = now;
  return clan;
}

export function joinClan(game, player, rawName, now = Date.now()) {
  assertPlayable(player);
  const { key } = normalizeClanName(rawName);
  integer(now, { min: 0, label: 'Data' });
  if (player.clan) throw new GameError('Você já participa de um clã.');
  const clan = Object.hasOwn(game.clans, key) ? game.clans[key] : null;
  if (!clan) throw new GameError('Esse clã não existe.');
  if (clan.members.includes(player.jid)) throw new GameError('Você já está na lista desse clã.');
  assertMayJoin(player, now);
  if (clan.members.length >= CLAN_LIMITS.maxMembers) throw new GameError(`Esse clã está cheio (${CLAN_LIMITS.maxMembers} membros).`, 'CLAN_FULL');
  clan.members.push(player.jid);
  clan.updatedAt = now;
  player.clan = key;
  player.updatedAt = now;
  return clan;
}

export function rankClans(game) {
  return Object.values(game.clans).sort((a, b) => b.wins - a.wins || b.coins - a.coins ||
    b.members.length - a.members.length || a.losses - b.losses || a.key.localeCompare(b.key));
}

export function clanProfile(game, player) {
  assertPlayable(player);
  const clan = player.clan && Object.hasOwn(game.clans, player.clan) ? game.clans[player.clan] : null;
  if (!clan || !clan.members.includes(player.jid)) throw new GameError('Você ainda não faz parte de um clã.');
  return { ...clan, members: [...clan.members], ranking: rankClans(game).findIndex(entry => entry.key === clan.key) + 1 };
}

/** Sai do clã. O líder que sai passa a liderança ao membro mais antigo; sem ninguém, o clã acaba. */
export function leaveClan(game, player, now = Date.now()) {
  assertPlayable(player);
  integer(now, { min: 0, label: 'Data' });
  const clan = currentClan(game, player);
  clan.members = clan.members.filter(member => member !== player.jid);
  player.clan = null;
  player.clanLeftAt = now;
  player.updatedAt = now;
  let newLeader = null, dissolved = false;
  if (!clan.members.length) { dissolve(game, clan); dissolved = true; }
  else {
    // A lista guarda a ordem de entrada: o primeiro restante é o mais antigo.
    if (clan.leader === player.jid) { clan.leader = clan.members[0]; newLeader = clan.leader; }
    clan.updatedAt = now;
  }
  return { clan: { key: clan.key, name: clan.name }, newLeader, dissolved };
}

/** O líder remove um membro. Quem é expulso pode entrar em outro clã na hora. */
export function kickMember(game, leader, target, now = Date.now()) {
  assertPlayable(leader);
  integer(now, { min: 0, label: 'Data' });
  const clan = currentClan(game, leader);
  assertLeader(clan, leader);
  if (target.jid === leader.jid) throw new GameError('Para sair do clã, use !clan sair.');
  if (!clan.members.includes(target.jid)) throw new GameError('Essa pessoa não é membro do seu clã.', 'CLAN_NOT_MEMBER');
  clan.members = clan.members.filter(member => member !== target.jid);
  if (target.clan === clan.key) target.clan = null;
  target.updatedAt = now;
  clan.updatedAt = now;
  return { clan: { key: clan.key, name: clan.name }, target: target.jid };
}

/** O líder passa a liderança para outro membro. */
export function transferLeadership(game, leader, target, now = Date.now()) {
  assertPlayable(leader);
  integer(now, { min: 0, label: 'Data' });
  const clan = currentClan(game, leader);
  assertLeader(clan, leader);
  if (target.jid === leader.jid) throw new GameError('Você já é o líder do clã.');
  if (!clan.members.includes(target.jid)) throw new GameError('Só um membro do clã pode virar líder.', 'CLAN_NOT_MEMBER');
  assertPlayable(target);
  clan.leader = target.jid;
  clan.updatedAt = now;
  return { clan: { key: clan.key, name: clan.name }, leader: target.jid };
}
