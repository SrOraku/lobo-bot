'use strict';
const { frameNotice } = require('../menus/render');
const { inspect } = require('../activations/message-rules');
function createWokIssueCommand(command = 'doarwok', { resolveActor, resolveTarget, issue, log } = {}) {
  if (!['doarwok', 'addwok'].includes(command)) throw Error('Comando de emissão inválido.');
  return async (sock, ctx) => {
    const title = command === 'addwok' ? '💰 ADICIONAR WOK COIN' : '💰 DOAÇÃO DE WOK COIN';
    const reply = (text, mentions = []) => sock.sendMessage(ctx.jid, { text: frameNotice(title, [text]), mentions }, { quoted: ctx.msg });
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (!actor.owner || !actor.phone) return reply('Somente donos cadastrados podem emitir WoK coin.');
    const chat = ctx.msg?.key?.remoteJid;
    if (!chat || chat !== ctx.jid) return reply('Não foi possível confirmar o chat desta operação.');
    const mentions = inspect(ctx.msg?.message).mentions;
    const values = (ctx.args || []).filter(value => !String(value).startsWith('@'));
    const prefix = ctx.PREFIX || require('../config').get('PREFIX');
    if (mentions.length !== 1 || values.length !== 1 || !/^\d+$/.test(values[0]) || !Number.isSafeInteger(Number(values[0])) || Number(values[0]) < 1 || Number(values[0]) > 1000000)
      return reply(`Use ${prefix}${command} ${command === 'addwok' ? 'quantidade @participante' : '@participante quantidade'}.\nInforme de 1 a 1000000 WoK coin por operação.`);
    let result, target;
    try {
      if (resolveTarget) target = await resolveTarget(sock, ctx, mentions[0]);
      else {
        const { IdentityResolver } = await import('../../addons/alcateia/src/identity.js');
        target = await new IdentityResolver(sock, '', ctx.isGroup ? await sock.groupMetadata(chat) : null).member(mentions[0]);
      }
      if (!target?.phoneNumber || ctx.isGroup && !target.inGroup) return reply('Mencione um participante deste grupo com número confirmado pelo WhatsApp.');
      result = await (issue || require('../../plugins/alcateia-rp').donateWok)({ chat, actor: actor.phone, target: target.phoneNumber,
        targetAliases: [...new Set([target.jid, ...(target.aliases || [])].filter(Boolean))], targetName: target.name,
        amount: Number(values[0]), event: ctx.msg.key.id, source: command });
    } catch (error) {
      if (error.code === 'WOK_ISSUE_INVALID' || error.name === 'GameError') return reply(error.message);
      (log || require('../config/logger').logger).error({ component: 'wok-issue', code: error.code || 'WOK_ISSUE_FAILED' }, 'Emissão de WoK coin não concluída.');
      return reply('Não foi possível concluir a emissão. Nenhuma emissão parcial foi confirmada.');
    }
    // Delivery failure cannot undo or repeat an already committed issuance.
    return reply(`${result.duplicate ? 'ℹ️ Emissão já processada' : '✅ Emissão concluída'}\n🐺 @${target.phoneNumber.split('@')[0]}\n💰 ${result.amount} WoK coin\nCarteira após essa operação: ${result.after}\n_O saldo do dono não é descontado. A emissão vale somente para este chat._`, [target.jid]);
  };
}
const donate = createWokIssueCommand('doarwok');
const addWok = createWokIssueCommand('addwok');
module.exports = { donate, addWok, createWokIssueCommand };
