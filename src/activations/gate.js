'use strict';
const { allowed, commandSector } = require('./policy');
function createGate({ store, resolveActor } = {}) {
  return async (sock, ctx, name, definition) => {
    if (!ctx.jid?.endsWith('@g.us')) return true;
    const key = commandSector(name, ctx.args, definition);
    if (!key) return true; // Navegação e recuperação continuam disponíveis.
    const policy = (store || require('./store').getStore()).get(ctx.jid);
    // Não interfere com as verificações antigas quando não há restrições.
    const mode = policy.sectors[key];
    if (policy.bot && (!mode || mode === 'membros') && !['dono', 'adm'].includes(key)) return true;
    const actor = await (resolveActor || require('./access').resolveActor)(sock, ctx);
    // Para ADM/Dono, a ausência de configuração deixa os handlers originais decidirem.
    if (policy.bot && !mode && ['dono', 'adm'].includes(key)) return true;
    if (allowed(policy, key, actor)) return true;
    await sock.sendMessage(
      ctx.jid,
      {
        text: '🌹 🔒 Este setor está desativado ou restrito neste grupo. Consulte os administradores com !ativacoes. 🐺'.replace(
          '!ativacoes',
          require('../config').get('PREFIX') + 'ativacoes',
        ),
      },
      { quoted: ctx.msg },
    );
    return false;
  };
}
module.exports = { createGate, checkActivation: createGate() };
