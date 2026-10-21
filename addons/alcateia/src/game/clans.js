import { GameError, assertBalance, normalizeClanName, integer } from './validation.js';
import { assertPlayable } from './players.js';

export function createClan(game, player, rawName, now = Date.now()) {
  assertPlayable(player);
  const { key, name } = normalizeClanName(rawName);
  integer(now, { min: 0, label: 'Data' });
  if (player.clan) throw new GameError('Você já participa de um clã.');
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
