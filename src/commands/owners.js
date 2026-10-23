'use strict';
const { frameNotice } = require('../menus/render');
async function owners(sock, ctx) {
  const actor = await require('../activations/access').resolveActor(sock,ctx);
  const reply = lines => sock.sendMessage(ctx.jid,{text:frameNotice('👑 DONOS DO BOT',lines)},{quoted:ctx.msg});
  if (!actor.owner) return reply(['Este painel é exclusivo dos donos cadastrados.']);
  const config = require('../config'), p = config.get('PREFIX'), action = String(ctx.args[0] || 'lista').toLowerCase();
  const root = String(config.get('BOT_OWNER')).replace(/\D/g,'');
  const settings = require('../security/settings');
  if (action === 'lista') return reply([
    ...require('../utils/owners').ownerNumbers().map(n => `${n === root ? '👑 Principal' : '🛡️ Dono autorizado'}: +${n}`),
    `${p}donos adicionar número\n${p}donos remover número\n_Somente o principal gerencia donos; a conta conectada não recebe esse cargo automaticamente._`,
  ]);
  if (actor.phone !== root + '@s.whatsapp.net') return reply(['Somente o dono principal pode cadastrar ou remover outros donos.']);
  if (!['adicionar','remover'].includes(action) || ctx.args.length !== 2 || !/^\d{10,15}$/.test(ctx.args[1]))
    return reply([`Use ${p}donos adicionar/remover número, com DDI e somente dígitos.`]);
  const number = ctx.args[1];
  if (number === root) return reply(['O dono principal não pode ser removido ou substituído por comando.']);
  const configured = [root,...String(config.get('BOT_OWNERS') || '').split(/[,;\s]+/).map(s => s.replace(/\D/g,''))];
  if (action === 'remover' && configured.includes(number)) return reply(['Esse dono foi configurado no ambiente. Sua remoção exige alterar BOT_OWNERS na instalação.']);
  const list = settings.get('owners',[]), next = action === 'adicionar' ? [...new Set([...list,number])] : list.filter(n => n !== number);
  if (next.length > 20) return reply(['Limite de 20 donos adicionais cadastrados por comando.']);
  settings.set('owners',next,actor.phone,'owners.'+action);
  return reply([`✅ +${number} ${action === 'adicionar' ? 'cadastrado como dono' : 'removido do cadastro'}.`, 'As alterações persistem após reiniciar.']);
}
module.exports = { owners };
