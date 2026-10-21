import { normalizeJid, phoneJid } from '../identity.js';
import { GAME_OWNERS, LIMITS } from './constants.js';

export class GameError extends Error {
  constructor(message, code = 'VALIDATION') { super(message); this.name = 'GameError'; this.code = code; }
}

const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

export function brazilianNumber(value) {
  const input = String(value ?? '').trim();
  if (!/^\+?[\d ()-]+$/.test(input)) throw new GameError('Informe um número brasileiro com DDI 55, DDD e telefone.');
  const digits = input.replace(/\D/g, '');
  if (!/^55\d{10,11}$/.test(digits) || !DDDS.has(digits.slice(2, 4))) {
    throw new GameError('O jogo aceita somente números brasileiros válidos com DDI 55.');
  }
  return digits;
}

export function canonicalPlayerJid(value) {
  const jid = phoneJid(value);
  if (!jid) throw new GameError('Não consegui confirmar seu número. Use uma conta brasileira com DDI 55; tente também no privado do bot.', 'IDENTITY');
  return `${brazilianNumber(jid.split('@')[0])}@s.whatsapp.net`;
}

export function validJid(value) { return normalizeJid(value); }

export function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER, label = 'Quantidade' } = {}) {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))) {
    throw new GameError(`${label} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new GameError(`${label} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

export function quantity(value, max = Number.MAX_SAFE_INTEGER) { return integer(value, { min: 1, max }); }

export function assertBalance(player, amount) {
  integer(amount);
  if (!Number.isSafeInteger(player.coins) || player.coins < amount) throw new GameError('Moedas insuficientes.', 'BALANCE');
}

export function normalizeClanName(value) {
  const name = String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 32 || !/^[\p{L}\p{N} _-]+$/u.test(name)) {
    throw new GameError('O nome do clã deve ter de 2 a 32 caracteres: letras, números, espaços, _ ou -.');
  }
  return { key: name.toLocaleLowerCase('pt-BR'), name };
}

export function isGameOwner(jid) {
  const pn = phoneJid(jid);
  return !!pn && GAME_OWNERS.includes(pn.split('@')[0]);
}

export function assertGameOwner(jid) {
  if (!isGameOwner(jid)) throw new GameError('Esse comando é exclusivo dos donos do jogo.', 'OWNER');
}

export function validatePlayer(player) {
  if (!player || canonicalPlayerJid(player.jid) !== player.jid || brazilianNumber(player.number) !== player.number) {
    throw new GameError('Dados de identidade do jogador inválidos.');
  }
  if (player.jid !== `${player.number}@s.whatsapp.net`) throw new GameError('Número e JID do jogador não correspondem.');
  if (typeof player.hp !== 'number' || !Number.isFinite(player.hp) || player.hp < 0 || player.hp > LIMITS.hp) {
    throw new GameError('HP deve estar entre 0 e 100.');
  }
  for (const field of ['wolves', 'attack', 'defense', 'counter']) integer(player[field], { max: LIMITS[field], label: field });
  if (player.attack + player.defense + player.counter > player.wolves) throw new GameError('A formação supera o total de lobisomens.');
  for (const field of ['coins', 'wins', 'losses', 'draws', 'extraTraining']) integer(player[field], { label: field });
  if (typeof player.banned !== 'boolean' || !Array.isArray(player.boosts)) throw new GameError('Status do jogador inválido.');
  return player;
}

export function formatRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}min`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  return `${seconds}s`;
}
