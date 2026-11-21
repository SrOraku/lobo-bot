'use strict';
const { commandSector, isGroupSwitch } = require('./policy');
function createGate({ store, resolveActor } = {}) {
  return async (sock, ctx, name, definition) => {
    if (!ctx.jid?.endsWith('@g.us')) return true;
    if (isGroupSwitch(name, ctx.args)) return true; // O handler verifica o dono.
    const policy = (store || require('./store').getStore()).get(ctx.jid);
    if (!policy.bot) return false;
    const key = commandSector(name, ctx.args, definition);
    if (!key || !policy.features?.somenteadmins) return true;
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (actor.owner || actor.admin || (actor.securityLevel || 0) >= 2) return true;
    await sock.sendMessage(ctx.jid, {text: '🛡️ Este grupo está no modo de comandos somente para administradores.'}, {quoted: ctx.msg});
    return false;
  };
}
module.exports = { createGate, checkActivation: createGate() };
