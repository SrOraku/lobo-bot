import { GameError, integer, quantity, assertBalance } from './validation.js';

export const CURRENCY = 'WoK coin';

export function credit(player, amount) {
  integer(amount);
  const next = integer(player.coins) + amount;
  if (!Number.isSafeInteger(next)) throw new GameError('O saldo excederia o limite seguro.');
  player.coins = next;
  return next;
}

export function debit(player, amount) {
  integer(amount);
  assertBalance(player, amount);
  player.coins -= amount;
  return player.coins;
}

export function transfer(from, to, amount) {
  const value = quantity(amount);
  if (from.jid === to.jid || from === to) throw new GameError('Você não pode transferir para si mesmo.');
  assertBalance(from, value);
  integer(to.coins);
  if (!Number.isSafeInteger(to.coins + value)) throw new GameError('O saldo do destinatário excederia o limite seguro.');
  from.coins -= value;
  to.coins += value;
  return { fromBalance: from.coins, toBalance: to.coins };
}
