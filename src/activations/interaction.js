'use strict';
const { frameNotice } = require('../menus/render');
const registry = require('./registry');
function createInteraction({ now = Date.now, resolveActor, store, rateLimit } = {}) {
  const sessions = new Map();
  const key = ctx => `${ctx.jid}|${ctx.sender || ctx.msg?.key?.participant || ctx.msg?.key?.remoteJid}`;
  function open(ctx) {
    for (const [id, item] of sessions) if (item.expires <= now()) sessions.delete(id);
    if (sessions.size >= 2000) sessions.delete(sessions.keys().next().value);
    sessions.set(key(ctx), { stage: 'select', ids: registry.list().filter(f => f.source !== 'sector').map(f => f.id), expires: now() + 120000, last: ctx.msg?.key?.id });
  }
  function requestDays(ctx, previous = false) {
    open(ctx);
    Object.assign(sessions.get(key(ctx)), { stage: 'days', feature: 'antiinatividade', previous });
  }
  async function handle(sock, ctx, input) {
    const id = key(ctx), session = sessions.get(id);
    if (!session || !/^\d+$/.test(input)) return false;
    const reply = text => sock.sendMessage(ctx.jid, { text: frameNotice('⚙️ CONFIGURAÇÃO DO GRUPO', [text]) }, { quoted: ctx.msg });
    if (session.expires <= now()) { sessions.delete(id); await reply('⏳ Seleção expirada. Abra o painel de ativações novamente.'); return true; }
    if (session.busy || session.last === ctx.msg?.key?.id) return true;
    if (rateLimit && !rateLimit(ctx.sender).allowed) { await reply('⏳ Aguarde um instante antes de responder novamente.'); return true; }
    session.busy = true;
    session.last = ctx.msg?.key?.id;
    try {
      const actor = await (resolveActor || require('./access').resolveActor)(sock, ctx);
      if (!actor.owner && !actor.admin) { sessions.delete(id); await reply('🔒 Somente administradores do grupo e donos podem configurar.'); return true; }
      const manager = require('./manager').createManager(store);
      if (session.stage === 'days') {
        const days = Number(input);
        if (!Number.isInteger(days) || days < 1 || days > 90) {
          await reply('📅 Digite apenas um número inteiro de *1 a 90*. Exemplo: *15*.');
          return true;
        }
        sessions.delete(id);
        if (manager.isEnabled(ctx.jid, session.feature) !== session.previous) {
          await reply('⚠️ Outro administrador alterou a função. Abra o painel novamente.'); return true;
        }
        await manager.set(ctx.jid, ['antiinatividade'], true, { actor, botAdmin: actor.botAdmin, options: { inactivity_days: days } });
        await reply(`🟢 Limpeza de inativos ativada.\n📅 Prazo: *${days} dia${days === 1 ? '' : 's'}*.\n💾 Configuração salva somente neste grupo.\n\n_A remoção acontece ao executar o comando de limpeza; ninguém foi removido agora._`);
      } else if (session.stage === 'select') {
        const feature = registry.feature(session.ids[Number(input) - 1]);
        if (!feature) { await reply('❌ Número inválido. Escolha um item listado no painel.'); return true; }
        session.feature = feature.id;
        session.previous = manager.isEnabled(ctx.jid, feature.id);
        session.stage = 'confirm';
        session.expires = now() + 120000;
        await reply(`*${feature.name}*\n${session.previous ? '🟢 Ativado → 🔴 Desativar' : '🔴 Desativado → 🟢 Ativar'}\n\n${feature.id === 'autodownload' ? 'Links de Instagram, Facebook, TikTok, Kwai, Threads, X/Twitter, YouTube, Spotify, SoundCloud e iFunny.\nUsa a cota da API Bronxys. Links bloqueados pelo AntiLink não são baixados.\n\n' : ''}Deseja confirmar?\n*1* — Sim\n*2* — Não\n\n_Responda em até 2 minutos._`);
      } else {
        if (!['1', '2'].includes(input)) { await reply('Responda *1* para confirmar ou *2* para cancelar.'); return true; }
        sessions.delete(id);
        if (input === '2') { await reply('↩️ Cancelado. Nenhuma configuração foi alterada.'); return true; }
        if (manager.isEnabled(ctx.jid, session.feature) !== session.previous) { await reply('⚠️ Outro administrador alterou essa função. Abra o painel novamente.'); return true; }
        if (session.feature === 'antiinatividade' && !session.previous) {
          requestDays(ctx, false);
          await reply('📅 Após quantos dias de inatividade?\n\nDigite somente o número de *1 a 90*.\nExemplo: *15* para quinze dias.\n\n_Responda em até 2 minutos. A função será ativada após salvar o prazo._');
          return true;
        }
        await manager.set(ctx.jid, [session.feature], !session.previous, { actor, botAdmin: actor.botAdmin });
        await reply(`${session.previous ? '🔴 Desativado' : '🟢 Ativado'}: *${registry.feature(session.feature).name}*\n💾 Configuração salva somente neste grupo.`);
      }
      return true;
    } catch (error) {
      sessions.delete(id);
      await reply(/SQLITE|database/i.test(error.code || error.message) ? 'Não consegui salvar a configuração. Abra o painel e tente novamente.' : error.message);
      return true;
    } finally { session.busy = false; }
  }
  return { open, handle, requestDays };
}
let active;
function interaction() {
  if (!active) active = createInteraction({ rateLimit: sender => require('../middlewares/rateLimit').checkRateLimit(sender) });
  return active;
}
module.exports = { createInteraction, interaction };
