import { GameError, integer } from '../game/validation.js';
import { ensureRP } from './state.js';
import { getRPItem } from './shop.js';
import { getJob } from './jobs.js';

const RECIPES = [
  { id: 'lampiao', materials: { prisma: 1, resina: 1 }, energy: 5, careers: ['Tecnologia', 'Construção'] },
  { id: 'tala', materials: { fibra: 1, curativo: 1 }, energy: 4, careers: ['Saúde', 'Rural'] },
  { id: 'racampo', materials: { fruta: 2, fibra: 1 }, energy: 4, careers: ['Serviços', 'Rural'] },
];
function cost(recipe, rp) {
  return rp.jobId && recipe.careers.includes(getJob(rp.jobId).category) ? recipe.energy - 2 : recipe.energy;
}
function materials(recipe) {
  return Object.entries(recipe.materials).map(([id, qty]) => qty + '× ' + id).join(' + ');
}
export function workshop(player, args, now) {
  const rp = ensureRP(player, now);
  const view = lines => ({ type: 'field-report', title: 'OFICINA DO FAROL', lines });
  if (!args.length || (args.length === 1 && args[0] === 'receitas')) {
    return view([...RECIPES.map(recipe => `${recipe.id} • ${materials(recipe)} • ${cost(recipe, rp)} energia\n${getRPItem(recipe.id).description}`),
      'Compre insumos em !rploja oficina. Use !oficina fabricar ID. Profissões afins gastam 2 de energia a menos.']);
  }
  const recipe = RECIPES.find(entry => entry.id === args[1]);
  if (args.length !== 2 || args[0] !== 'fabricar' || !recipe) throw new GameError('Use !oficina receitas ou !oficina fabricar ID.');
  if (rp.jailedUntil > now) throw new GameError('Aguarde o fim da prisão RP para usar a oficina.');
  const energy = cost(recipe, rp);
  if (rp.energy < energy) throw new GameError('Falta energia para fabricar. Consulte !rp perfil.');
  for (const [id, needed] of Object.entries(recipe.materials)) {
    if ((rp.inventory[id] || 0) < needed) throw new GameError('Faltam ingredientes. Receita: ' + materials(recipe));
  }
  const next = integer((rp.inventory[recipe.id] || 0) + 1, { max: 999, label: 'Estoque' });
  for (const [id, count] of Object.entries(recipe.materials)) {
    rp.inventory[id] -= count;
    if (!rp.inventory[id]) delete rp.inventory[id];
  }
  rp.energy -= energy;
  rp.inventory[recipe.id] = next;
  rp.updatedAt = player.updatedAt = now;
  return view([`Você fabricou ${getRPItem(recipe.id).name}. Estoque: ${next}. Energia gasta: ${energy}.`, getRPItem(recipe.id).description]);
}
