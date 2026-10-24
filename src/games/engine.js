'use strict';
const { randomInt } = require('node:crypto');
const { WORDS, QUIZ, ROUTES, ENDINGS } = require('./content');
const { QUESTIONS, CHARACTERS, nextQuestion } = require('./characters');
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function start(game, pick = randomInt) {
  if(require('./registry').has(game))return require('./registry').get(game).start(pick);
  if (game === 'akinator') return { candidates: CHARACTERS.map((_, i) => i), asked: [] };
  if (game === 'forca') return { word: pick(WORDS.length), letters: [], mistakes: 0 };
  if (game === 'adivinhar') return { secret: pick(100) + 1, attempts: 0, low: 1, high: 100 };
  if (game === 'aventura') return { node: 'inicio', moves: 0 };
  if (game === 'quiz') {
    const deck = Array.from({ length: QUIZ.length }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) { const j = pick(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    return { deck: deck.slice(0, 5), round: 0, correct: 0 };
  }
  throw Error('Jogo não encontrado.');
}
function view(game, state, prefix) {
  if(require('./registry').has(game))return require('./registry').get(game).view(state)+`\n_${prefix}${game} resposta_`;
  if (game === 'akinator') {
    if (state.candidates.length === 1 || nextQuestion(state) === -1)
      return `🔮 Minha hipótese: ${state.candidates.map(i => CHARACTERS[i][0]).join(', ')}. Acertei?\n_${prefix}akinator sim/não_`;
    return `🔮 Pense em um dos ${CHARACTERS.length} personagens do catálogo: ${CHARACTERS.map(c => c[0]).join(', ')}.\n${QUESTIONS[nextQuestion(state)][1]}\n_${prefix}akinator sim/não/talvez_`;
  }
  if (game === 'forca') {
    const [word, hint] = WORDS[state.word];
    return `🧩 ${hint}\n${[...word].map(c => state.letters.includes(c) ? c.toUpperCase() : '＿').join(' ')}\n❤️ Erros: ${state.mistakes}/6\nLetras: ${state.letters.join(', ') || 'nenhuma'}\n_${prefix}forca letra_`;
  }
  if (game === 'adivinhar') return `🎯 Descubra o número entre ${state.low} e ${state.high}.\nTentativas: ${state.attempts}/7\n_${prefix}adivinhar número_`;
  if (game === 'quiz') {
    const [question, choices] = QUIZ[state.deck[state.round]];
    return `🧠 Rodada ${state.round + 1}/5 • Acertos: ${state.correct}\n${question}\n${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n_${prefix}quiz 1/2/3/4_`;
  }
  const [scene, choices] = ROUTES[state.node];
  return `🏕️ ${scene}\n${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n_${prefix}aventura 1/2/3_`;
}
function advance(game, original, input) {
  const state = structuredClone(original), value = normalize(input);
  if(require('./registry').has(game))return require('./registry').get(game).advance(state,value);
  const done = (text, points, won) => ({ state, text, points, won, finished: true });
  if (game === 'akinator') {
    if (!['sim', 'nao', 'talvez'].includes(value)) throw Error('Responda sim, não ou talvez.');
    const question = nextQuestion(state);
    if (state.candidates.length === 1 || question === -1)
      return done(value === 'sim' ? '🎯 Hipótese confirmada! Obrigado por jogar.' : '🔮 Não consegui identificar desta vez. Tente um personagem do catálogo.', value === 'sim' ? 10 : 0, value === 'sim');
    state.asked.push(question);
    if (value !== 'talvez') state.candidates = state.candidates.filter(i => CHARACTERS[i][1].includes(QUESTIONS[question][0]) === (value === 'sim'));
    if (!state.candidates.length) return done('🔮 Nenhum personagem do catálogo corresponde às respostas.', 0, false);
    return { state, text: `🐾 Hipóteses restantes: ${state.candidates.length}.` };
  }
  if (game === 'forca') {
    if (!/^[a-z]$/.test(value)) throw Error('Informe uma única letra.');
    if (state.letters.includes(value)) throw Error('Essa letra já foi usada.');
    state.letters.push(value);
    const word = WORDS[state.word][0];
    if (!word.includes(value)) state.mistakes++;
    if ([...word].every(c => state.letters.includes(c))) return done(`🏆 Palavra descoberta: ${word.toUpperCase()}!`, 30, true);
    if (state.mistakes >= 6) return done(`🌘 Fim da rodada. A palavra era ${word.toUpperCase()}.`, 0, false);
    return { state, text: word.includes(value) ? '✅ Letra encontrada!' : '💨 Essa letra não aparece.' };
  }
  if (game === 'adivinhar') {
    if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 100) throw Error('Informe um inteiro entre 1 e 100.');
    const number = Number(value);
    if (number < state.low || number > state.high) throw Error(`Use as pistas: entre ${state.low} e ${state.high}.`);
    state.attempts++;
    if (number === state.secret) return done(`🏆 Acertou em ${state.attempts} tentativa(s)!`, 40 - state.attempts * 3, true);
    if (state.attempts >= 7) return done(`🌘 Acabaram as tentativas. O número era ${state.secret}.`, 0, false);
    if (number < state.secret) state.low = number + 1; else state.high = number - 1;
    return { state, text: number < state.secret ? '⬆️ O número é maior!' : '⬇️ O número é menor!' };
  }
  const max = game === 'quiz' ? 4 : 3;
  if (!/^[1-4]$/.test(value) || Number(value) > max) throw Error(`Escolha uma opção entre 1 e ${max}.`);
  const choice = Number(value) - 1;
  if (game === 'quiz') {
    const [, choices, answer, explanation] = QUIZ[state.deck[state.round]];
    const correct = choice === answer;
    if (correct) state.correct++;
    const text = `${correct ? '✅ Acertou!' : '❌ Resposta: ' + choices[answer] + '.'} ${explanation}`;
    state.round++;
    if (state.round === state.deck.length) return done(`${text}\n🏁 Resultado: ${state.correct}/5 acertos.`, state.correct * 10, state.correct >= 3);
    return { state, text };
  }
  state.moves++;
  state.node = ROUTES[state.node][2][choice];
  if (ENDINGS[state.node]) { const [text, points, won] = ENDINGS[state.node]; return done(text, points, won); }
  return { state, text: '🐾 A jornada continua...' };
}
module.exports = { start, view, advance, normalize };
