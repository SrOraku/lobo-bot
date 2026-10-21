import { randomUUID } from 'node:crypto';
import { COOLDOWNS } from './constants.js';
import { GameError } from './validation.js';

function challenges(game) {
  if (!game.duels) game.duels = {};
  return game.duels;
}

export function pruneExpiredDuels(game, now = Date.now()) {
  const pending = challenges(game);
  for (const [id, duel] of Object.entries(pending)) {
    if (!Number.isFinite(duel.expiresAt) || duel.expiresAt <= now) delete pending[id];
  }
}

export function getDuelForPlayer(game, jid, now = Date.now()) {
  pruneExpiredDuels(game, now);
  return Object.values(challenges(game)).find(duel => duel.attacker === jid || duel.defender === jid) || null;
}

function eligible(game, player, now) {
  const registered = player?.jid && game.players?.[player.jid];
  if (!registered) throw new GameError('Os dois jogadores precisam estar registrados. Use !start.', 'NOT_REGISTERED');
  if (registered.banned) throw new GameError('Jogadores banidos não podem participar de duelos.', 'BANNED');
  if (!Number.isFinite(registered.hp) || registered.hp <= 0) {
    throw new GameError('Os dois jogadores precisam ter HP acima de zero para duelar.', 'NO_HP');
  }
  if (registered.lastBattle !== null && registered.lastBattle !== undefined &&
      now - registered.lastBattle < COOLDOWNS.battle) {
    const remaining = Math.max(1, Math.ceil((COOLDOWNS.battle - (now - registered.lastBattle)) / 1000));
    throw new GameError(`Um dos jogadores está em cooldown de batalha. Aguarde ${remaining} s.`, 'BATTLE_COOLDOWN');
  }
  return registered;
}

export function createDuel(game, attacker, defender, chatId, now = Date.now()) {
  if (!attacker?.jid || !defender?.jid || attacker.jid === defender.jid) {
    throw new GameError('Você não pode desafiar a si mesmo.', 'SELF_DUEL');
  }
  if (typeof chatId !== 'string' || !chatId) throw new GameError('Conversa inválida para o duelo.', 'INVALID_CHAT');
  const initiator = eligible(game, attacker, now);
  const challenged = eligible(game, defender, now);
  pruneExpiredDuels(game, now);
  if (getDuelForPlayer(game, initiator.jid, now) || getDuelForPlayer(game, challenged.jid, now)) {
    throw new GameError('Um dos jogadores já tem um duelo pendente. Aguarde aceitar, recusar ou expirar.', 'DUEL_CONFLICT');
  }
  const duel = {
    id: randomUUID(), attacker: initiator.jid, defender: challenged.jid,
    chatId, createdAt: now, expiresAt: now + COOLDOWNS.duel,
  };
  challenges(game)[duel.id] = duel;
  return duel;
}

function addressedDuel(game, defenderJid, chatId, now) {
  const related = Object.values(challenges(game)).filter(duel => duel.attacker === defenderJid || duel.defender === defenderJid);
  const active = related.find(duel => Number.isFinite(duel.expiresAt) && duel.expiresAt > now);
  pruneExpiredDuels(game, now);
  if (!active) {
    if (related.length) throw new GameError('Esse desafio expirou. Peça um novo duelo.', 'DUEL_EXPIRED');
    throw new GameError('Você não tem um desafio pendente nesta conversa.', 'NO_DUEL');
  }
  if (active.defender !== defenderJid) {
    throw new GameError('Somente o jogador desafiado pode aceitar ou recusar o duelo.', 'DUEL_NOT_DEFENDER');
  }
  if (active.chatId !== chatId) {
    throw new GameError('Aceite ou recuse o desafio na mesma conversa em que ele foi criado.', 'DUEL_WRONG_CHAT');
  }
  return active;
}

export function takeDuel(game, defenderJid, chatId, now = Date.now()) {
  const duel = addressedDuel(game, defenderJid, chatId, now);
  delete challenges(game)[duel.id];
  return duel;
}

export function declineDuel(game, defenderJid, chatId, now = Date.now()) {
  return takeDuel(game, defenderJid, chatId, now);
}
