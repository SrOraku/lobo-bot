'use strict';
const config = require('../config');
const { CATEGORIES } = require('../menus/catalog');
const { frameMenu } = require('../menus/render');
const { change } = require('../activations/policy');
function createActivationHandler({ store, resolveActor } = {}) {
  return async (sock, ctx) => {
    const reply = (text) => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
    if (!ctx.jid?.endsWith('@g.us'))
      return reply('🌹 Use este painel dentro do grupo que deseja configurar. 🐺');
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (!actor.owner && !actor.admin)
      return reply('🌹 Somente o dono e os administradores do grupo podem abrir este painel. 🐺');
    const repository = store || require('../activations/store').getStore();
    const args = ctx.args || [],
      p = config.get('PREFIX');
    if (args.length) {
      try {
        const delegating = args[0].toLowerCase() === 'delegar';
        if (args.length !== (delegating ? 3 : 2)) throw Error('Quantidade de argumentos inválida.');
        repository.update(ctx.jid, actor.phone || 'não identificado', (current) =>
          change(current, {
            action: delegating ? 'delegar' : 'set',
            target: args[delegating ? 1 : 0],
            value: args[delegating ? 2 : 1],
            ...actor,
          }),
        );
      } catch (error) {
        return reply(`🌹 ⚠️ ${error.message}\nUse ${p}ativacoes para consultar o painel. 🐺`);
      }
    }
    const policy = repository.get(ctx.jid);
    const lines = Object.entries(CATEGORIES).map(
      ([key, title]) =>
        `${title}: ${key === 'dono' ? 'dono' : policy.sectors[key] || (key === 'adm' ? 'adm' : 'membros')}\n↳ Admins podem configurar: ${policy.delegates[key] ? 'sim' : 'não'}`,
    );
    return reply(
      frameMenu('ATIVAÇÕES DO GRUPO', [
        `🤖 Comandos do bot: ${policy.bot ? 'ativados' : 'pausados'}\n👑 Seu acesso: ${actor.owner ? 'dono' : 'administrador do grupo'}`,
        lines.join('\n'),
        `⚙️ ${p}ativacoes SETOR on/off\n👥 ${p}ativacoes SETOR membros/adm/dono\n🤖 ${p}ativacoes bot on/off\n👑 ${p}ativacoes delegar SETOR on/off`,
        '🐾 O dono controla as delegações. Administradores alteram somente setores autorizados. Ativar setores não concede poderes administrativos nem promove membros no WhatsApp.',
      ]),
    );
  };
}
module.exports = { createActivationHandler, activations: createActivationHandler() };
