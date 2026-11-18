'use strict';
const { frameNotice } = require('../menus/render');
const { mono, badge } = require('../ui/text');
const registry = require('./registry');
function createInteraction({ now = Date.now, resolveActor, store, rateLimit } = {}) {
  const sessions = new Map();
  const key = ctx => `${ctx.jid}|${ctx.sender || ctx.msg?.key?.participant || ctx.msg?.key?.remoteJid}`;
  function open(ctx, { preservePanel = false } = {}) {
    const previous = sessions.get(key(ctx));
    for (const [id, item] of sessions) if (item.expires <= now()) sessions.delete(id);
    if (sessions.size >= 2000) sessions.delete(sessions.keys().next().value);
    sessions.set(key(ctx), { stage: 'select', ids: registry.list().filter(f => f.source !== 'sector').map(f => f.id), expires: now() + 120000, last: ctx.msg?.key?.id,
      seen: new Set(ctx.msg?.key?.id ? [ctx.msg.key.id] : []),
      panelKey: preservePanel && previous?.expires > now() ? previous.panelKey : null });
  }
  function attachPanel(ctx, panelKey) {
    const session = sessions.get(key(ctx));
    // Only a message returned by the bot transport may become an edit target.
    // Never use the participant's command/response key as a panel key.
    if (session && typeof panelKey?.id === 'string' && panelKey.id && panelKey.fromMe === true && panelKey.remoteJid === ctx.jid)
      session.panelKey = { ...panelKey };
  }
  function requestDays(ctx, previous = false) {
    open(ctx, { preservePanel: true });
    Object.assign(sessions.get(key(ctx)), { stage: 'days', feature: 'antiinatividade', previous });
  }
  function confirmation(feature, previous) {
    return `*${feature.name}*\n*Estado atual:* ${badge(previous)}\n*Alteração proposta:* ${previous ? 'Desativar' : 'Ativar'}\n${feature.id === 'autodownload' ? 'Links de Instagram, Facebook, TikTok, Kwai, Threads, X/Twitter, YouTube, Spotify, SoundCloud e iFunny.\nUsa a cota da API Bronxys. Links bloqueados pelo AntiLink não são baixados.\n' : ''}🌹 *Deseja ${previous ? 'desativar' : 'ativar'} esta função?* 🐺\n     🟢 ${mono(1)} — *SIM*\n       _Confirmar e ${previous ? 'desativar' : 'ativar'}._\n     🔴 ${mono(2)} — *NÃO*\n       _Cancelar e manter como está._\n> 🌹 Nada muda antes da confirmação. Responda em até ${mono('2 minutos')}.`;
  }
  function requestFeature(ctx, name, previous) {
    const feature = registry.feature(name);
    if (!feature || feature.source === 'sector') throw Error('Função não encontrada no painel.');
    open(ctx, { preservePanel: true });
    Object.assign(sessions.get(key(ctx)), { stage: 'confirm', feature: feature.id, previous });
    return confirmation(feature, previous);
  }
  async function handle(sock, ctx, input) {
    const id = key(ctx), session = sessions.get(id);
    if (!session || !/^\d+$/.test(input)) return false;
    const reply = text => sock.sendMessage(ctx.jid, { text: frameNotice('⚙️ CONFIGURAÇÃO DO GRUPO', [text]) }, { quoted: ctx.msg });
    if (session.expires <= now()) { sessions.delete(id); await reply('⏳ Seleção expirada. Abra o painel de ativações novamente.'); return true; }
    if (session.busy || session.last === ctx.msg?.key?.id || session.seen?.has(ctx.msg?.key?.id)) return true;
    if (rateLimit && !rateLimit(ctx.sender).allowed) { await reply('⏳ Aguarde um instante antes de responder novamente.'); return true; }
    session.busy = true;
    session.last = ctx.msg?.key?.id;
    if (session.last) {
      session.seen.add(session.last);
      if (session.seen.size > 100) session.seen.delete(session.seen.values().next().value);
    }
    let actor;
    async function show(text) {
      if (session.panelKey) {
        try { await sock.sendMessage(ctx.jid, { text, edit: session.panelKey }); return; }
        catch { /* Older clients/expired messages may reject edits; send a fresh panel. */ }
      }
      session.panelKey = null;
      const sent = await sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
      attachPanel(ctx, sent?.key);
    }
    async function refresh(notice) {
      if (sessions.get(id) !== session) return;
      session.stage = 'select';
      delete session.feature; delete session.previous;
      session.expires = now() + 120000;
      const repository = store || require('./store').getStore();
      const text = require('./panel').renderPanel({ repository, actor, ctx, prefix: require('../config').get('PREFIX'), notice });
      await show(text);
    }
    try {
      actor = await (resolveActor || require('./access').resolveActor)(sock, ctx);
      if (!actor.owner && !actor.admin && (actor.securityLevel||0)<2) { sessions.delete(id); await reply('🔒 Somente administradores do grupo e donos podem configurar.'); return true; }
      const manager = require('./manager').createManager(store);
      if (session.stage === 'days') {
        const days = Number(input);
        if (!Number.isInteger(days) || days < 1 || days > 90) {
          await reply('📅 Digite um número inteiro de `1` a `90`. Exemplo: `15`.');
          return true;
        }
        if (manager.isEnabled(ctx.jid, session.feature) !== session.previous) {
          await refresh('⚠️ Outro administrador alterou a função. Confira o estado atualizado antes de escolher novamente.'); return true;
        }
        await manager.set(ctx.jid, ['antiinatividade'], true, { actor, botAdmin: actor.botAdmin, options: { inactivity_days: days } });
        await refresh(`🟢 Limpeza de inativos ativada.\n📅 *Prazo:* ${mono(days)} dia${days === 1 ? '' : 's'}.\n💾 Configuração salva somente neste grupo.\n> A remoção acontece ao executar o comando de limpeza; ninguém foi removido agora.`);
      } else if (session.stage === 'select') {
        const feature = registry.feature(session.ids[Number(input) - 1]);
        if (!feature) { await reply('❌ Número inválido. Escolha um item listado no painel.'); return true; }
        session.feature = feature.id;
        session.previous = manager.isEnabled(ctx.jid, feature.id);
        session.stage = 'confirm';
        session.expires = now() + 120000;
        await show(frameNotice('⚙️ CONFIGURAÇÃO DO GRUPO', [confirmation(feature, session.previous)]));
      } else {
        if (!['1', '2'].includes(input)) { await reply('Responda `1` para confirmar ou `2` para cancelar.'); return true; }
        if (input === '2') { await refresh('↩️ Cancelado. Nenhuma configuração foi alterada.'); return true; }
        if (manager.isEnabled(ctx.jid, session.feature) !== session.previous) { await refresh('⚠️ Outro administrador alterou essa função. Confira o estado atualizado antes de escolher novamente.'); return true; }
        if (session.feature === 'antiinatividade' && !session.previous) {
          session.stage = 'days';
          session.expires = now() + 120000;
          await show(frameNotice('📅 PRAZO DE INATIVIDADE', ['Digite somente o número de `1` a `90`.\nExemplo: `15` para quinze dias.\n> Responda em até `2 minutos`. A função será ativada após salvar o prazo.']));
          return true;
        }
        await manager.set(ctx.jid, [session.feature], !session.previous, { actor, botAdmin: actor.botAdmin });
        await refresh(`${session.previous ? '🔴 Desativado' : '🟢 Ativado'}: *${registry.feature(session.feature).name}*\n💾 Configuração salva somente neste grupo.`);
      }
      return true;
    } catch (error) {
      const notice = /SQLITE|database/i.test(error.code || error.message) ? 'Não consegui salvar a configuração. O estado anterior foi preservado; escolha a função para tentar novamente.' : error.message;
      if (actor && (actor.owner || actor.admin || (actor.securityLevel || 0) >= 2)) await refresh(notice);
      else { sessions.delete(id); await reply(notice); }
      return true;
    } finally { session.busy = false; }
  }
  return { open, handle, requestDays, requestFeature, attachPanel };
}
let active;
function interaction() {
  if (!active) active = createInteraction({ rateLimit: sender => require('../middlewares/rateLimit').checkRateLimit(sender) });
  return active;
}
module.exports = { createInteraction, interaction };
