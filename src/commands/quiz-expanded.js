'use strict';
const { frameMenu, frameNotice, clean } = require('../menus/render');
const { mono, command } = require('../ui/text');
const catalog = require('../games/quiz/catalog');
const { createQuiz } = require('../games/quiz/service');
const ACTIONS = new Set(['categorias', 'iniciar', 'resposta', 'partida', 'encerrar', 'torneio', 'ranking', 'historico']);

function questionLines(state, prefix, tournament = false) {
 const question = catalog.byId.get(state.deck[state.round]);
 const action = tournament ? 'quiz torneio responder' : 'quiz resposta';
 return [`🧠 *${catalog.CATEGORIES[state.category]} • ${catalog.DIFFICULTIES[state.difficulty].name}*`,
  `*Rodada:* ${mono(`${state.round + 1}/${state.deck.length}`)}`, question.text,
  ...question.choices.map((choice, index) => `${mono(index + 1)} ${choice}`),
  `> ${command(`${prefix}${action} OPÇÃO ${state.round + 1}`)}`];
}
function renderResult(result, prefix, now = Date.now()) {
 if (!result) return null;
 if (result.type === 'cancelled') return frameNotice('🌙 QUIZ ENCERRADO', ['A partida de categoria foi encerrada sem recompensa. O quiz original continua disponível.']);
 if (result.type === 'solo-finished') return frameMenu('🏆 QUIZ CONCLUÍDO', [
  `${result.feedback.correct ? '✅ Acertou!' : '❌ Resposta: ' + result.feedback.answer}\n${result.feedback.explanation}`,
  `*Acertos:* ${mono(`${result.correct}/${result.total}`)} • *Pontos de jogos:* ${mono('+' + result.points)}`,
  'Limite dos quizzes de categoria e torneios: 200 pontos de jogos por dia. Pontos não são WoK coin.',
  `> ${command(`${prefix}quiz ranking`)} • ${command(`${prefix}quiz historico`)}`,
 ]);
 if (result.type === 'solo') return frameMenu('🧠 QUIZ POR CATEGORIA', [
  ...(result.feedback ? [`${result.feedback.correct ? '✅ Acertou!' : '❌ Resposta: ' + result.feedback.answer}\n${result.feedback.explanation}`] : []),
  ...questionLines(result.state, prefix), `*Acertos até agora:* ${mono(result.state.correct)}`,
  `> Retomar: ${command(`${prefix}quiz partida`)} • Encerrar: ${command(`${prefix}quiz encerrar`)}`,
 ]);
 const state = result.state;
 if (state.status === 'lobby') return frameMenu('🐺 TORNEIO • INSCRIÇÕES', [
  `*Categoria:* ${catalog.CATEGORIES[state.category]} • *Dificuldade:* ${catalog.DIFFICULTIES[state.difficulty].name}`,
  `*Participantes:* ${mono(`${state.members.length}/10`)}\n${state.members.map(player => '🐾 ' + clean(player.name)).join('\n')}`,
  'Cada jogador entra voluntariamente. O organizador inicia quando houver ao menos dois jogadores. Inscrições expiram em 30 minutos.',
  command(`${prefix}quiz torneio entrar`), command(`${prefix}quiz torneio iniciar`), command(`${prefix}quiz torneio sair`), command(`${prefix}quiz torneio cancelar`),
 ]);
 if (state.status === 'cancelled') return frameNotice('🌙 TORNEIO ENCERRADO', ['O torneio foi cancelado ou as inscrições expiraram. Nenhuma recompensa foi paga.']);
 if (state.status === 'finished') return frameMenu('🏆 RESULTADO DO TORNEIO', [
  ...[...state.members].sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name)).map((player, index) => `${mono(index + 1)} *${clean(player.name)}* — ${mono(`${player.correct}/5`)} • +${mono(player.points)} pontos`),
  'Pontos de jogos limitados a 200 por jogador/dia nestes quizzes; sem WoK coin ou apostas.',
  `> Campeonato semanal: ${command(`${prefix}quiz ranking ${state.category}`)}`,
 ]);
 return frameMenu('⚔️ TORNEIO EM ANDAMENTO', [
  ...questionLines(state, prefix, true),
  `*Prazo:* ${mono(Math.max(0, Math.ceil((state.deadline - now) / 1000)) + 's')} • *Respostas:* ${mono(state.members.filter(player => Object.hasOwn(player.answers, state.round)).length + '/' + state.members.length)}`,
  'Cada participante responde uma vez. A rodada avança quando todos responderem ou o prazo de dois minutos vencer. O prazo é conferido ao receber um comando.',
  `> ${command(`${prefix}quiz torneio status`)}`,
 ]);
}

