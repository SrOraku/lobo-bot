'use strict';

const HOUR = 3_600_000, DAY = 24 * HOUR;
const SHOP_ITEMS = Object.freeze([
  { id: 1, name: '💎 Premium 7 dias', price: 2000, description: 'XP dobrado por 7 dias', category: 'premium', type: 'premium', duration: 7 * DAY },
  { id: 2, name: '🐺 Cure Total de Lobos', price: 200, description: 'Restaura todos os 100 lobos', category: 'protecao', type: 'heal' },
  { id: 3, name: '🔮 Estratégia Aleatória', price: 100, description: 'Sorteia uma estratégia misteriosa', category: 'protecao', type: 'strategy' },
  { id: 4, name: '⚡ Boost XP 24h', price: 500, description: 'XP triplicado por 24 horas', category: 'xp', type: 'effect', effect: 'xp', multiplier: 3, duration: DAY },
  { id: 5, name: '🎯 Escudo de Batalha 3h', price: 300, description: 'Imunidade a ataques por 3 horas', category: 'protecao', type: 'effect', effect: 'shield', duration: 3 * HOUR },
  { id: 6, name: '🌕 Título "Alfa da Lua"', price: 5000, description: 'Título exclusivo no perfil', category: 'titulos', type: 'title', titleId: 'alfa-lua', title: 'Alfa da Lua' },
  { id: 7, name: '🐾 Passe do Viajante — Premium 1 dia', price: 350, description: 'Premium por 24h para uma jornada curta; benefícios Premium existentes', category: 'premium', type: 'premium', duration: DAY },
  { id: 8, name: '👑 Pacto Lunar — Premium 30 dias', price: 7500, description: 'Premium por 30 dias para acompanhar uma temporada da matilha', category: 'premium', type: 'premium', duration: 30 * DAY },
  { id: 9, name: '✨ Centelha Lunar — XP 2h', price: 90, description: 'XP por mensagem 3× durante 2h; ideal para uma sessão de jogo', category: 'xp', type: 'effect', effect: 'xp', multiplier: 3, duration: 2 * HOUR },
  { id: 10, name: '🌠 Vigília da Matilha — XP 6h', price: 180, description: 'XP por mensagem 3× durante 6h; amplia a duração do boost ativo', category: 'xp', type: 'effect', effect: 'xp', multiplier: 3, duration: 6 * HOUR },
  { id: 11, name: '🛡️ Manto do Refúgio — Escudo 1h', price: 120, description: 'Proteção por 1h contra o combate !atacar do modo clássico', category: 'protecao', type: 'effect', effect: 'shield', duration: HOUR },
  { id: 12, name: '🏕️ Santuário Lunar — Escudo 12h', price: 1000, description: 'Proteção por 12h contra o combate !atacar do modo clássico', category: 'protecao', type: 'effect', effect: 'shield', duration: 12 * HOUR },
  { id: 13, name: '🌲 Título "Guardião da Floresta"', price: 1800, description: 'Título permanente de quem protege as trilhas da matilha', category: 'titulos', type: 'title', titleId: 'guardiao-floresta', title: 'Guardião da Floresta' },
  { id: 14, name: '🌌 Título "Explorador Noturno"', price: 2500, description: 'Título permanente para levar suas jornadas ao perfil', category: 'titulos', type: 'title', titleId: 'explorador-noturno', title: 'Explorador Noturno' },
  { id: 15, name: '📜 Título "Sábio da Matilha"', price: 3500, description: 'Título permanente inspirado nos contadores de histórias do refúgio', category: 'titulos', type: 'title', titleId: 'sabio-matilha', title: 'Sábio da Matilha' },
  { id: 16, name: '🌘 Título "Lenda do Eclipse"', price: 8000, description: 'Título permanente de prestígio; efeito visual no perfil', category: 'titulos', type: 'title', titleId: 'lenda-eclipse', title: 'Lenda do Eclipse' },
].map(Object.freeze));

const CATEGORIES = Object.freeze({ todos: 'Todos os itens', premium: 'Passes Premium', xp: 'Vigílias de XP', protecao: 'Refúgio e combate clássico', titulos: 'Títulos da jornada' });
const PAGE_SIZE = 6;

function getShopItem(value) {
  return Number.isSafeInteger(value) ? SHOP_ITEMS.find(item => item.id === value) : undefined;
}

function shopPage(args = []) {
  if (!Array.isArray(args) || args.length > 2) throw Error('Use loja [categoria] [página].');
  let category = 'todos', page = 1;
  if (args.length && /^\d+$/.test(args[0])) {
    if (args.length !== 1) throw Error('Use loja [categoria] [página].');
    page = Number(args[0]);
  } else if (args.length) {
    category = String(args[0]).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (category === 'geral') category = 'todos';
    if (!Object.hasOwn(CATEGORIES, category)) throw Error('Categorias: premium, xp, protecao e titulos.');
    if (args[1] !== undefined) {
      if (!/^\d+$/.test(args[1])) throw Error('Informe uma página inteira positiva.');
      page = Number(args[1]);
    }
  }
  const items = category === 'todos' ? SHOP_ITEMS : SHOP_ITEMS.filter(item => item.category === category);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw Error(`Página inválida. Esta categoria tem ${pages} página(s).`);
  return { category, name: CATEGORIES[category], page, pages, total: items.length, items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

module.exports = { SHOP_ITEMS, CATEGORIES, PAGE_SIZE, getShopItem, shopPage };
