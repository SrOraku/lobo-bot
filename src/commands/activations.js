'use strict';
const config = require('../config');
const { frameMenu, clean } = require('../menus/render');
const registry = require('../activations/registry');
const { change } = require('../activations/policy');
const { createManager } = require('../activations/manager');
function createActivationHandler({
  store,
  resolveActor,
  forcedAction,
  featureId,
  legacyToggle = false,
} = {}) {
  return async (sock, ctx) => {
    const p = config.get('PREFIX'),
      reply = (text) => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
    if (!ctx.jid?.endsWith('@g.us'))
      return reply('🌹 Use este painel dentro do grupo que deseja configurar. 🐺');
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (!actor.owner && !actor.admin)
      return reply('🌹 Somente o dono e os administradores do grupo podem abrir este painel. 🐺');
    const repository = store || require('../activations/store').getStore(),
      manager = createManager(repository);
    const args = (ctx.args || []).map(String),
      group = clean(actor.groupName || ctx.jid);
    try {
      let result;
      if (forcedAction || featureId) {
        let name = featureId || args.shift(),
          value;
        if (forcedAction) value = forcedAction === 'enable';
        else if (!args.length) value = !manager.isEnabled(ctx.jid, name);
        else if (['on', '1', 'off', '0'].includes(args[0]?.toLowerCase()))
          value = ['on', '1'].includes(args.shift().toLowerCase());
        else if (name === 'antilink' && ['delete', 'warn', 'kick'].includes(args[0])) value = true;
        else if (name === 'antiinatividade' && /^\d+$/.test(args[0])) value = true;
        else throw Error('Use on/off ou 1/0.');
        const options = {};
        if (name === 'antilink' && ['delete', 'warn', 'kick'].includes(args[0]))
          options.antilink_mode = args.shift();
        if (name === 'antiinatividade' && /^\d+$/.test(args[0])) {
          options.inactivity_days = Number(args.shift());
          if (options.inactivity_days < 1 || options.inactivity_days > 365)
            throw Error('Informe entre 1 e 365 dias.');
        }
        if (args.length) throw Error('Argumentos extras inválidos.');
        const context = { actor, botAdmin: actor.botAdmin, options };
        result =
          String(name).toLowerCase() === 'tudo'
            ? await manager.bulk(ctx.jid, value, context)
            : await manager.set(ctx.jid, [name], value, context);
        if (!result.changed.length)
          return reply(
            `🌹 ⚠️ ${result.unchanged[0]?.name || 'As funções'} já ${value ? 'está ativado' : 'está desativado'} neste grupo. 🐺`,
          );
        return reply(
          frameMenu('🐺 ATIVAÇÃO', [
            `${value ? '🟢 Função ativada' : '🔴 Função desativada'}\n⚙️ Recurso: ${result.changed.map((f) => f.name).join(', ')}\n👥 Grupo: ${group}\n╰─➤ Configuração salva.`,
          ]),
        );
      }
      if (args.length && args[0].toLowerCase() !== 'status') {
        const delegating = args[0].toLowerCase() === 'delegar';
        if (args.length !== (delegating ? 3 : 2)) throw Error('Quantidade de argumentos inválida.');
        const f = registry.feature(args[0]);
        if (f && f.source !== 'sector' && !delegating) {
          const mode = args[1].toLowerCase();
          if (!['on', 'off', '1', '0'].includes(mode)) throw Error('Use on/off ou 1/0.');
          await manager.set(ctx.jid, [f.id], ['on', '1'].includes(mode), {
            actor,
            botAdmin: actor.botAdmin,
          });
        } else
          repository.update(ctx.jid, actor.phone || actor.jid || 'administrador', (current) =>
            change(current, {
              action: delegating ? 'delegar' : 'set',
              target: args[delegating ? 1 : 0],
              value: args[delegating ? 2 : 1],
              ...actor,
            }),
          );
      } else if (args.length > 1) throw Error('Use apenas status.');
      const policy = repository.get(ctx.jid),
        categories = new Map();
      for (const item of manager.getGroupFeatures(ctx.jid)) {
        const state = item.enabled
          ? (item.botAdminRequired && !actor.botAdmin) ||
            item.dependencies?.some((id) => !manager.isEnabled(ctx.jid, id))
            ? '⚠️'
            : '🟢'
          : '🔴';
        const lines = categories.get(item.category) || [];
        lines.push(`${state} ${item.name} (${item.id})${item.mode ? ' • ' + item.mode : ''}`);
        categories.set(item.category, lines);
      }
      const sections = [
        `👥 Grupo: ${group}\n🤖 Bot: ${policy.bot ? '🟢 ativo' : '🔴 pausado'}\n🟢 ativado • 🔴 desativado\n⚠️ requer administrador/permissão`,
      ];
      for (const [category, lines] of categories)
        sections.push(`*${category.toUpperCase()}*\n${lines.join('\n')}`);
      sections.push(
        `⚙️ ${p}ativar RECURSO\n⚙️ ${p}desativar RECURSO\n⚙️ ${p}ativar tudo — funções seguras\n⚙️ ${p}desativar tudo — funções opcionais\n📊 ${p}ativacoes status\n👑 ${p}ativacoes delegar SETOR on/off\n👥 ${p}ativacoes SETOR membros/adm/dono\n🤖 ${p}ativacoes bot on/off`,
        '🐾 As permissões dos comandos continuam obrigatórias. A proteção obrigatória contra abuso de comandos não é desligada.',
      );
      return reply(frameMenu('🐺 ATIVAÇÕES DA ALCATEIA', sections));
    } catch (error) {
      require('../utils/helpers').logger.warn(
        { code: error.code || 'ACTIVATION', reason: error.message },
        'Alteração de ativação recusada.',
      );
      return reply(
        `🌹 ⚠️ ${/SQLITE|database|JSON|Configuração de ativação/.test(error.message) ? 'Não consegui salvar/carregar a configuração. Tente novamente; o estado anterior foi preservado.' : error.message}\nUse ${p}ativacoes. 🐺`,
      );
    }
  };
}
module.exports = { createActivationHandler, activations: createActivationHandler() };