function createExpandedQuizHandler({ legacy, service, prefix = () => require('../config').get('PREFIX'), now = Date.now } = {}) {
 return async (sock, ctx) => {
  const args = (ctx.args || []).map(String), action = catalog.normalize(args[0]);
  if (!ACTIONS.has(action) || action === 'iniciar' && args.length === 1) return legacy(sock, ctx);
  const p = prefix(), reply = text => sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg });
  const quiz = service || createQuiz(require('../utils/database').db);
  try {
   if (action === 'categorias') return reply(frameMenu('🧠 CATEGORIAS DO QUIZ', [
    ...Object.entries(catalog.CATEGORIES).map(([id, name]) => `${name}: ${command(`${p}quiz iniciar ${id} medio`)}`),
    'Dificuldades: facil, medio e dificil. São cinco perguntas por partida, com 10/15/20 pontos por acerto. Intervalo de cinco minutos entre quizzes de categoria.',
    `${command(`${p}quiz`)} mantém a partida original. ${command(`${p}quiz partida`)} retoma a partida por categoria.`,
    command(`${p}quiz torneio criar ciencia medio`), command(`${p}quiz ranking`), command(`${p}quiz historico`),
   ]));
   if (action === 'ranking') {
    if (args.length > 2) throw Error('Use quiz ranking [CATEGORIA].');
    const rows = quiz.ranking(ctx.jid, args[1]);
    return reply(frameMenu('🏆 CAMPEONATO SEMANAL DO QUIZ', [
     'Semana: segunda-feira, 00h de Brasília, até a próxima segunda. Rankings próprios; não apagam o placar geral.',
     ...(rows.length ? rows.map((row, index) => `${mono(index + 1)} *${clean(row.name)}* — ${mono(row.points)} pontos • ${mono(row.correct)} acertos • ${mono(row.played)} partidas`) : ['Ainda não há resultados nesta categoria/semana.']),
    ]));
   }
   if (action === 'historico') {
    if (args.length > 2) throw Error('Use quiz historico [PÁGINA].');
    const rows = quiz.history(ctx.jid, ctx.sender, args[1] === undefined ? 1 : Number(args[1]));
    return reply(frameMenu('📜 HISTÓRICO DO QUIZ', rows.length ? rows.map(row => `${new Date(row.finished_at).toISOString().slice(0, 16)} UTC • ${catalog.CATEGORIES[row.category]} • ${catalog.DIFFICULTIES[row.difficulty].name}\n${row.mode} • ${row.correct}/${row.total} • +${row.points} pontos`) : ['Nenhum resultado nesta página.']));
   }
   const event = ctx.msg?.key?.id;
   const result = action === 'torneio'
    ? quiz.tournament(ctx.jid, ctx.sender, ctx.pushName, catalog.normalize(args[1] || 'status'), args.slice(2), event)
    : quiz.solo(ctx.jid, ctx.sender, ctx.pushName, action, args.slice(1), event);
   const text = renderResult(result, p, now()); if (text) return reply(text);
  } catch (error) {
   if (error.code || error instanceof SyntaxError) throw error;
   return reply(frameNotice('⚠️ QUIZ', [error.message]));
  }
 };
}
function register(registerCommand, registry) {
 const previous = registry.get('quiz');
 if (!previous) throw Error('O quiz original precisa ser registrado antes da expansão.');
 registerCommand({ ...previous, replace: true, description: 'Quiz original, categorias e torneios cooperativos', usage: '!quiz [categorias|iniciar CATEGORIA DIFICULDADE|torneio|ranking|historico]', handler: createExpandedQuizHandler({ legacy: previous.handler }) });
}
module.exports = { createExpandedQuizHandler, renderResult, register };
