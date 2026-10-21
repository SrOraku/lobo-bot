import { LIMITS } from './constants.js';
import { GameError, assertBalance, integer } from './validation.js';
import { assertPlayable } from './players.js';
import { debit } from './wallet.js';

const HOUR = 3_600_000;

export const SHOP_ITEMS = Object.freeze([
  Object.freeze({ id: '1', name: 'Fúria Lunar 🗡️', price: 100, type: 'attack', value: 0.2, duration: HOUR }),
  Object.freeze({ id: '2', name: 'Pele de Prata 🛡️', price: 100, type: 'defense', value: 0.2, duration: HOUR }),
  Object.freeze({ id: '3', name: 'Instinto Selvagem ⚡', price: 150, type: 'counter', value: 0.3, duration: HOUR }),
  Object.freeze({ id: '4', name: 'Treino Alfa 🐺', price: 200, type: 'training', value: 1, duration: 0 }),
]);

export function grantBoost(player, type, now = Date.now()) {
  const item = SHOP_ITEMS.find(entry => entry.type === type && entry.duration);
  if (!item) throw new GameError('Tipo de boost inválido.');
  integer(now, { min: 0, max: Number.MAX_SAFE_INTEGER - HOUR, label: 'Data' });
  const boost = { type: item.type, effect: 'multiplier', value: item.value, activatedAt: now, expiresAt: now + HOUR };
  player.boosts = player.boosts.filter(entry => entry.expiresAt > now && entry.type !== type);
  player.boosts.push(boost);
  player.updatedAt = now;
  return boost;
}

export function buyItem(player, itemId, { now = Date.now() } = {}) {
  assertPlayable(player);
  const item = SHOP_ITEMS.find(entry => entry.id === String(itemId));
  if (!item) throw new GameError('Item inválido. Consulte !loja e escolha de 1 a 4.');
  integer(now, { min: 0, max: Number.MAX_SAFE_INTEGER - HOUR, label: 'Data' });
  assertBalance(player, item.price);
  let boost;
  if (item.type === 'training') {
    if (player.wolves >= LIMITS.wolves) throw new GameError('Você já possui 100 lobisomens e não precisa de treino extra.');
    const current = integer(player.extraTraining ?? 0, { min: 0, max: Number.MAX_SAFE_INTEGER - 1, label: 'Treinos extras' });
    player.extraTraining = current + 1;
  } else {
    boost = grantBoost(player, item.type, now);
  }
  debit(player, item.price);
  player.updatedAt = now;
  return { item, boost, extraTraining: player.extraTraining, coins: player.coins };
}
