'use strict';
const { randomUUID } = require('node:crypto');
const catalog = require('./catalog');
const ROUND_MS = 120000, COOLDOWN_MS = 300000, TOURNAMENT_COOLDOWN_MS = 600000;
const MAX_DAILY_POINTS = 200;
function weekKey(at) {
 const date = new Date(at - 3 * 3600000); date.setUTCHours(0, 0, 0, 0);
 date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
 return date.toISOString().slice(0, 10);
}
function dayStart(at) { return Math.floor((at - 3 * 3600000) / 86400000) * 86400000 + 3 * 3600000; }
function createQuiz(db, { now = Date.now, pick, emit } = {}) {
 const sendEvent = emit || ((request) => require('../../missions/service').recordGameEvent(db, request));
 function identity(chat, original) {
  require('../../isolation/context').chatId(chat);
  const candidate = String(original || '').replace(/:\d+@/, '@').replace(/@c\.us$/, '@s.whatsapp.net');
  const user = db.prepare('SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=? AND user_jid=?').get(chat, candidate)?.wallet_jid || candidate;
  if (!/^\d+@s\.whatsapp\.net$/.test(user)) throw Error('Não consegui confirmar seu número para registrar esta partida. Aguarde a sincronização do WhatsApp.');
  return user;
 }
 const timestamp = () => { const at = now(); if (!Number.isSafeInteger(at) || at < 0) throw Error('Relógio inválido.'); return at; };
 const cleanName = value => String(value || 'Lobo').replace(/[\r\n*_`~]/g, ' ').trim().slice(0, 60) || 'Lobo';
 const readSolo = (chat, user) => { const row = db.prepare('SELECT state,available_at FROM quiz_plus_sessions WHERE chat_jid=? AND user_jid=?').get(chat, user); return { state: row?.state ? JSON.parse(row.state) : null, availableAt: row?.available_at || 0 }; };
 const saveSolo = (chat, user, state, available = 0) => db.prepare('INSERT INTO quiz_plus_sessions VALUES(?,?,?,?) ON CONFLICT(chat_jid,user_jid) DO UPDATE SET state=excluded.state,available_at=excluded.available_at').run(chat, user, state ? JSON.stringify(state) : null, available);
 const readTournament = chat => { const row = db.prepare('SELECT state FROM quiz_tournaments WHERE chat_jid=?').get(chat); return row ? JSON.parse(row.state) : null; };
 const saveTournament = (chat, state) => db.prepare('INSERT INTO quiz_tournaments VALUES(?,?) ON CONFLICT(chat_jid) DO UPDATE SET state=excluded.state').run(chat, JSON.stringify(state));
 function finish(chat, state, player, mode, at) {
  const prior = db.prepare('SELECT points FROM quiz_plus_results WHERE id=? AND user_jid=?').get(state.id, player.jid);
  if (prior) return prior.points;
  const earned = player.correct * catalog.DIFFICULTIES[state.difficulty].points;
  const used = db.prepare('SELECT COALESCE(SUM(points),0) points FROM quiz_plus_results WHERE chat_jid=? AND user_jid=? AND finished_at>=? AND finished_at<?').get(chat, player.jid, dayStart(at), dayStart(at) + 86400000).points;
  const points = Math.max(0, Math.min(earned, MAX_DAILY_POINTS - used));
  db.prepare('INSERT INTO quiz_plus_results VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(state.id, chat, player.jid, player.name, state.category, state.difficulty, mode, player.correct, state.deck.length, points, at, weekKey(at));
  db.prepare('INSERT INTO arcade_scores(chat_jid,user_jid,name,points,wins,played) VALUES(?,?,?,?,?,1) ON CONFLICT(chat_jid,user_jid) DO UPDATE SET name=excluded.name,points=points+excluded.points,wins=wins+excluded.wins,played=played+1').run(chat, player.jid, player.name, points, Number(player.correct >= 3));
  if (mode === 'solo' || Object.keys(player.answers).length > 0) {
   sendEvent({ chat, user: player.jid, event: `quiz:${state.id}:${player.jid}`, kind: 'quiz_complete', at, metadata: { game: 'quiz', won: player.correct >= 3, points } });
   sendEvent({ chat, user: player.jid, event: `quiz:${state.id}:${player.jid}`, kind: 'arcade_complete', at, metadata: { game: 'quiz', won: player.correct >= 3, points } });
  }
  return points;
 }
 function settleTournament(chat, state, at) {
  state.status = 'finished'; state.finishedAt = at;
  for (const player of state.members) player.points = finish(chat, state, player, 'torneio', at);
 }
 function advanceTournament(chat, state, at) {
  if (state?.status === 'lobby' && at - state.createdAt >= 1800000) { state.status = 'cancelled'; state.finishedAt = at; }
  if (state?.status !== 'active') return;
  // Deadlines are evaluated when a command reaches this group. At most five
  // rounds can elapse; every member gets a zero for an unanswered round.
  while (state.status === 'active' && at >= state.deadline) {
   state.round++;
   if (state.round >= state.deck.length) settleTournament(chat, state, at);
   else state.deadline += ROUND_MS;
  }
 }
 function mutate(chat, original, event, callback) {
  return db.transaction(() => {
   const user = identity(chat, original), at = timestamp();
   if (typeof event !== 'string' || !event || event.length > 200) throw Error('Jogada sem identificador válido.');
   if (db.prepare('SELECT 1 FROM quiz_plus_events WHERE chat_jid=? AND event_id=?').get(chat, event)) return null;
   const result = callback(user, at);
   db.prepare('INSERT INTO quiz_plus_events VALUES(?,?,?)').run(chat, event, at);
   return result;
  })();
 }
 function view(state) {
  if (!state) return { type: 'empty' };
  return structuredClone(state);
 }
 function solo(chat, original, name, action, args, event) {
  return mutate(chat, original, event, (user, at) => {
   const previous = readSolo(chat, user), state = previous.state;
   if (action === 'iniciar') {
    if (state) throw Error('Você já tem um quiz de categoria. Use quiz partida ou quiz encerrar.');
    if (at < previous.availableAt) throw Error(`Aguarde ${Math.ceil((previous.availableAt - at) / 1000)}s para um novo quiz de categoria.`);
    const category = catalog.category(args[0]), difficulty = catalog.difficulty(args[1]);
    if (args.length > 2) throw Error('Use quiz iniciar CATEGORIA DIFICULDADE.');
    const next = { id: randomUUID(), category, difficulty, deck: catalog.deck(category, difficulty, pick), round: 0, correct: 0, startedAt: at, name: cleanName(name), jid: user };
    saveSolo(chat, user, next); return { type: 'solo', state: view(next) };
   }
   if (!state) throw Error('Inicie com quiz iniciar CATEGORIA DIFICULDADE.');
   if (action === 'partida') return { type: 'solo', state: view(state) };
   if (action === 'encerrar') { saveSolo(chat, user, null, at + COOLDOWN_MS); return { type: 'cancelled' }; }
   if (action !== 'resposta' || args.length !== 2 || !/^[1-4]$/.test(args[0]) || Number(args[1]) !== state.round + 1) throw Error(`Use quiz resposta OPÇÃO ${state.round + 1}; a rodada precisa coincidir com a pergunta atual.`);
   const question = catalog.byId.get(state.deck[state.round]);
   const correct = Number(args[0]) - 1 === question.answer; if (correct) state.correct++;
   state.round++;
   const feedback = { correct, answer: question.choices[question.answer], explanation: question.explanation };
   if (state.round === state.deck.length) {
    const points = finish(chat, state, state, 'solo', at); saveSolo(chat, user, null, at + COOLDOWN_MS);
    return { type: 'solo-finished', correct: state.correct, total: state.deck.length, points, feedback };
   }
   saveSolo(chat, user, state); return { type: 'solo', state: view(state), feedback };
  });
 }
 function tournament(chat, original, name, action, args, event) {
  if (!chat.endsWith('@g.us')) throw Error('Torneios são disputados dentro de grupos.');
  return mutate(chat, original, event, (user, at) => {
   let state = readTournament(chat); advanceTournament(chat, state, at);
   if (action === 'criar') {
    if (state && ['lobby', 'active'].includes(state.status)) throw Error('Já existe um torneio neste grupo. Use quiz torneio status.');
    if (state?.finishedAt && at - state.finishedAt < TOURNAMENT_COOLDOWN_MS) throw Error('Aguarde dez minutos entre torneios do grupo.');
    const category = catalog.category(args[0]), difficulty = catalog.difficulty(args[1]);
    if (args.length > 2) throw Error('Use quiz torneio criar CATEGORIA [DIFICULDADE].');
    state = { id: randomUUID(), host: user, category, difficulty, status: 'lobby', createdAt: at, round: 0, deck: catalog.deck(category, difficulty, pick), members: [{ jid: user, name: cleanName(name), correct: 0, answers: {} }] };
   } else {
    if (!state) throw Error('Não há torneio. Use quiz torneio criar CATEGORIA.');
    if (action === 'entrar') {
     if (state.status !== 'lobby') throw Error('As inscrições já terminaram.');
     if (state.members.some(player => player.jid === user)) throw Error('Você já está inscrito neste torneio.');
     if (state.members.length >= 10) throw Error('O torneio já possui dez participantes.');
     state.members.push({ jid: user, name: cleanName(name), correct: 0, answers: {} });
    } else if (action === 'sair') {
     if (state.status !== 'lobby') throw Error('Só é possível sair antes de iniciar.');
     if (state.host === user) throw Error('O organizador pode usar quiz torneio cancelar.');
     state.members = state.members.filter(player => player.jid !== user);
    } else if (action === 'iniciar') {
     if (state.host !== user) throw Error('Somente o organizador inicia o torneio.');
     if (state.status !== 'lobby') throw Error('O torneio já iniciou ou terminou.');
     if (state.members.length < 2) throw Error('São necessários ao menos dois participantes voluntários.');
     state.status = 'active'; state.deadline = at + ROUND_MS;
    } else if (action === 'cancelar') {
     if (state.host !== user) throw Error('Somente o organizador cancela o torneio.');
     if (!['lobby', 'active'].includes(state.status)) throw Error('O torneio já terminou.');
     state.status = 'cancelled'; state.finishedAt = at;
    } else if (action === 'responder') {
     if (state.status !== 'active') throw Error('O torneio não está em andamento.');
     const player = state.members.find(member => member.jid === user);
     if (!player) throw Error('Somente jogadores inscritos podem responder.');
     if (args.length !== 2 || !/^[1-4]$/.test(args[0]) || Number(args[1]) !== state.round + 1) throw Error(`Use quiz torneio responder OPÇÃO ${state.round + 1}; confira a rodada atual.`);
     if (Object.hasOwn(player.answers, state.round)) throw Error('Você já respondeu esta rodada.');
     const correct = Number(args[0]) - 1 === catalog.byId.get(state.deck[state.round]).answer;
     player.answers[state.round] = Number(args[0]); if (correct) player.correct++;
     // Answers remain private until everyone has answered or time has run out.
     if (state.members.every(member => Object.hasOwn(member.answers, state.round))) {
      state.round++;
      if (state.round >= state.deck.length) settleTournament(chat, state, at);
      else state.deadline = at + ROUND_MS;
     }
    } else if (action !== 'status' && action !== 'ranking') throw Error('Use quiz torneio criar/entrar/iniciar/responder/status/ranking/sair/cancelar.');
   }
   saveTournament(chat, state); return { type: 'tournament', state: view(state) };
  });
 }
 function ranking(chat, category) {
  require('../../isolation/context').chatId(chat);
  const filter = category ? catalog.category(category) : null;
  return db.prepare(`SELECT user_jid,MAX(name) name,SUM(points) points,SUM(correct) correct,COUNT(*) played FROM quiz_plus_results WHERE chat_jid=? AND week=?${filter ? ' AND category=?' : ''} GROUP BY user_jid ORDER BY points DESC,correct DESC,user_jid LIMIT 10`).all(...[chat, weekKey(timestamp()), ...(filter ? [filter] : [])]);
 }
 function history(chat, original, page = 1) {
  const user = identity(chat, original); if (!Number.isSafeInteger(page) || page < 1 || page > 100) throw Error('Página inválida: use 1 a 100.');
  return db.prepare('SELECT category,difficulty,mode,correct,total,points,finished_at FROM quiz_plus_results WHERE chat_jid=? AND user_jid=? ORDER BY finished_at DESC,id DESC LIMIT 5 OFFSET ?').all(chat, user, (page - 1) * 5);
 }
 return { solo, tournament, ranking, history, identity };
}
module.exports = { createQuiz, weekKey, ROUND_MS, COOLDOWN_MS, MAX_DAILY_POINTS };
