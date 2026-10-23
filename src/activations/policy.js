'use strict';
const { CATEGORIES, CATEGORY_ALIASES, categoryOf, ADDON } = require('../menus/catalog');
const SECTORS = ['bot', ...Object.keys(CATEGORIES)];
const MODES = ['on', 'off', 'membros', 'adm', 'dono'];
function defaults() {
  return { bot: true, sectors: {}, delegates: {}, features: {} };
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
  if (key !== 'bot') throw Error('Setores são informativos e não podem ser ativados ou desativados. Use o comando setores.');
  if (action !== 'set') throw Error('Use bot on/off.');
  if (key === 'bot') {
    if (!owner) throw Error('Somente o dono pode ativar ou pausar o bot no grupo.');
    if (!['on', 'off'].includes(mode)) throw Error('Use bot on/off.');
    next.bot = mode === 'on';
    return next;
  }
  return next;
}
function allowed(policy, key, actor) {
  if (actor.owner) return true;
  if (!policy.bot || key === 'dono') return false;
  return key !== 'adm' || !!actor.admin;
}

function commandSector(name, args = [], definition) {
  if (
    name === 'menu' ||
    definition?.menuShortcut ||
    definition?.activationControl ||
    ['ativacoes', 'ativações', 'ativar', 'desativar'].includes(name)
  )
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
