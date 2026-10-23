'use strict';
const { UpdateService, UpdateError } = require('../updater/service');
const { frameNotice } = require('../menus/render');

async function verifiedOwner(sock, ctx, ownerNumber) {
  const owner = String(ownerNumber || '').replace(/\D/g, '');
  const key = ctx.msg?.key;
  if (!owner || !key?.remoteJid || key.remoteJid === 'status@broadcast') return false;
  const { IdentityResolver, normalizeJid } = await import('../../addons/alcateia/src/identity.js');
  const group = key.remoteJid.endsWith('@g.us');
  const sender = normalizeJid(key.fromMe ? sock.user?.id : group ? key.participant : key.remoteJid);
  if (!sender) return false;
  const alternate = key.fromMe ? sock.user?.lid : group ? key.participantAlt : key.remoteJidAlt;
  const resolver = new IdentityResolver(sock, `${owner}@s.whatsapp.net`);
  return (await resolver.member(sender, alternate))?.isOwner === true;
}

function createUpdateHandler({ service = new UpdateService(), config = require('../config'), logger = console, restart = require('../updater/supervisor') } = {}) {
  return async (sock, ctx) => {
    const value = key => typeof config.get === 'function' ? config.get(key) : config[key];
    const p = value('PREFIX') || '!';
    const frame = (title, lines) => frameNotice(`${title === 'ATUALIZAÇÃO CONCLUÍDA' ? '✅' : '👑'} ${title}`, lines);
    const reply = (title, lines) => sock.sendMessage(ctx.jid || ctx.msg?.key?.remoteJid,
      { text: frame(title, lines) }, { quoted: ctx.msg });
    let owner = false;
    try {
      for (const number of require('../utils/owners').ownerNumbers(config)) {
        if (await verifiedOwner(sock, ctx, number)) { owner = true; break; }
      }
    } catch {}
    if (!owner) return reply('ACESSO DO DONO', ['🐺 Este comando é exclusivo do dono do bot.']);
    const args = ctx.args || [];
    if (!args.length) return reply('ATUALIZAÇÃO DA ALCATEIA', [
      `💎 ${p}atualizar status — versões instaladas`,
      `⚙️ ${p}atualizar bot — código do repositório`,
      `🐺 ${p}atualizar baileys — última versão oficial compatível`,
      '🛡️ Código e dependências são verificados antes da troca.',
      '⏳ Após atualizar, reinicie o bot pelo painel.',
      '💻 A versão do Node é configurada no painel do servidor.',
    ]);
    const action = String(args[0]).toLowerCase();
    if (args.length !== 1 || !['status', 'bot', 'baileys'].includes(action)) {
      return reply('COMANDO INVÁLIDO', [`🐺 Use ${p}atualizar status, bot ou baileys.`]);
    }
    try {
      if (action === 'status') {
        const state = await service.status();
        return reply('STATUS DE ATUALIZAÇÃO', [
          `🤖 Bot: ${state.version}`, `💻 Node: ${state.node}`, `🐺 Baileys: ${state.baileys}`,
          `⚙️ Atualizando: ${state.active ? 'sim' : 'não'}`,
          `⏳ Reinício pendente: ${state.needsRestart ? 'sim' : 'não'}`,
          `⭐ Última atualização: ${state.last?.at || 'nenhuma por comando'}`,
        ]);
      }
      await reply('ATUALIZAÇÃO INICIADA', ['⚙️ Aguarde a verificação e instalação.', '🛡️ Sessão, configurações e dados dos jogos serão preservados.']);
      const result = await service.update(action);
      if (result.already) return reply('JÁ ATUALIZADO', [`✅ ${action === 'bot' ? 'Bot' : 'Baileys'} já está atualizado (${result.version}).`]);
      const automatic = restart.canRestart();
      await reply('ATUALIZAÇÃO CONCLUÍDA', [
        `✅ ${action === 'bot' ? 'Bot' : 'Baileys'}: ${result.version}`,
        `💾 Backup do código e dados: updates/${result.backup}`,
        automatic ? '♻️ Reiniciando automaticamente para carregar os arquivos novos. A sessão será reutilizada.' : '⏳ Reinicie uma vez pelo painel para habilitar o novo inicializador automático.',
      ]);
      if (automatic) restart.requestRestart();
    } catch (error) {
      logger.error?.({ error: error.message }, 'Atualização não concluída.');
      return reply('ATUALIZAÇÃO NÃO CONCLUÍDA', [
        error instanceof UpdateError ? `🐺 ${error.message}` : '🐺 Não consegui atualizar. Consulte o log do servidor.',
      ]);
    }
  };
}
let handler;
function update(sock, ctx) { if (!handler) handler = createUpdateHandler(); return handler(sock, ctx); }
module.exports = { update, createUpdateHandler, verifiedOwner };
