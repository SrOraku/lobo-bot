import { LIMITS } from './constants.js';
import { GameError, assertBalance, integer } from './validation.js';
import { assertPlayable } from './players.js';
import { debit } from './wallet.js';

const HOUR = 3_600_000;

export const SHOP_ITEMS = Object.freeze([
  Object.freeze({ id: '1', name: 'Fúria Lunar 🗡️', price: 100, type: 'attack', value: 0.2, duration: HOUR,
    category: 'Combate', description: 'O uivo desperta sua formação: +20% de ataque por 1 hora.' }),
  Object.freeze({ id: '2', name: 'Pele de Prata 🛡️', price: 100, type: 'defense', value: 0.2, duration: HOUR,
    category: 'Combate', description: 'A lua protege seus guardiões: +20% de defesa por 1 hora.' }),
  Object.freeze({ id: '3', name: 'Instinto Selvagem ⚡', price: 150, type: 'counter', value: 0.3, duration: HOUR,
    category: 'Combate', description: 'Siga os rastros do adversário: +30% de contra-ataque por 1 hora.' }),
  Object.freeze({ id: '4', name: 'Treino Alfa 🐺', price: 200, type: 'training', value: 1, duration: 0,
    category: 'Treino', description: 'Um instrutor acompanha a matilha: 1 crédito de treino extra.' }),
  Object.freeze({ id: '5', name: 'Ervas da Floresta 🌿', price: 40, type: 'healing', value: 25, duration: 0,
    category: 'Recuperação', description: 'Ervas do refúgio recuperam até 25 HP da Alcateia, inclusive a partir de 0.' }),
  Object.freeze({ id: '6', name: 'Elixir de Luar 🧪', price: 90, type: 'healing', value: 60, duration: 0,
    category: 'Recuperação', description: 'A curandeira prepara uma dose que recupera até 60 HP da Alcateia.' }),
  Object.freeze({ id: '7', name: 'Fonte Lunar 🌙', price: 140, type: 'healing', value: 100, duration: 0,
    category: 'Recuperação', description: 'Descanse junto à fonte: restaura o HP da Alcateia até 100, sem apagar o cooldown de batalha.' }),
  Object.freeze({ id: '8', name: 'Garras do Eclipse 🐾', price: 220, type: 'attack', value: 0.3, duration: 2 * HOUR,
    category: 'Combate', description: 'A patrulha avança sob o eclipse: +30% de ataque por 2 horas.' }),
  Object.freeze({ id: '9', name: 'Manto da Sentinela 🧥', price: 220, type: 'defense', value: 0.3, duration: 2 * HOUR,
    category: 'Combate', description: 'As sentinelas fecham as passagens: +30% de defesa por 2 horas.' }),
  Object.freeze({ id: '10', name: 'Olho da Coruja 🦉', price: 280, type: 'counter', value: 0.4, duration: 2 * HOUR,
    category: 'Combate', description: 'Observe antes de reagir: +40% de contra-ataque por 2 horas.' }),
  Object.freeze({ id: '11', name: 'Ritual da Matilha 🔥', price: 420, type: 'ritual', duration: HOUR + HOUR / 2,
    category: 'Combate', description: 'Reúna a formação: +20% de ataque e defesa, +30% de contra-ataque por 90 min; preserva bônus superiores ativos.' }),
  Object.freeze({ id: '12', name: 'Expedição de Treino 🏕️', price: 500, type: 'training', value: 3, duration: 0,
    category: 'Treino', description: 'Reserve a trilha dos instrutores: 3 créditos de treino extra, usados pelo comando treino.' }),
]);

function prepareBoosts(player, specs, duration, now, preserveSuperior = false) {
  const types = new Set(specs.map(spec => spec.type));
  const active = player.boosts.filter(entry => entry && entry.expiresAt > now);
  const boosts = specs.map(spec => {
    const prior = preserveSuperior ? active.filter(entry => entry.type === spec.type && entry.effect === 'multiplier'
      && Number.isFinite(entry.value) && entry.value >= 0 && Number.isSafeInteger(entry.expiresAt)) : [];
    return { type: spec.type, effect: 'multiplier', value: Math.max(spec.value, ...prior.map(entry => entry.value)),
      activatedAt: now, expiresAt: Math.max(now + duration, ...prior.map(entry => entry.expiresAt)) };
  });
  return { boosts, next: [...active.filter(entry => !types.has(entry.type)), ...boosts] };
}

export function grantBoost(player, type, now = Date.now()) {
  const item = SHOP_ITEMS.find(entry => entry.type === type && entry.duration);
  if (!item || !['attack', 'defense', 'counter'].includes(type)) throw new GameError('Tipo de boost inválido.');
  integer(now, { min: 0, max: Number.MAX_SAFE_INTEGER - item.duration, label: 'Data' });
  const prepared = prepareBoosts(player, [item], item.duration, now);
  player.boosts = prepared.next;
  player.updatedAt = now;
  return prepared.boosts[0];
}

export function buyItem(player, itemId, { now = Date.now() } = {}) {
  assertPlayable(player);
  const item = SHOP_ITEMS.find(entry => entry.id === String(itemId));
  if (!item) throw new GameError('Item inválido. Consulte a loja da Alcateia para escolher um ID.');
  integer(now, { min: 0, max: Number.MAX_SAFE_INTEGER - Math.max(HOUR, item.duration), label: 'Data' });
  assertBalance(player, item.price);
  let prepared, extraTraining, healthRecovered = 0;
  if (item.type === 'training') {
    if (player.wolves >= LIMITS.wolves) throw new GameError('Você já possui 100 lobisomens e não precisa de treino extra.');
    const current = integer(player.extraTraining ?? 0, { min: 0, max: Number.MAX_SAFE_INTEGER - item.value, label: 'Treinos extras' });
    extraTraining = current + item.value;
  } else if (item.type === 'healing') {
    healthRecovered = Math.min(item.value, LIMITS.hp - player.hp);
    if (healthRecovered <= 0) throw new GameError('Seu HP da Alcateia já está completo. Nenhuma moeda foi gasta.', 'HP_FULL');
  } else {
    const specs = item.type === 'ritual'
      ? [{ type: 'attack', value: 0.2 }, { type: 'defense', value: 0.2 }, { type: 'counter', value: 0.3 }]
      : [item];
    prepared = prepareBoosts(player, specs, item.duration, now, item.type === 'ritual');
  }
  // Todas as validações terminam antes de debitar ou aplicar os efeitos.
  debit(player, item.price);
  if (extraTraining !== undefined) player.extraTraining = extraTraining;
  if (healthRecovered) player.hp = Math.min(LIMITS.hp, player.hp + healthRecovered);
  if (prepared) player.boosts = prepared.next;
  player.updatedAt = now;
  return { item, boost: prepared?.boosts[0], boosts: prepared?.boosts || [],
    hp: player.hp, healthRecovered, extraTraining: player.extraTraining, coins: player.coins,
    message: healthRecovered ? `A curandeira acolheu sua matilha: +${healthRecovered} HP. Você está com ${player.hp}/100 HP.` : item.description };
}
