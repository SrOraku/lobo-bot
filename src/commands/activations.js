'use strict';
const config = require('../config');
const { frameMenu, clean } = require('../menus/render');
const { mono, command, block, badge, progress, DIVIDER, center } = require('../ui/text');
const response = require('../core/response');
const registry = require('../activations/registry');
const { change } = require('../activations/policy');
const { createManager } = require('../activations/manager');
function createActivationHandler({
  store,
  resolveActor,
  forcedAction,
  featureId,
  legacyToggle = false,
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
        return reply(require('../menus/render').frameNotice('🌹 CONFIRMAÇÃO DA FUNÇÃO 🐺', [text]));
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
          return reply(require('../menus/render').frameNotice('📅 PRAZO DE INATIVIDADE', ['Digite somente o número de dias, de `1` a `90`.', 'Exemplo: `15`.', '> A função será ativada após salvar o prazo. Responda em até `2 minutos`.']));
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
      const policy = repository.get(ctx.jid),
        categories = new Map();
      let number = 0, enabled = 0, pending = 0;
      for (const item of manager.getGroupFeatures(ctx.jid)) {
        number++;
        const state = item.enabled
          ? ((item.botAdminRequired || item.security) && !actor.botAdmin) ||
            (item.isConfigured && !item.isConfigured()) ||
            item.dependencies?.some((id) => !manager.isEnabled(ctx.jid, id))
            ? '⚠️'
            : '🟢'
          : '🔴';
        const lines = categories.get(item.category) || [];
        const available = item.enabled && state === '🟢' && policy.bot && typeof item.handler === 'function';
        if (available) enabled++;
        if (item.enabled && !available) pending++;
        lines.push(`  ${mono(number)} 🛡️ *${item.name}:* ${badge(available)}${item.enabled && !available ? ' ⚠️ pendente' : ''}${item.mode ? ' • ' + mono(item.mode) : ''}\n     ▸ ${command(p + 'ativacoes ' + item.id)}`);
        categories.set(item.category, lines);
      }
      const sections = [
        `${center('_Segurança & Funções do Grupo_')}\n👥 *Grupo:* ${group}\n🤖 *Bot:* ${badge(policy.bot)}\n_⚠️ Pendências exigem permissão, dependência ou configuração._`,
      ];
      for (const [category, lines] of categories)
        sections.push(block(category.toUpperCase(), lines));
      const percent = number ? Math.round(enabled / number * 100) : 0;
      sections.push(DIVIDER, `📊 *Proteção:* ${mono(progress(enabled, number) + ' ' + percent + '%')}\n*Funções ativas:* ${mono(enabled)} / ${mono(number)} • *Pendentes:* ${mono(pending)}\n📅 *Inatividade:* ${mono(policy.options.inactivity_days)} dias.`,
        `${center('*Como configurar:*')}\n_Envie o número da função ou use o comando abaixo dela._\n🟢 Digite ${mono(1)} para *SIM / Confirmar*\n🔴 Digite ${mono(2)} para *NÃO / Cancelar*\n⏳ Confirmação válida por ${mono('2 minutos')}.`,
        '> 🌹 _A barra conta funções disponíveis; não garante segurança absoluta. Permissões e proteção contra abuso continuam obrigatórias._');
      (interaction || require('../activations/interaction').interaction()).open(ctx);
      return reply(frameMenu('PAINEL DE ATIVAÇÕES', sections));
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
