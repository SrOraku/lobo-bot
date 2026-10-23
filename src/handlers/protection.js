'use strict';
const { logger, isBrazilianFake } = require('../utils/helpers');
const { manager } = require('../activations/manager');
const { inspect, matchingFeatures, createMessageTracker } = require('../activations/message-rules');
const track = createMessageTracker();
async function handleProtection(sock, msg, { jid, sender, body, isGroup }) {
  if (!isGroup) return false;
  try {
    const enabled = (id) => manager.isEnabled(jid, id),
      data = inspect(msg.message);
    const candidate = matchingFeatures(data, body || data.body, enabled);
    if (!candidate.length && !['antifake', 'antispam', 'antiflood'].some(enabled)) return false;
    const actor = await require('../activations/access').resolveActor(sock, { jid, msg });
    if (actor.owner || actor.admin) return false;
    const counter = track(jid, actor.phone || sender, body || data.body);
    if (enabled('antiflood') && counter.flood) candidate.push('antiflood');
    if (enabled('antispam') && counter.repeated) candidate.push('antispam');
    if (enabled('antifake') && actor.phone && isBrazilianFake(actor.phone.split('@')[0]))
      candidate.push('antifake');
    if (!candidate.length) return false;
    if (!actor.botAdmin) {
      logger.warn(
        { group: jid, feature: candidate[0] },
        'Proteção exige que o bot seja administrador.',
      );
      return false;
    }
    const feature = candidate[0];
    await sock.sendMessage(jid, { delete: msg.key });
    // AntiFlood/AntiSpam apagam o excesso sem gerar uma resposta para cada mensagem.
    if (!['antiflood', 'antispam'].includes(feature))
      await sock.sendMessage(jid, {
        text: `🌹 🛡️ ${require('../activations/registry').feature(feature).name}: mensagem bloqueada. 🐺`,
      });
    const policy = require('../activations/store').getStore().get(jid);
    if (
      feature === 'antifake' ||
      (feature === 'antilink' && policy.options.antilink_mode === 'kick')
    )
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
    else if (feature === 'antilink' && policy.options.antilink_mode === 'warn') {
      const cache = require('../utils/cache'),
        key = `warn_${actor.phone || sender}_${jid}`,
        warnings = ((await cache.get(key)) || 0) + 1;
      await cache.set(key, warnings, 86400);
      if (warnings >= 3) await sock.groupParticipantsUpdate(jid, [sender], 'remove');
    }
    return true;
  } catch (error) {
    logger.warn({ code: error.code || error.name }, 'Falha ao executar proteção do grupo.');
    return false;
  }
}
module.exports = { handleProtection };
