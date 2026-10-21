import { GameError, integer } from '../game/validation.js';

export function ensureRP(player, now = Date.now()) {
  integer(now, { label: 'Data' });
  const defaults = {
    jobId: null, experience: 0, lastWork: null, lastJobAction: null,
    energy: 100, hunger: 100, health: 100, lastCareAt: now,
    wanted: 0, jailedUntil: null, reputation: 0,
    inventory: {}, home: null, vehicle: null, relationship: null,
    familyId: null, createdAt: now, updatedAt: now,
  };
  if (player.rp === undefined || player.rp === null) player.rp = defaults;
  else if (typeof player.rp !== 'object' || Array.isArray(player.rp)) throw new GameError('Perfil RP inválido.');
  const rp = player.rp;
  for (const [key, value] of Object.entries(defaults)) {
    if (rp[key] === undefined) rp[key] = value;
  }
  for (const field of ['energy', 'hunger', 'health']) integer(rp[field], { max: 100, label: field });
  for (const field of ['experience', 'wanted', 'reputation']) integer(rp[field], { label: field });
  if (!rp.inventory || typeof rp.inventory !== 'object' || Array.isArray(rp.inventory)) throw new GameError('Inventário RP inválido.');
  for (const count of Object.values(rp.inventory)) integer(count, { max: 999, label: 'Estoque' });
  return rp;
}

export function ensureRPWorld(game) {
  if (game.rp === undefined) game.rp = { families: {}, invites: {}, history: [] };
  const world = game.rp;
  if (!world || typeof world !== 'object' || Array.isArray(world)) throw new GameError('Dados de cidade RP inválidos.');
  for (const name of ['families', 'invites']) {
    if (world[name] === undefined) world[name] = {};
    if (!world[name] || typeof world[name] !== 'object' || Array.isArray(world[name])) throw new GameError('Dados de família RP inválidos.');
  }
  if (world.history === undefined) world.history = [];
  if (!Array.isArray(world.history)) throw new GameError('Histórico RP inválido.');
  return world;
}
