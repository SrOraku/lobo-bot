import { GameError, integer, quantity } from '../game/validation.js';
import { assertPlayable } from '../game/players.js';
import { debit } from '../game/wallet.js';
import { ensureRP } from './state.js';

const ITEMS = [
  { id: 'pao', name: 'Pão', type: 'food', price: 5, effects: { hunger: 10 } },
  { id: 'refeicao', name: 'Refeição', type: 'food', price: 20, effects: { hunger: 35 } },
  { id: 'banquete', name: 'Banquete', type: 'food', price: 45, effects: { hunger: 70 } },
  { id: 'agua', name: 'Água', type: 'drink', price: 5, effects: { hunger: 5, energy: 5 } },
  { id: 'cafe', name: 'Café', type: 'drink', price: 10, effects: { energy: 20 } },
  { id: 'energetico', name: 'Energético', type: 'drink', price: 25, effects: { energy: 45 } },
  { id: 'remedio', name: 'Remédio de RP', type: 'medicine', price: 30, effects: { health: 25 } },
  { id: 'kitmedico', name: 'Kit médico de RP', type: 'medicine', price: 70, effects: { health: 60 } },
  { id: 'chocolate', name: 'Chocolate', type: 'food', price: 15, effects: { hunger: 20 } },
  { id: 'flores', name: 'Flores', type: 'gift', price: 25, effects: { reputation: 1 } },
  { id: 'presente', name: 'Presente', type: 'gift', price: 60, effects: { reputation: 3 } },
  { id: 'alianca', name: 'Aliança', type: 'ring', price: 150, effects: {} },
  { id: 'apartamento', name: 'Apartamento', type: 'home', price: 1_500, level: 1, effects: {} },
  { id: 'casa', name: 'Casa', type: 'home', price: 3_500, level: 2, effects: {} },
  { id: 'mansao', name: 'Mansão', type: 'home', price: 10_000, level: 3, effects: {} },
  { id: 'bicicleta', name: 'Bicicleta', type: 'vehicle', price: 300, level: 1, effects: {} },
  { id: 'moto', name: 'Moto', type: 'vehicle', price: 1_500, level: 2, effects: {} },
  { id: 'carro', name: 'Carro', type: 'vehicle', price: 5_000, level: 3, effects: {} },
  { id: 'carroluxo', name: 'Carro de luxo', type: 'vehicle', price: 12_000, level: 4, effects: {} },
];

export const RP_ITEMS = Object.freeze(ITEMS.map(item => Object.freeze({ ...item, effects: Object.freeze(item.effects) })));

function key(value) { return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s_-]+/g, ''); }

export function getRPItem(id) {
  const item = RP_ITEMS.find(entry => key(entry.id) === key(id) || key(entry.name) === key(id));
  if (!item) throw new GameError('Item inválido. Consulte a loja RP.');
  return item;
}

function ready(player, now) {
  assertPlayable(player);
  integer(now, { label: 'Data' });
  const rp = ensureRP(player, now);
  if (!rp.inventory || typeof rp.inventory !== 'object' || Array.isArray(rp.inventory)) throw new GameError('Inventário RP inválido.');
  return rp;
}

export function buyRPItem(player, id, qty = 1, { now = Date.now() } = {}) {
  const item = getRPItem(id);
  const count = quantity(qty, 100);
  const totalCost = integer(item.price * count, { label: 'Preço total' });
  const rp = ready(player, now);
  const property = item.type === 'home' ? 'home' : item.type === 'vehicle' ? 'vehicle' : null;
  if (property) {
    if (count !== 1) throw new GameError('Compre somente uma moradia ou um veículo de cada vez.');
    const current = rp[property];
    if (current) {
      const currentLevel = integer(current.level, { min: 1, label: 'Nível da propriedade' });
      if (item.level <= currentLevel) throw new GameError('Você só pode adquirir um upgrade dessa propriedade.');
    }
    debit(player, totalCost);
    rp[property] = { itemId: item.id, name: item.name, level: item.level, acquiredAt: now };
  } else {
    const current = Object.hasOwn(rp.inventory, item.id) ? integer(rp.inventory[item.id], { max: 999, label: 'Estoque' }) : 0;
    const next = integer(current + count, { max: 999, label: 'Estoque' });
    debit(player, totalCost);
    rp.inventory[item.id] = next;
  }
  rp.updatedAt = now;
  player.updatedAt = now;
  return { item, quantity: count, totalCost, coins: player.coins,
    inventoryCount: property ? null : rp.inventory[item.id], property: property ? rp[property] : null };
}

export function useRPItem(player, id, { now = Date.now(), target = null } = {}) {
  const item = getRPItem(id);
  const rp = ready(player, now);
  const count = Object.hasOwn(rp.inventory, item.id) ? integer(rp.inventory[item.id], { label: 'Estoque' }) : 0;
  if (!count) throw new GameError('Você não possui esse item no inventário.');
  if (item.type === 'ring') throw new GameError('Use a aliança no pedido de casamento do RP.');
  if (['home', 'vehicle'].includes(item.type)) throw new GameError('Essa propriedade já é usada automaticamente após a compra.');
  let recipient = player;
  if (item.type === 'gift') {
    if (!target || target.jid === player.jid) throw new GameError('Mencione outro personagem RP para receber o presente.');
    assertPlayable(target);
    if (!target.rp) throw new GameError('O alvo precisa iniciar seu próprio personagem RP primeiro.');
    recipient = target;
  } else if (target && target.jid !== player.jid) {
    throw new GameError('Alimentos, bebidas e remédios são usados no próprio personagem.');
  }
  const receiving = recipient === player ? rp : ensureRP(recipient, now);
  const effects = {};
  for (const [stat, amount] of Object.entries(item.effects)) {
    const maximum = stat === 'reputation' ? Number.MAX_SAFE_INTEGER : 100;
    const current = integer(receiving[stat] ?? 0, { max: maximum, label: stat });
    effects[stat] = Math.min(amount, maximum - current);
  }
  if (!Object.values(effects).some(amount => amount > 0)) throw new GameError('Os atributos afetados por esse item já estão no limite.');
  for (const [stat, amount] of Object.entries(effects)) receiving[stat] = (receiving[stat] ?? 0) + amount;
  if (count === 1) delete rp.inventory[item.id];
  else rp.inventory[item.id] = count - 1;
  rp.updatedAt = now;
  player.updatedAt = now;
  receiving.updatedAt = now;
  recipient.updatedAt = now;
  return { item, targetJid: recipient.jid, effects, remaining: count - 1, coins: player.coins };
}
