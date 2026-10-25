'use strict';
const { frameNotice } = require('../menus/render');
const { mono, command } = require('../ui/text');
const { inspect } = require('../activations/message-rules');
function createWarningCommand(action, { store, resolveActor } = {}) {
  return async (sock, ctx) => {
    const reply = text => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
    if (!ctx.jid?.endsWith('@g.us')) return reply(frameNotice('⚠️ APENAS EM GRUPOS', ['Use este comando no grupo.']));
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (!actor.owner && !actor.admin && (actor.securityLevel||0)<2) return reply(frameNotice('🔒 SEM PERMISSÃO', ['Somente administradores do grupo e donos.']));
    const target = inspect(ctx.msg.message).mentions[0];
    if (!target) return reply(frameNotice('⚠️ USO CORRETO', [`Mencione um participante.\n> Use ${command(require('../config').get('PREFIX') + ctx.command + ' @usuário')}`]));
    if(!resolveActor&&action!=='status'&&action!=='reset')await require('../security/groups/service').security().permissions.guardCommand(sock,ctx,'warn');
    const metadata = await sock.groupMetadata(ctx.jid);
    const { IdentityResolver } = await import('../../addons/alcateia/src/identity.js');
    const resolver = new IdentityResolver(sock, '5543920030769@s.whatsapp.net', metadata);
    const member = await resolver.member(target);
    if (!member?.phoneNumber) return reply(frameNotice('⚠️ IDENTIDADE NÃO RESOLVIDA', ['Não foi possível validar o número do participante.']));
    if (!member.inGroup)
      return reply(frameNotice('⚠️ PARTICIPANTE INVÁLIDO', ['Mencione um membro deste grupo.']));
    const repository = store || require('../moderation/warnings').getWarningStore();
    const user = member.phoneNumber;
    if (action === 'status') return reply(frameNotice('📋 ADVERTÊNCIAS', [`*Advertências neste grupo:* ${mono(repository.get(ctx.jid, user))}/${mono(5)}.`]));
    if (action === 'reset') {
      repository.reset(ctx.jid, user, actor.phone || actor.jid);
      return reply(frameNotice('✅ ADVERTÊNCIAS ZERADAS', ['Contador deste participante zerado somente neste grupo.']));
    }
    if (member.isAdmin || await require('../utils/owners').protectedOwner(sock, target, ctx.jid))
      return reply(frameNotice('🛡️ PARTICIPANTE PROTEGIDO', ['Donos e administradores não recebem advertências.']));
    if (!actor.botAdmin) return reply(frameNotice('⚠️ PERMISSÃO NECESSÁRIA', ['O bot precisa ser administrador para remover na quinta advertência.']));
    const reason = (ctx.args || []).filter(v => !v.startsWith('@')).join(' ').slice(0, 300) || 'Advertência administrativa';
    const result = repository.add(ctx.jid, user, actor.phone || actor.jid, reason, ctx.msg.key.id);
    if (result.duplicate) return;
    let removed = false;
    if (result.count >= 5) {
      const response = resolveActor?await sock.groupParticipantsUpdate(ctx.jid,[member.jid],'remove'):await require('../security/groups/service').security().performParticipants(sock,ctx,[member.jid],'remove');
      if (Array.isArray(response) && response.some(item => item.status && !['200', '201'].includes(String(item.status))))
        throw Error('WhatsApp recusou a remoção; as advertências foram preservadas.');
      removed = true;
    }
    return reply(frameNotice('⚠️ ADVERTÊNCIA', [`*Total:* ${mono(result.count)}/${mono(5)}.`, removed ? 'Participante removido ao atingir o limite.' : 'Na quinta advertência, o participante será removido.']));
  };
}
module.exports = { createWarningCommand };
