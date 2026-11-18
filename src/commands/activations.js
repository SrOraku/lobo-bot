'use strict';
const config = require('../config');
const { frameMenu, clean } = require('../menus/render');
const { mono, command, badge } = require('../ui/text');
const { renderPanel } = require('../activations/panel');
const response = require('../core/response');
const registry = require('../activations/registry');
const { change } = require('../activations/policy');
const { createManager } = require('../activations/manager');
function createActivationHandler({
  store,
  resolveActor,
  forcedAction,
  featureId,
  interaction,
} = {}) {
  return async (sock, ctx) => {
    const p = config.get('PREFIX'),
      reply = (text) => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
    if (!ctx.jid?.endsWith('@g.us'))
      return reply(response.warn('Apenas em grupos', '_Use este painel dentro do grupo que deseja configurar._'));
    const actor = await (resolveActor || require('../activations/access').resolveActor)(sock, ctx);
    if (!actor.owner && !actor.admin && (actor.securityLevel||0)<2)
      return reply(response.warn('Sem permissão', '_Somente o dono e os administradores do grupo podem abrir este painel._'));
    const repository = store || require('../activations/store').getStore(),
      manager = createManager(repository,store?{}:{security:()=>require('../security/groups/service').security().engine});
    const interactiveReply = async text => {
      const sent = await reply(text);
      (interaction || require('../activations/interaction').interaction()).attachPanel?.(ctx, sent?.key);
      return sent;
    };
    const args = (ctx.args || []).map(String),
      group = clean(actor.groupName || ctx.jid);
    try {
      if (!forcedAction && !featureId && args[0]?.toLowerCase() === 'historico') {
        if (args.length !== 1) throw Error('Use apenas historico.');
        const rows = repository.history(ctx.jid);
        return reply(frameMenu('📜 HISTÓRICO DE ATIVAÇÕES', rows.length ? rows.map(row =>
          `${mono(row.created_at)} • *${clean(row.feature)}*: ${mono(clean(row.previous_state))} → ${mono(clean(row.new_state))}`) : ['Nenhuma alteração registrada neste grupo.']));
      }
      if (!forcedAction && !featureId && args[0]?.toLowerCase() === 'diagnostico') {
        if (args.length > 2 || (args[1] && args[1].toLowerCase() !== 'completo')) throw Error('Use diagnostico ou diagnostico completo.');
        if (args[1] && !actor.owner) throw Error('Diagnóstico completo é exclusivo do dono.');
        const items = manager.diagnostics(ctx.jid, actor);
        return reply(frameMenu('🛡️ DIAGNÓSTICO DE ATIVAÇÕES', [
          `👥 *Grupo:* ${group}`,
          ...items.map(item => `${item.issues.length ? '⚠️' : item.enabled ? '✅' : '❌'} ${item.name}${item.issues.length ? ' — ' + item.issues.join(', ') : ''}`),
          ...(args[1] ? [`*Registry:* ${mono(items.length)} recursos; setores informativos excluídos.`, 'Cache carregado; alterações usam transação SQLite.'] : []),
        ]));
      }
      if (featureId && args.length === 1 && args[0].toLowerCase() === 'status') {
        const item = manager.diagnostics(ctx.jid, actor).find(f => f.id === registry.feature(featureId)?.id);
        return reply(frameMenu('🐺 ESTADO DA FUNÇÃO', [`*${item.name}:* ${badge(item.enabled && !item.issues.length)}`, ...item.issues.map(issue => '⚠️ ' + issue)]));
      }
      if (!forcedAction && !featureId && args.length === 1 && registry.feature(args[0])?.source !== 'sector' && registry.feature(args[0])) {
        const feature = registry.feature(args[0]);
        const text = (interaction || require('../activations/interaction').interaction()).requestFeature(ctx, feature.id, manager.isEnabled(ctx.jid, feature.id));
        return interactiveReply(require('../menus/render').frameNotice('🌹 CONFIRMAÇÃO DA FUNÇÃO 🐺', [text]));
      }
      let result;
      if(forcedAction&&args[0]?.toLowerCase()==='antipv')return reply('🛡️ *Anti-PV global*\n_Exclusivo do dono._\n> Use '+command(p+'antipv status')+' no privado; o WhatsApp não informa conversas privadas entre membros de um grupo.');
      if (forcedAction || featureId) {
        let name = featureId || args.shift(),
          value;
        if (forcedAction) value = forcedAction === 'enable';
        else if (!args.length) value = !manager.isEnabled(ctx.jid, name);
        else if (['on', '1', 'off', '0', '2'].includes(args[0]?.toLowerCase()))
          value = ['on', '1'].includes(args.shift().toLowerCase());
        else if (['antilink', 'antilinkgrupo', 'antilinkexterno'].includes(registry.feature(name)?.id) && ['delete', 'warn', 'kick'].includes(args[0])) value = true;
        else if (name === 'antiinatividade' && /^\d+$/.test(args[0])) value = true;
        else throw Error('Use on/off, 1 para SIM ou 2 para NÃO (0 continua compatível).');
        const options = {};
        if (['antilink', 'antilinkgrupo', 'antilinkexterno'].includes(registry.feature(name)?.id) && ['delete', 'warn', 'kick'].includes(args[0]))
          options[(registry.feature(name)?.id || name) + '_mode'] = args.shift();
        if (name === 'antiinatividade' && /^\d+$/.test(args[0])) {
          options.inactivity_days = Number(args.shift());
          if (options.inactivity_days < 1 || options.inactivity_days > 90)
            throw Error('Informe entre 1 e 90 dias.');
        }
        if (args.length) throw Error('Argumentos extras inválidos.');
        if (registry.feature(name)?.id === 'antiinatividade' && value && !Object.hasOwn(options, 'inactivity_days')) {
          (interaction || require('../activations/interaction').interaction()).requestDays(ctx, manager.isEnabled(ctx.jid, 'antiinatividade'));
          return interactiveReply(require('../menus/render').frameNotice('📅 PRAZO DE INATIVIDADE', ['Digite somente o número de dias, de `1` a `90`.', 'Exemplo: `15`.', '> A função será ativada após salvar o prazo. Responda em até `2 minutos`.']));
        }
        const context = { actor, botAdmin: actor.botAdmin, options };
        result =
          String(name).toLowerCase() === 'tudo'
            ? await manager.bulk(ctx.jid, value, context)
            : await manager.set(ctx.jid, [name], value, context);
        if (!result.changed.length && !Object.keys(options).length)
          return reply(
            response.warn('Estado preservado', `${result.unchanged[0]?.name || 'As funções'} já ${value ? 'está ativado' : 'está desativado'} neste grupo.`),
          );
        return reply(
          frameMenu('🐺 ATIVAÇÃO', [
            `${value ? '🟢 Função ativada' : '🔴 Função desativada'}\n⚙️ *Recurso:* ${[...result.changed, ...result.unchanged].map((f) => f.name).join(', ')}${['antilink', 'antilinkgrupo', 'antilinkexterno'].some(id => registry.feature(name)?.id === id) ? `\n🛡️ Ação: ${mono(result.policy.options[registry.feature(name).id + '_mode'] || 'delete')} (warn: ${mono(5)} advertências; delete: somente apagar)` : ''}\n👥 *Grupo:* ${group}\n> Configuração salva somente neste grupo.`,
          ]),
        );
      }
      if (args.length && args[0].toLowerCase() !== 'status') {
        const delegating = args[0].toLowerCase() === 'delegar';
        if (args.length !== (delegating ? 3 : 2)) throw Error('Quantidade de argumentos inválida.');
        const f = registry.feature(args[0]);
        if (f && f.source !== 'sector' && !delegating) {
          const mode = args[1].toLowerCase();
          if (!['on', 'off', '1', '0', '2'].includes(mode)) throw Error('Use on/off, 1 para SIM ou 2 para NÃO (0 continua compatível).');
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
      const ui = interaction || require('../activations/interaction').interaction();
      ui.open(ctx);
      const sent = await reply(renderPanel({ repository, actor, ctx, prefix: p }));
      ui.attachPanel?.(ctx, sent?.key);
      return sent;
    } catch (error) {
      require('../utils/helpers').logger.warn(
        { code: error.code || 'ACTIVATION', reason: error.message },
        'Alteração de ativação recusada.',
      );
      return reply(
        response.error('Configuração não concluída', `${/SQLITE|database|JSON|Configuração de ativação/.test(error.message) ? 'Não consegui salvar/carregar a configuração. Tente novamente; o estado anterior foi preservado.' : error.message}`, `Use ${command(p + 'ativacoes')}.`),
      );
    }
  };
}
module.exports = { createActivationHandler, activations: createActivationHandler() };
