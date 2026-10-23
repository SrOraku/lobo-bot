'use strict';
const { CATEGORIES, CATEGORY_ALIASES, categoryOf, ADDON } = require('../menus/catalog');
const SECTORS = ['bot', ...Object.keys(CATEGORIES)];
const MODES = ['on', 'off', 'membros', 'adm', 'dono'];
function defaults() {
  return { bot: true, sectors: {}, delegates: {} };
}
function sector(value) {
  const key = String(value || '').toLowerCase();
  return CATEGORY_ALIASES[key] || key;
}
function normalizeMode(value) {
  return (
    { ativar: 'on', desativar: 'off', admins: 'adm', admin: 'adm', todos: 'membros' }[value] ||
    value
  );
}
function change(current, { action, target, value, owner, admin }) {
  const next = structuredClone(current),
    key = sector(target),
    mode = normalizeMode(String(value || '').toLowerCase());
  if (!SECTORS.includes(key)) throw Error('Setor inválido.');
  if (action === 'delegar') {
    if (!owner) throw Error('Somente o dono pode delegar controles aos administradores.');
    if (['bot', 'dono'].includes(key) || !['on', 'off'].includes(mode))
      throw Error('Use delegar SETOR on/off; bot e dono não podem ser delegados.');
    next.delegates[key] = mode === 'on';
    return next;
  }
  if (action !== 'set' || !MODES.includes(mode)) throw Error('Use SETOR on/off/membros/adm/dono.');
  if (!owner && (!admin || !current.delegates[key]))
    throw Error('O dono ainda não delegou este setor aos administradores do grupo.');
  if (key === 'bot') {
    if (!owner) throw Error('Somente o dono pode ativar ou pausar o bot no grupo.');
    if (!['on', 'off'].includes(mode)) throw Error('Use bot on/off.');
    next.bot = mode === 'on';
    return next;
  }
  if (key === 'dono')
    throw Error('O setor dono é exclusivo dos donos e não pode ser liberado para outros cargos.');
  if (key === 'adm' && mode === 'membros')
    throw Error('Administração não pode ser liberada para membros comuns.');
  if (!owner && mode === 'dono') throw Error('Somente o dono pode restringir um setor aos donos.');
  if (!owner && current.sectors[key] === 'dono') throw Error('Este setor está reservado ao dono.');
  next.sectors[key] = mode === 'on' ? (key === 'adm' ? 'adm' : 'membros') : mode;
  return next;
}
function allowed(policy, key, actor) {
  if (actor.owner) return true;
  if (!policy.bot) return false;
  const mode = key === 'dono' ? 'dono' : policy.sectors[key] || (key === 'adm' ? 'adm' : 'membros');
  if (mode === 'off' || mode === 'dono') return false;
  return mode !== 'adm' || actor.admin;
}
function commandSector(name, args = [], definition) {
  if (name === 'menu' || definition?.menuShortcut || ['ativacoes', 'ativações'].includes(name))
    return null;
  if (name === 'alcateia') {
    const sub = String(args[0] || 'menu').toLowerCase();
    if (sub === 'menu') return null;
    if (sub === 'admin') return 'dono';
    return ADDON[sub]?.[0] || 'alcateia';
  }
  return definition ? categoryOf(definition) : ADDON[name]?.[0] || 'util';
}
module.exports = { SECTORS, MODES, defaults, sector, change, allowed, commandSector };
