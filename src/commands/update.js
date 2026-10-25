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

function createUpdateHandler({ service, config = require('../config'), logger = require('../config/logger').logger, restart = require('../updater/supervisor'), notifyTimeoutMs = 5000 } = {}) {
  service = service || new UpdateService({ logger });
  return async (sock, ctx) => {
    const value = key => typeof config.get === 'function' ? config.get(key) : config[key];
    const p = value('PREFIX') || '!';
    const frame = (title, lines) => frameNotice(`${title === 'ATUALIZAÇÃO CONCLUÍDA' ? '✅' : '👑'} ${title}`, lines);
    const reply = (title, lines) => sock.sendMessage(ctx.jid || ctx.msg?.key?.remoteJid,
      { text: frame(title, lines) }, { quoted: ctx.msg });
    async function notify(title, lines) {
      let timer;
      try {
        await Promise.race([Promise.resolve().then(() => reply(title, lines)), new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(Error('UPDATE_NOTICE_TIMEOUT'), { code: 'UPDATE_NOTICE_TIMEOUT' })), notifyTimeoutMs);
        })]);
        return true;
      } catch (error) {
        logger.warn?.({ component: 'updater', code: error.code || 'UPDATE_NOTICE_FAILED' }, 'Não foi possível confirmar a entrega do aviso de atualização.');
        return false;
      } finally { clearTimeout(timer); }
    }
    async function finish(result, pending = false) {
      const automatic = restart.canRestart();
      await notify(pending ? 'REINÍCIO DA ATUALIZAÇÃO' : 'ATUALIZAÇÃO CONCLUÍDA', [
        pending ? '✅ Os arquivos novos já estão aplicados. Não será feita outra instalação.' : `✅ ${action === 'bot' ? 'Bot' : 'Baileys'}: ${result.version}`,
        ...(result.backup ? [`💾 Backup do código e dados: updates/${result.backup}`] : []),
        automatic ? '♻️ Reiniciando automaticamente para carregar os arquivos novos. A sessão será reutilizada.' : '⚙️ Configuração única: deixe o comando de inicialização da hospedagem como npm start e inicie uma vez. As próximas atualizações reiniciam pelo WhatsApp; preserve os dados existentes.',
      ]);
      if (!automatic) return;
      let accepted = false;
      try { accepted = await restart.requestRestart() !== false; }
      catch (error) { logger.error?.({ component: 'updater', code: error.code || 'RESTART_REQUEST_FAILED' }, 'Arquivos aplicados; pedido de reinício não confirmado.'); }
      if (!accepted) await notify('ARQUIVOS ATUALIZADOS', [`⚠️ Não foi possível confirmar o reinício. Envie ${p}atualizar bot novamente para tentar concluir.`, '🛡️ Não apague sessão, banco ou configurações.']);
    }
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
      restart.canRestart() ? '♻️ Reinício automático ativo: aguarde o bot voltar, sem novo pareamento.' : '⚙️ Configuração única na hospedagem: npm start, tudo em minúsculas, para habilitar o reinício automático.',
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
          `♻️ Supervisor automático: ${restart.canRestart() ? 'ativo' : 'inativo — inicialize com npm start'}`,
          `⭐ Última atualização: ${state.last?.at || 'nenhuma por comando'}`,
          `❤️ Saúde: ${state.health?'versão em teste • '+state.health.crashCount+' falhas':'sem versão em teste'}`,
          `🔐 Integridade: ${state.last?.integrity||'commit fixado'}`,
        ]);
      }
      if (service.needsRestart) return finish({}, true);
      await notify('ATUALIZAÇÃO INICIADA', ['⚙️ Aguarde a verificação e instalação.', '🛡️ Sessão, configurações e dados dos jogos serão preservados.']);
      const result = await service.update(action);
      if (result.already) return reply('JÁ ATUALIZADO', [`✅ ${action === 'bot' ? 'Bot' : 'Baileys'} já está atualizado (${result.version}).`]);
      return finish(result);
    } catch (error) {
      if (error.code === 'RESTART_REQUIRED') return finish({}, true);
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
