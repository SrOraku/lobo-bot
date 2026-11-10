import { GameError, integer, quantity, formatRemaining } from '../game/validation.js';
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
  { id: 'fruta', name: 'Fruta fresca', type: 'food', price: 8, effects: { hunger: 12, health: 2 }, description: 'Uma parada na feira recupera saciedade e saúde.' },
  { id: 'sanduiche', name: 'Sanduíche da praça', type: 'food', price: 18, effects: { hunger: 25, energy: 5 }, description: 'Lanche rápido para voltar à cidade.' },
  { id: 'sopa', name: 'Sopa da estalagem', type: 'food', price: 22, effects: { hunger: 25, health: 8 }, description: 'Uma tigela quente depois de um dia difícil.' },
  { id: 'marmita', name: 'Marmita do trabalhador', type: 'food', price: 32, effects: { hunger: 45, energy: 10 }, description: 'Refeição reforçada para o próximo expediente.' },
  { id: 'churrasco', name: 'Churrasco da matilha', type: 'food', price: 55, effects: { hunger: 65, energy: 12 }, description: 'Comida de encontro na fogueira da cidade.' },
  { id: 'salada', name: 'Salada da horta', type: 'food', price: 16, effects: { hunger: 22, health: 5 }, description: 'Produtos frescos dos personagens do campo.' },
  { id: 'peixelua', name: 'Peixe ao luar', type: 'food', price: 38, effects: { hunger: 35, health: 12 }, description: 'Especialidade da vila ribeirinha.' },
  { id: 'trilhamix', name: 'Provisões de trilha', type: 'food', price: 28, effects: { hunger: 25, energy: 20 }, description: 'Castanhas e frutas para uma jornada longa.' },
  { id: 'suco', name: 'Suco da feira', type: 'drink', price: 12, effects: { hunger: 8, energy: 12 }, description: 'Uma pausa refrescante entre tarefas.' },
  { id: 'cha', name: 'Chá da lua', type: 'drink', price: 15, effects: { energy: 15, health: 5 }, description: 'Chá de cenário para recuperar o personagem.' },
  { id: 'aguacoco', name: 'Água de coco', type: 'drink', price: 18, effects: { hunger: 10, energy: 18 }, description: 'Descanso à sombra na praça.' },
  { id: 'chocolatequente', name: 'Chocolate quente', type: 'drink', price: 24, effects: { hunger: 10, energy: 30 }, description: 'Aquece a noite fria da cidade.' },
  { id: 'curativo', name: 'Curativo de RP', type: 'medicine', price: 18, effects: { health: 12 }, description: 'Cuida de pequenos ferimentos do personagem.' },
  { id: 'balsamo', name: 'Bálsamo lunar de RP', type: 'medicine', price: 90, effects: { health: 75 }, description: 'Tratamento de cenário para recuperar a saúde RP.' },
  { id: 'elixir', name: 'Elixir de descanso RP', type: 'medicine', price: 110, effects: { health: 40, energy: 35 }, description: 'Recuperação combinada do personagem; não cura HP da Alcateia.' },
  { id: 'livro', name: 'Livro dedicado', type: 'gift', price: 45, effects: { reputation: 2 }, description: 'Presenteie outro personagem com uma história e uma dedicatória.' },
  { id: 'pelucia', name: 'Pelúcia de lobo', type: 'gift', price: 70, effects: { reputation: 4 }, description: 'Lembrança da matilha para outro personagem.' },
  { id: 'serenata', name: 'Serenata da lua', type: 'gift', price: 120, effects: { reputation: 6 }, description: 'Uma apresentação de cenário dedicada a outro personagem.' },
  { id: 'trofeu', name: 'Troféu de amizade', type: 'gift', price: 240, effects: { reputation: 10 }, description: 'Celebre a jornada de outro personagem.' },
  { id: 'chacara', name: 'Chácara da mata', type: 'home', price: 18_000, level: 4, effects: {}, description: 'Moradia com descanso mais restaurador.' },
  { id: 'refugiolunar', name: 'Refúgio lunar', type: 'home', price: 30_000, level: 5, effects: {}, description: 'Moradia de alto nível com descanso aprimorado.' },
  { id: 'jipe', name: 'Jipe de expedição', type: 'vehicle', price: 20_000, level: 5, effects: {}, description: 'Poupa energia nos deslocamentos do trabalho.' },
  { id: 'motorhome', name: 'Motorhome da matilha', type: 'vehicle', price: 32_000, level: 6, effects: {}, description: 'Viagens profissionais confortáveis, com menor gasto de energia.' },
  { id: 'kitclinico', name: 'Bolsa clínica', type: 'equipment', price: 800, categories: ['Saúde'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP por expediente de Saúde.' },
  { id: 'maletajuridica', name: 'Maleta de documentos', type: 'equipment', price: 900, categories: ['Justiça', 'Política'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP no trabalho de Justiça ou Política.' },
  { id: 'kitresgate', name: 'Kit de resgate', type: 'equipment', price: 800, categories: ['Segurança'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP no trabalho de Segurança.' },
  { id: 'kitensino', name: 'Kit de ensino', type: 'equipment', price: 700, categories: ['Educação'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP no trabalho de Educação.' },
  { id: 'notebook', name: 'Notebook profissional', type: 'equipment', price: 1_100, categories: ['Tecnologia'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP no trabalho de Tecnologia.' },
  { id: 'kitoficina', name: 'Maleta de ferramentas', type: 'equipment', price: 850, categories: ['Serviços', 'Construção', 'Transporte'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP em Serviços, Construção ou Transporte.' },
  { id: 'kitcampo', name: 'Kit do campo', type: 'equipment', price: 700, categories: ['Rural'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP no trabalho Rural.' },
  { id: 'instrumento', name: 'Instrumento de artista', type: 'equipment', price: 900, categories: ['Artes'], effects: {}, description: 'Equipe para ganhar até +20 WoK coin e +2 XP no trabalho de Artes.' },
];

export const RP_ITEMS = Object.freeze(ITEMS.map(item => Object.freeze({ ...item, effects: Object.freeze(item.effects), ...(item.categories ? { categories: Object.freeze(item.categories) } : {}) })));
export const RP_SHOP_CATEGORIES = Object.freeze(Object.fromEntries(Object.entries({
  comidas: ['food'], bebidas: ['drink'], saude: ['medicine'], presentes: ['gift', 'ring'],
  moradias: ['home'], veiculos: ['vehicle'], equipamentos: ['equipment'],
}).map(([name, types]) => [name, Object.freeze(types)])));
export const REST_COOLDOWN_MS = 30 * 60_000;

export function equippedRPItem(player) {
  const rp = player.rp;
  const item = RP_ITEMS.find(entry => entry.type === 'equipment' && entry.id === rp?.equipment);
  return item && Number.isSafeInteger(rp.inventory?.[item.id]) && rp.inventory[item.id] > 0 ? item : null;
}

export function workEquipment(player, category) {
  const item = equippedRPItem(player);
  return item?.categories.includes(category) ? item : null;
}

export function restRP(player, { now = Date.now() } = {}) {
  integer(now, { max: Number.MAX_SAFE_INTEGER - REST_COOLDOWN_MS, label: 'Data' });
  const rp = ready(player, now);
  if (!rp.home) throw new GameError('Compre uma moradia na loja RP antes de descansar em casa.', 'RP_HOME');
  const level = integer(rp.home.level, { min: 1, max: 5, label: 'Nível da moradia' });
  if (rp.jailedUntil !== null && integer(rp.jailedUntil, { label: 'Prisão' }) > now) throw new GameError('Aguarde o fim da prisão fictícia antes de descansar em casa.', 'RP_JAILED');
  if (rp.lastRest !== null && now - rp.lastRest < REST_COOLDOWN_MS) throw new GameError(`Aguarde ${formatRemaining(REST_COOLDOWN_MS - (now - rp.lastRest))} para descansar novamente.`, 'COOLDOWN');
  const effects = { energy: Math.min(15 + level * 5, 100 - rp.energy), health: Math.min(3 + level * 2, 100 - rp.health) };
  if (!Object.values(effects).some(value => value > 0)) throw new GameError('Sua energia e sua saúde RP já estão no limite.');
  rp.energy += effects.energy;
  rp.health += effects.health;
  rp.lastRest = now;
  rp.updatedAt = now;
  player.updatedAt = now;
  return { home: rp.home, effects, cooldownMs: REST_COOLDOWN_MS, scene: `Você retorna para ${rp.home.name}, prepara um lugar tranquilo e recupera as forças para a próxima jornada.` };
}

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
  if (item.type === 'equipment') {
    if (target && target.jid !== player.jid) throw new GameError('Equipe a ferramenta no próprio personagem.');
    if (rp.equipment === item.id) throw new GameError('Esse equipamento já está em uso. Apenas uma ferramenta fica equipada por vez.');
    const previousEquipment = rp.equipment;
    rp.equipment = item.id;
    rp.updatedAt = now;
    player.updatedAt = now;
    return { item, targetJid: player.jid, effects: {}, remaining: count, coins: player.coins, equipped: true, previousEquipment,
      scene: `Você prepara ${item.name} para o próximo expediente. O bônus vale apenas para ${item.categories.join(', ')}.` };
  }
  let recipient = player;
  if (item.type === 'gift') {
    if (!target || target.jid === player.jid) throw new GameError('Mencione outro personagem RP para receber o presente.');
    assertPlayable(target);
    if (!target.rp) throw new GameError('O alvo precisa usar um comando do RP, como !rp perfil, antes de receber o presente.');
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
  const scene = item.type === 'gift' ? `Você entrega ${item.name} e cria uma nova lembrança na história de outro personagem.`
    : `Você faz uma pausa na jornada e usa ${item.name} para recuperar o personagem.`;
  return { item, targetJid: recipient.jid, effects, remaining: count - 1, coins: player.coins, scene };
}
