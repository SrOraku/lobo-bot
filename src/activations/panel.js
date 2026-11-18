'use strict';
const { frameMenu, clean } = require('../menus/render');
const { mono, command, block, badge, progress, DIVIDER, center } = require('../ui/text');
const { createManager } = require('./manager');

function renderPanel({ repository, actor, ctx, prefix, notice }) {
  const manager = createManager(repository), policy = repository.get(ctx.jid), categories = new Map();
  const group = clean(actor.groupName || ctx.jid);
  let number = 0, enabled = 0, pending = 0;
  for (const item of manager.getGroupFeatures(ctx.jid)) {
    number++;
    let configured = true;
    try { if (item.enabled && item.isConfigured) configured = !!item.isConfigured(); }
    catch { configured = false; }
    const state = item.enabled
      ? ((item.botAdminRequired || item.security) && !actor.botAdmin) ||
        !configured ||
        item.dependencies?.some(id => !manager.isEnabled(ctx.jid, id)) ? '⚠️' : '🟢'
      : '🔴';
    const lines = categories.get(item.category) || [];
    const available = item.enabled && state === '🟢' && policy.bot && typeof item.handler === 'function';
    if (available) enabled++;
    if (item.enabled && !available) pending++;
    lines.push(`  ${mono(number)} 🛡️ *${item.name}:* ${badge(available)}${item.enabled && !available ? ' ⚠️ pendente' : ''}${item.mode ? ' • ' + mono(item.mode) : ''}\n     ▸ ${command(prefix + 'ativacoes ' + item.id)}`);
    categories.set(item.category, lines);
  }
  const sections = [
    ...(notice ? [notice] : []),
    `${center('_Segurança & Funções do Grupo_')}\n👥 *Grupo:* ${group}\n🤖 *Bot:* ${badge(policy.bot)}\n_⚠️ Pendências exigem permissão, dependência ou configuração._`,
  ];
  for (const [category, lines] of categories) sections.push(block(category.toUpperCase(), lines));
  const percent = number ? Math.round(enabled / number * 100) : 0;
  sections.push(DIVIDER, `📊 *Proteção:* ${mono(progress(enabled, number) + ' ' + percent + '%')}\n*Funções ativas:* ${mono(enabled)} / ${mono(number)} • *Pendentes:* ${mono(pending)}\n📅 *Inatividade:* ${mono(policy.options.inactivity_days)} dias.`,
    `${center('*Como configurar:*')}\n_Envie o número da função ou use o comando abaixo dela._\n_Depois escolha_ 🟢 ${mono(1)} *SIM / Confirmar* _ou_ 🔴 ${mono(2)} *NÃO / Cancelar*.\n_O painel volta atualizado para escolher outra função._\n⏳ Seleção válida por ${mono('2 minutos')}.`,
    '> 🌹 _A barra conta funções disponíveis; não garante segurança absoluta. Permissões e proteção contra abuso continuam obrigatórias._');
  return frameMenu('PAINEL DE ATIVAÇÕES', sections);
}

module.exports = { renderPanel };
