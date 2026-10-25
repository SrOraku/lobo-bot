'use strict';
const { frameNotice } = require('../menus/render');
const { inspect } = require('../activations/message-rules');
const { mono, command: displayCommand } = require('../ui/text');
function createWokIssueCommand(command = 'doarwok', { resolveActor, resolveTarget, issue, log } = {}) {
  if (!['doarwok', 'addwok'].includes(command)) throw Error('Comando de emissão inválido.');
  return async (sock, ctx) => {
    const title = command === 'addwok' ? '💰 ADICIONAR WOK COIN' : '💰 DOAÇÃO DE WOK COIN';
    const reply = (text, mentions = []) => sock.sendMessage(ctx.jid, { text: frameNotice(title, [text]), mentions }, { quoted: ctx.msg });
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (!actor.owner || !actor.phone) return reply('🔒 *Acesso restrito.* _Somente donos cadastrados podem emitir WoK coin._');
    const chat = ctx.msg?.key?.remoteJid;
    if (!chat || chat !== ctx.jid) return reply('❌ *Ação inválida!* _Não foi possível confirmar o chat desta operação._');
    const mentions = inspect(ctx.msg?.message).mentions;
    const values = (ctx.args || []).filter(value => !String(value).startsWith('@'));
    const prefix = ctx.PREFIX || require('../config').get('PREFIX');
    if (mentions.length !== 1 || values.length !== 1 || !/^\d+$/.test(values[0]) || !Number.isSafeInteger(Number(values[0])) || Number(values[0]) < 1 || Number(values[0]) > 1000000)
      return reply(`❌ *Ação inválida!* _Informe de_ ${mono('1 a 1000000')} _WoK coin por operação._\n> 💡 *Use assim:* ${displayCommand(prefix+command+' '+(command === 'addwok' ? 'quantidade @participante' : '@participante quantidade'))}`);
    let result, target;
    try {
      if (resolveTarget) target = await resolveTarget(sock, ctx, mentions[0]);
      else {
        const { IdentityResolver } = await import('../../addons/alcateia/src/identity.js');
        target = await new IdentityResolver(sock, '', ctx.isGroup ? await sock.groupMetadata(chat) : null).member(mentions[0]);
      }
      if (!target?.phoneNumber || ctx.isGroup && !target.inGroup) return reply('❌ *Ação inválida!* _Mencione um participante deste grupo com número confirmado pelo WhatsApp._');
      result = await (issue || require('../../plugins/alcateia-rp').donateWok)({ chat, actor: actor.phone, target: target.phoneNumber,
        targetAliases: [...new Set([target.jid, ...(target.aliases || [])].filter(Boolean))], targetName: target.name,
        amount: Number(values[0]), event: ctx.msg.key.id, source: command });
    } catch (error) {
      if (error.code === 'WOK_ISSUE_INVALID' || error.name === 'GameError') return reply(`❌ *Ação inválida!* _${error.message}_`);
      (log || require('../config/logger').logger).error({ component: 'wok-issue', code: error.code || 'WOK_ISSUE_FAILED' }, 'Emissão de WoK coin não concluída.');
      return reply('❌ *Ação não concluída!* _Não foi possível concluir a emissão. Nenhuma emissão parcial foi confirmada._');
    }
    // Delivery failure cannot undo or repeat an already committed issuance.
    return reply(`${result.duplicate ? 'ℹ️ *Emissão já processada*' : '✅ *Emissão concluída*'}\n*Destinatário:* @${target.phoneNumber.split('@')[0]}\n*Crédito:* ${mono('+'+result.amount)} WoK coin\n*Carteira após essa operação:* ${mono(result.after)}\n> _O saldo do dono não é descontado. A emissão vale somente para este chat._`, [target.jid]);
  };
}
const donate = createWokIssueCommand('doarwok');
const addWok = createWokIssueCommand('addwok');
module.exports = { donate, addWok, createWokIssueCommand };
