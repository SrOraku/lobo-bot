import { LIMITS, COOLDOWNS } from './constants.js';
import { GameError, integer, formatRemaining } from './validation.js';
import { addWolves, assertPlayable } from './players.js';
import { grantBoost } from './shop.js';
import { credit } from './wallet.js';

function pick(rng, count) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new GameError('Sorteio inválido. Tente novamente.');
  return Math.floor(value * count);
}

export function runEvent(player, { now = Date.now(), rng = Math.random } = {}) {
  assertPlayable(player);
  integer(now, { min: 0, label: 'Data' });
  const remaining = player.lastEvent === null || player.lastEvent === undefined ? 0 :
    Math.max(0, COOLDOWNS.event - (now - player.lastEvent));
  if (remaining) throw new GameError(`Aguarde ${formatRemaining(remaining)} para outro evento lunar.`, 'COOLDOWN');
  let reward;
  switch (pick(rng, 5)) {
    case 0: {
      const amount = Math.min(80, Number.MAX_SAFE_INTEGER - player.coins);
      credit(player, amount);
      reward = { type: 'coins', amount };
      break;
    }
    case 1: {
      const result = addWolves(player, 5, rng, now);
      reward = { type: 'wolves', amount: result.added, ...result };
      break;
    }
    case 2: {
      const type = ['attack', 'defense', 'counter'][pick(rng, 3)];
      reward = { type: 'boost', boost: grantBoost(player, type, now) };
      break;
    }
    case 3: {
      const amount = Math.min(25, LIMITS.hp - player.hp);
      player.hp = Math.round((player.hp + amount) * 100) / 100;
      reward = { type: 'hp', amount };
      break;
    }
    default:
      reward = { type: 'none', amount: 0 };
  }
  player.lastEvent = now;
  player.updatedAt = now;
  return reward;
}
