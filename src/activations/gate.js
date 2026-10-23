'use strict';
const { allowed, commandSector } = require('./policy');
function createGate({ store, resolveActor } = {}) {
  return async (sock, ctx, name, definition) => {
    if (!ctx.jid?.endsWith('@g.us')) return true;
    const key = commandSector(name, ctx.args, definition);
    if (!key) return true; // Navegação e recuperação continuam disponíveis.
    const policy = (store || require('./store').getStore()).get(ctx.jid);
    if (policy.bot) return true;
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (actor.owner) return true;
    await sock.sendMessage(
      ctx.jid,
      {
        text: '🌹 🔒 O bot está pausado neste grupo. Consulte os administradores com !ativacoes. 🐺'.replace(
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
