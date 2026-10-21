import { LIMITS, COOLDOWNS } from './constants.js';
import { GameError, brazilianNumber, canonicalPlayerJid, integer, quantity, validatePlayer, formatRemaining } from './validation.js';

export function createPlayer(identity, now = Date.now()) {
  const jid = canonicalPlayerJid(identity?.jid);
  const number = brazilianNumber(identity.number || jid.split('@')[0]);
  if (jid !== `${number}@s.whatsapp.net`) throw new GameError('O número não corresponde ao JID do jogador.');
  const name = String(identity.name || number).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || number;
  integer(now, { min: 0, label: 'Data' });
  return {
    name, number, jid, hp: 100, wolves: 20, attack: 10, defense: 8, counter: 2,
    coins: 100, wins: 0, losses: 0, draws: 0, clan: null, boosts: [], banned: false,
    extraTraining: 0, lastTraining: null, normalTrainingAt: null,
    lastBattle: null, lastEvent: null, createdAt: now, updatedAt: now,
  };
}

export function registerPlayer(game, identity, now = Date.now()) {
  const player = createPlayer(identity, now);
  if (Object.hasOwn(game.players, player.jid)) throw new GameError('Você já faz parte da alcateia.', 'ALREADY_REGISTERED');
  game.players[player.jid] = player;
  return player;
}

export function requirePlayer(game, id, { allowBanned = false } = {}) {
  const jid = canonicalPlayerJid(id);
  const player = Object.hasOwn(game.players, jid) ? game.players[jid] : null;
  if (!player) throw new GameError('Você ainda não faz parte da alcateia. Use !start.', 'NOT_REGISTERED');
  if (!allowBanned && player.banned) throw new GameError('Esse jogador está banido do jogo.', 'BANNED');
  validatePlayer(player);
  return player;
}

export function assertPlayable(player) {
  validatePlayer(player);
  if (player.banned) throw new GameError('Esse jogador está banido do jogo.', 'BANNED');
}

function randomPosition(positions, rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new GameError('Sorteio inválido. Tente novamente.');
  return positions[Math.floor(value * positions.length)];
}

export function addWolves(player, amount, rng = Math.random, now = Date.now()) {
  validatePlayer(player);
  const requested = quantity(amount);
  integer(now, { min: 0, label: 'Data' });
  const added = Math.min(requested, LIMITS.wolves - player.wolves);
  const allocation = { attack: 0, defense: 0, counter: 0 };
  for (let index = 0; index < added; index++) {
    const available = Object.keys(allocation).filter(key => player[key] + allocation[key] < LIMITS[key]);
    if (!available.length) throw new GameError('A formação está sem vagas.');
    allocation[randomPosition(available, rng)]++;
  }
  if (added) {
    for (const key of Object.keys(allocation)) player[key] += allocation[key];
    player.wolves += added;
    player.updatedAt = now;
  }
  return { added, allocation, wolves: player.wolves };
}

export function trainPlayer(player, { now = Date.now(), rng = Math.random } = {}) {
  assertPlayable(player);
  integer(now, { min: 0, label: 'Data' });
  if (player.wolves >= LIMITS.wolves) throw new GameError('Você já possui 100/100 lobisomens.', 'WOLVES_LIMIT');
  const normalAt = player.normalTrainingAt ?? player.lastTraining;
  const remaining = normalAt === null || normalAt === undefined ? 0 : Math.max(0, COOLDOWNS.training - (now - normalAt));
  const credits = integer(player.extraTraining ?? 0, { min: 0, label: 'Treinos extras' });
  const usedExtra = remaining > 0;
  if (usedExtra && credits < 1) throw new GameError(`Aguarde ${formatRemaining(remaining)} para treinar novamente.`, 'COOLDOWN');
  const result = addWolves(player, 5, rng, now);
  player.extraTraining = credits - (usedExtra ? 1 : 0);
  if (!usedExtra) player.normalTrainingAt = now;
  player.lastTraining = now;
  player.updatedAt = now;
  return { ...result, usedExtra, lastTraining: now };
}

export function setFormation(player, position, amount, now = Date.now()) {
  assertPlayable(player);
  const key = { A: 'attack', D: 'defense', C: 'counter' }[String(position).toUpperCase()];
  if (!key) throw new GameError('Use A (Ataque), D (Defesa) ou C (Contra-ataque).');
  const value = integer(amount, { min: 0, max: LIMITS[key], label: 'Formação' });
  integer(now, { min: 0, label: 'Data' });
  const used = player.attack + player.defense + player.counter - player[key] + value;
  if (used > player.wolves) throw new GameError('A formação não pode usar mais lobisomens do que você possui.');
  player[key] = value;
  player.updatedAt = now;
  return { attack: player.attack, defense: player.defense, counter: player.counter, used, total: player.wolves };
}

export function rankPlayers(game) {
  return Object.values(game.players).filter(player => !player.banned).sort((a, b) =>
    b.wins - a.wins || b.coins - a.coins || b.wolves - a.wolves || a.losses - b.losses || a.jid.localeCompare(b.jid));
}
