'use strict';

const { frameMenu, frameNotice } = require('../menus/render');
const { mono, command } = require('../ui/text');

function createHandlers({ api, prefix = () => require('../config').get('PREFIX'), service } = {}) {
  const get = () => service || require('../wolves/strategies').createStrategies(api || require('../utils/database'));
  const send = (sock, ctx, title, lines) => sock.sendMessage(ctx.jid, { text: frameMenu(title, lines) }, { quoted: ctx.msg });
  const distribution = value => `🗡️ Ataque: ${mono(value.attack)} • 🛡️ Defesa: ${mono(value.defense)} • 🔄 Contra: ${mono(value.counter)}`;
  const detail = value => [`🗡️ *Força ofensiva:* ${mono(value.offense.toFixed(1))}`, `🛡️ *Resistência:* ${mono(value.resistance.toFixed(1))}`,
    `🔄 *Base de contra-ataque:* ${mono(value.counter)}`, `*Pontos fortes:* ${value.strengths.join(' ')}`, `*Vulnerabilidades:* ${value.weaknesses.join(' ')}`];
  async function safe(sock, ctx, run) {
    try { return await run(); }
    catch (error) { return sock.sendMessage(ctx.jid, { text: frameNotice('⚠️ ESTRATÉGIAS', [error.code ? 'Não consegui concluir a operação; o estado anterior foi preservado.' : error.message]) }, { quoted: ctx.msg }); }
  }
  return {
    strategy: old => async (sock, ctx) => {
      const action = String(ctx.args?.[0] || '').toLowerCase();
      if (!['salvar', 'usar', 'listar', 'excluir'].includes(action)) return old(sock, ctx);
      return safe(sock, ctx, async () => {
        const args = ctx.args || [], s = get(), p = prefix();
        if (action === 'listar') {
          if (args.length !== 1) throw Error(`Use ${p}estrategia listar.`);
          const rows = s.list(ctx.jid, ctx.sender);
          return send(sock, ctx, '🐺 FORMAÇÕES SALVAS', rows.length ? rows.map(row => `*${row.name}*\n${distribution(row)}`)
            .concat([`Até ${mono(20)} formações por jogador neste chat.`, `▸ ${command(p + 'estrategia usar NOME')}`]) : [`Nenhuma formação salva neste chat.`, `▸ ${command(p + 'estrategia salvar NOME')}`]);
        }
        if (args.length < 2) throw Error(`Use ${p}estrategia ${action} NOME.`);
        const result = s[{ salvar: 'save', usar: 'use', excluir: 'remove' }[action]](ctx.jid, ctx.sender, args.slice(1).join(' '), ctx.msg?.key?.id);
        return send(sock, ctx, '🐺 FORMAÇÃO ' + { salvar: 'SALVA', usar: 'EQUIPADA', excluir: 'EXCLUÍDA' }[action],
          [`*Nome:* ${result.name}`, ...(result.strategy ? [distribution(result.strategy)] : []),
            result.duplicate ? 'Esta mensagem já havia sido aplicada; nenhuma alteração foi repetida.' : action === 'usar' ? 'Lobos vivos, saldo e estatísticas foram preservados.' : 'Salva somente para seu jogador neste chat.']);
      });
    },
    simulate: (sock, ctx) => safe(sock, ctx, async () => {
      const args = ctx.args || [];
      let target = null;
      if (args.length === 3 && args.every(value => /^\d{1,3}$/.test(value))) target = { attack: Number(args[0]), defense: Number(args[1]), counter: Number(args[2]) };
      else if (args.length) {
        if (args.some(value => value.startsWith('@'))) throw Error('Use uma formação de treinamento ou uma das suas formações salvas; o simulador não consulta adversários.');
        target = args.join(' ');
      }
      const value = get().simulate(ctx.jid, ctx.sender, target), result = value.result;
      return send(sock, ctx, '🌕 SIMULAÇÃO DE BATALHA', [
        `*Sua formação:* ${distribution(value.own.strategy)}\n*Lobos vivos:* ${mono(value.own.wolves)}`,
        `*Treinamento:* ${value.target.name}\n${distribution(value.target.strategy)} • ${mono(100)} lobos`,
        ...detail(value.metrics), `*Resultado sorteado:* ${result.winner === 'attacker' ? 'vitória da sua formação' : result.winner === 'defender' ? 'vitória da formação de treinamento' : 'empate'}.`,
        `*Lobos após simulação:* você ${mono(result.atkWolvesAfter)} • treinamento ${mono(result.defWolvesAfter)}`,
        'A mesma fórmula e a variação aleatória do combate real são utilizadas. Cada execução pode variar.',
        'Nenhum saldo, HP, lobo vivo, cooldown ou resultado oficial é alterado. Não há consulta de estratégias de outros jogadores.',
        `▸ ${command(prefix() + 'simularbatalha 40 35 25')} • ${command(prefix() + 'simularbatalha NOME_SALVO')}`,
      ]);
    }),
    tactics: (sock, ctx) => safe(sock, ctx, async () => {
      if (ctx.args?.length) throw Error(`Use ${prefix()}taticas.`);
      const value = get().tactics(ctx.jid, ctx.sender);
      return send(sock, ctx, '🐺 TÁTICAS DA MATILHA', [distribution(value.strategy), ...detail(value),
        'Ataque efetivo = ataque + 30% do contra. Resistência = defesa + 50% do contra.',
        'O dano também depende dos lobos vivos e da formação de treinamento; nenhuma distribuição garante vitória.',
        `▸ ${command(prefix() + 'estrategia salvar NOME')} • ${command(prefix() + 'simularbatalha')}`]);
    }),
    history: (sock, ctx) => safe(sock, ctx, async () => {
      if (ctx.args?.length > 1 || (ctx.args?.[0] && !/^\d+$/.test(ctx.args[0]))) throw Error(`Use ${prefix()}historicolobos [página].`);
      const value = get().history(ctx.jid, ctx.sender, Number(ctx.args?.[0] || 1));
      return send(sock, ctx, '📜 HISTÓRICO DOS LOBOS', value.rows.map(row =>
        `${mono(row.id)} • *${row.role}: ${row.outcome}*\n${row.at} • Lobos: ${mono(row.wolvesBefore)} → ${mono(row.wolvesAfter)}`)
        .concat([`Página ${mono(value.page)} de ${mono(value.pages)} • ${mono(value.total)} batalhas neste chat.`, 'O histórico mostra apenas suas batalhas; não revela formações adversárias.']));
    }),
  };
}

function register(r, registry) {
  const handlers = createHandlers(), previous = registry.get('estrategia');
  if (!previous) throw Error('O comando estrategia original deve ser registrado antes das formações salvas.');
  r({ ...previous, replace: true, description: 'Ver estratégia e gerenciar formações salvas', usage: '!estrategia [salvar|usar|listar|excluir] [NOME]', handler: handlers.strategy(previous.handler) });
  for (const [name, handler, description, usage] of [
    ['simularbatalha', handlers.simulate, 'Simular sua formação sem alterar o combate oficial', '[ataque defesa contra|NOME_SALVO]'],
    ['taticas', handlers.tactics, 'Forças e vulnerabilidades da sua formação', ''],
    ['historicolobos', handlers.history, 'Suas batalhas neste chat, com paginação', '[página]'],
  ]) r({ name, handler, category: 'alcateia', description, usage: '!' + name + (usage ? ' ' + usage : ''), cooldown: 2, rateLimit: { max: 10, window: 60000 } });
}

module.exports = { createHandlers, register };
