'use strict';
const { logger, isBrazilianFake } = require('../utils/helpers');
const { manager } = require('../activations/manager');
const { inspect, matchingFeatures, createMessageTracker } = require('../activations/message-rules');
const track = createMessageTracker();
async function handleProtection(sock, msg, { jid, sender, body, isGroup }) {
  if (!isGroup) return false;
  let deleted = false;
  async function remove(user) {
    const response = await sock.groupParticipantsUpdate(jid, [user], 'remove');
    if (Array.isArray(response) && response.some(item => item.status && !['200', '201'].includes(String(item.status))))
      throw Error('WhatsApp recusou a remoção.');
  }
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
    deleted = true;
    const policy = require('../activations/store').getStore().get(jid);
    const linkFeatures = candidate.filter(id => ['antilink', 'antilinkgrupo', 'antilinkexterno'].includes(id));
    // Regras sobrepostas produzem uma única advertência por mensagem.
    const modes = linkFeatures.map(id => policy.options[id + '_mode'] || 'delete');
    const mode = modes.includes('kick') ? 'kick' : modes.includes('warn') ? 'warn' : 'delete';
    if (feature === 'antifake' || (linkFeatures.length && mode === 'kick')) {
      await remove(actor.jid || sender);
    } else if (linkFeatures.length && mode === 'warn') {
      if (!actor.phone) {
        logger.warn({ group: jid }, 'Link apagado sem advertência: número não resolvido.');
        return true;
      }
      const result = require('../moderation/warnings').getWarningStore().add(
        jid, actor.phone, 'automatico', linkFeatures.join(','), msg.key.id,
      );
      if (!result.duplicate) {
        let removed = false;
        if (result.count >= 5) {
          await remove(actor.jid || sender);
          removed = true;
        }
        await sock.sendMessage(jid, { text: require('../menus/render').frameNotice('⚠️ ADVERTÊNCIA POR LINK', [
          `Advertências: ${result.count}/5.`,
          removed ? 'Participante removido ao atingir o limite.' : 'Na quinta advertência, o participante será removido.',
        ]) });
      }
    } else if (!linkFeatures.length && !['antiflood', 'antispam'].includes(feature)) {
      await sock.sendMessage(jid, { text: require('../menus/render').frameNotice('🛡️ MENSAGEM BLOQUEADA', [
        require('../activations/registry').feature(feature).name,
      ]) });
    }
    return true;
  } catch (error) {
    logger.warn({ code: error.code || error.name }, 'Falha ao executar proteção do grupo.');
    return deleted;
  }
}
module.exports = { handleProtection };
