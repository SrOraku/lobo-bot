import { DEV_SIGNATURE, header } from './constants.js';

const STATS = ['attack', 'defense', 'counter'];
const BAND_ORDER = { loss: 0, draw: 1, win: 2 };
const OUTCOME_LABEL = { win: 'Vitória', loss: 'Derrota', draw: 'Empate' };

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} deve ser um número finito.`);
  }
  return value;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampHp(value) {
  return round(Math.max(0, Math.min(100, finite(value, 'HP'))));
}

function statsOf(player) {
  const stats = {};
  for (const key of STATS) {
    const value = finite(player?.[key], key);
    if (value < 0) throw new RangeError(`${key} não pode ser negativo.`);
    stats[key] = value;
  }
  return stats;
}

/** Return effective statistics without changing the player's base formation. */
export function applyBoosts(player, now = Date.now()) {
  finite(now, 'Horário');
  const stats = statsOf(player);
  const active = new Map();
  for (const boost of player.boosts || []) {
    if (!boost || !STATS.includes(boost.type) || boost.effect !== 'multiplier') continue;
    if (!Number.isFinite(boost.value) || boost.value < 0 ||
        !Number.isFinite(boost.activatedAt) || !Number.isFinite(boost.expiresAt) ||
        boost.activatedAt > now || boost.expiresAt <= now) continue;
    active.set(boost.type, Math.max(active.get(boost.type) || 0, boost.value));
  }
  for (const [type, value] of active) {
    stats[type] *= 1 + value;
    finite(stats[type], type);
  }
  return { ...player, ...stats };
}

/** The single implementation of the official formula, including active boosts. */
export function calculateDamage(player, enemy, { now = Date.now() } = {}) {
  const own = applyBoosts(player, now);
  const opposing = applyBoosts(enemy, now);
  const damage = own.attack * 1.2 - opposing.defense * 0.8 + own.counter * 0.5;
  finite(damage, 'Dano');
  return finite(round(Math.max(0, damage)), 'Dano');
}

/** The thresholds describe an HP band, not an independent match victory. */
export function getBattleResult(hp) {
  const value = finite(hp, 'HP');
  return value > 50 ? 'win' : value >= 20 ? 'draw' : 'loss';
}

function coinsOf(player) {
  if (!Number.isSafeInteger(player?.coins) || player.coins < 0) {
    throw new TypeError('Moedas devem ser um inteiro seguro e não negativo.');
  }
  return player.coins;
}

function resultSide(player, damage, incomingDamage, outcome) {
  const hpBefore = clampHp(player.hp);
  const hpAfter = clampHp(hpBefore - incomingDamage);
  const coins = coinsOf(player);
  const coinChange = outcome === 'win' ? 50 : outcome === 'draw' ? 10 : -Math.min(25, coins);
  const coinsAfter = coins + coinChange;
  if (!Number.isSafeInteger(coinsAfter)) throw new RangeError('O saldo excederia o limite seguro.');
  return {
    jid: player.jid, name: player.name, number: player.number, damage,
    hpBefore, hpAfter, hpClass: getBattleResult(hpAfter), outcome, coinChange, coinsAfter,
  };
}

/** Resolve simultaneous damage using persistent HP; a shared HP band is a draw. */
export function resolveBattle(attacker, defender, { now = Date.now() } = {}) {
  finite(now, 'Horário');
  const attackerDamage = calculateDamage(attacker, defender, { now });
  const defenderDamage = calculateDamage(defender, attacker, { now });
  const attackerHp = clampHp(clampHp(attacker.hp) - defenderDamage);
  const defenderHp = clampHp(clampHp(defender.hp) - attackerDamage);
  const difference = BAND_ORDER[getBattleResult(attackerHp)] - BAND_ORDER[getBattleResult(defenderHp)];
  const outcome = difference > 0 ? 'attacker' : difference < 0 ? 'defender' : 'draw';
  return {
    at: now,
    attacker: resultSide(attacker, attackerDamage, defenderDamage, outcome === 'draw' ? 'draw' : outcome === 'attacker' ? 'win' : 'loss'),
    defender: resultSide(defender, defenderDamage, attackerDamage, outcome === 'draw' ? 'draw' : outcome === 'defender' ? 'win' : 'loss'),
    outcome,
  };
}

function displayName(player) {
  const name = String(player.name || player.number || 'Lobo').replace(/[\r\n]+/g, ' ').slice(0, 60);
  return player.number ? `${name} (+${player.number})` : name;
}

function signed(value) { return `${value >= 0 ? '+' : ''}${value}`; }

export function generateBattleMessage(result) {
  const { attacker, defender } = result;
  const final = result.outcome === 'draw' ? 'Empate' : `Vitória de ${displayName(result[result.outcome])}`;
  return `${header('BATALHA DA ALCATEIA')}
🗡️ Atacante: ${displayName(attacker)}
🛡️ Defensor: ${displayName(defender)}
⚔️ Danos: ${attacker.damage} × ${defender.damage}
💎 HP final: ${attacker.hpAfter}/100 × ${defender.hpAfter}/100
🏆 Resultado: ${final}
🐺 Atacante: ${OUTCOME_LABEL[attacker.outcome]} • ${signed(attacker.coinChange)} WOK Coin
🐺 Defensor: ${OUTCOME_LABEL[defender.outcome]} • ${signed(defender.coinChange)} WOK Coin
${DEV_SIGNATURE}`;
}
