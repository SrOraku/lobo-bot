'use strict';
const { inspect } = require('../activations/message-rules');
const { frameNotice } = require('../menus/render');
const { mono, command } = require('../ui/text');
function selection(ctx) {
  const data = inspect(ctx.msg?.message || {});
  const context = data.message[data.type]?.contextInfo || {};
  return { jid: data.mentions[0] || context.participant, alternative: data.mentions[0] ? null : context.participantAlt };
}
function report(log, code) {
  (log || require('../config/logger').logger).error({ component: 'group-removal', code }, 'Não foi possível concluir uma etapa da remoção.');
}
function feedback(error) {
  if (error.code === 'BOT_ADMIN_REQUIRED') return 'O bot precisa ser administrador do grupo para remover participantes.';
  if (error.code === 'WHATSAPP_REFUSED') return `O WhatsApp recusou a remoção${error.status ? ` (código ${mono(error.status)})` : ''}. Confira as permissões do bot e do participante.`;
  if (error.code === 'WHATSAPP_UNCONFIRMED') return 'O WhatsApp não confirmou a remoção. Nenhum banimento interno foi salvo.';
  if (error.code === 'REMOVAL_UNCONFIRMED') return error.message;
  if (['TARGET_NOT_IN_GROUP', 'ACTION_DENIED', 'ACTOR_NOT_IN_GROUP', 'SECURITY_PAUSED'].includes(error.code)) return error.message;
  return 'Não foi possível concluir a remoção. Confira as permissões e tente novamente.';
}
function saveBan(database, service, ctx, member, enabled) {
  const aliases = [...new Set([member.jid, member.canonical, ...(member.aliases || [])])].filter(id => /^\d+@(s\.whatsapp\.net|lid)$/.test(id || ''));
  return require('../isolation/context').run(ctx.jid, () => database.db.transaction(() => {
    for (const alias of aliases) {
      if (!database.getUser(alias)) database.upsertUser(alias, member.canonical.split('@')[0]);
      if (database.setBanned(alias, enabled ? 1 : 0)?.changes !== 1) throw Error('BAN_NOT_PERSISTED');
    }
    service.store.audit(ctx.jid, { actor: ctx.sender, target: member.canonical, action: enabled ? 'BOT_BAN' : 'BOT_UNBAN', authorized: true, result: 'APPLIED' });
  })());
}
function createRemovalCommand(action, { service, database, prefix, log } = {}) {
  if (!['ban', 'kick'].includes(action)) throw Error('Ação de remoção inválida.');
  return async (sock, ctx) => {
    const security = service || require('../security/groups/service').security();
    const reply = (title, lines, mentions = []) => sock.sendMessage(ctx.jid, { text: frameNotice(title, lines), mentions }, { quoted: ctx.msg });
    let member;
    try {
      await security.permissions.guardCommand(sock, ctx, 'remove');
      const selected = selection(ctx);
      if (!selected.jid) return reply('⚠️ USO CORRETO', [`Mencione um participante ou responda à mensagem dele.\n> Use ${command((prefix || require('../config').get('PREFIX')) + action)}.`]);
      const c = await security.permissions.context(sock, ctx.jid, ctx.sender, ctx.msg?.key?.participantAlt, { force: true });
      member = await c.identify(selected.jid, selected.alternative);
      const decision = security.permissions.canAct(c, 'remove', member);
      if (!member.known || !member.inGroup || !decision.allowed) return reply('🛡️ REMOÇÃO BLOQUEADA', ['O participante está protegido, não está neste grupo ou sua identidade não foi confirmada.']);
      await security.performParticipants(sock, ctx, [member.jid], 'remove');
    } catch (error) {
      report(log, error.code || 'REMOVAL_FAILED');
      return reply('⚠️ REMOÇÃO NÃO CONFIRMADA', [feedback(error)]);
    }
    const number = member.canonical.split('@')[0];
    if (action === 'ban') {
      try { saveBan(database || require('../utils/database'), security, ctx, member, true); }
      catch (error) {
        report(log, error.code || 'BAN_PERSIST_FAILED');
        return reply('⚠️ REMOÇÃO CONCLUÍDA COM RESSALVA', [`@${number} foi removido do grupo, mas o bloqueio de comandos não pôde ser salvo.`, 'Não foi anunciado um banimento interno completo.'], [member.jid]);
      }
    }
    // A failed notification must never undo a removal or delete its saved ban.
    return reply(action === 'ban' ? '🔨 BANIMENTO CONCLUÍDO' : '👢 REMOÇÃO CONCLUÍDA', [`@${number} foi removido do grupo.`, ...(action === 'ban' ? ['Comandos bloqueados para esse participante neste grupo.'] : [])], [member.jid]);
  };
}
function createUnbanCommand({ service, database, prefix, log } = {}) {
  return async (sock, ctx) => {
    const security = service || require('../security/groups/service').security();
    const reply = (title, lines) => sock.sendMessage(ctx.jid, { text: frameNotice(title, lines) }, { quoted: ctx.msg });
    try {
      await security.permissions.guardCommand(sock, ctx, 'settings');
      const selected = selection(ctx);
      if (!selected.jid) return reply('⚠️ USO CORRETO', [`Mencione o usuário ou responda à mensagem dele.\n> Use ${command((prefix || require('../config').get('PREFIX')) + 'unban')}.`]);
      const c = await security.permissions.context(sock, ctx.jid, ctx.sender, ctx.msg?.key?.participantAlt, { force: true });
      const member = await c.identify(selected.jid, selected.alternative);
      if (!member.known) return reply('⚠️ IDENTIDADE NÃO CONFIRMADA', ['Não foi possível confirmar esse usuário.']);
      saveBan(database || require('../utils/database'), security, ctx, member, false);
    } catch (error) {
      report(log, error.code || 'UNBAN_FAILED');
      return reply('⚠️ DESBANIMENTO NÃO CONCLUÍDO', ['Confira sua autorização e tente novamente.']);
    }
    return reply('✅ DESBANIMENTO CONCLUÍDO', ['Bloqueio de comandos removido neste grupo. Esse comando não readiciona o participante ao WhatsApp.']);
  };
}
module.exports = { createRemovalCommand, createUnbanCommand };
