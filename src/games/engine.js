'use strict';
const { randomInt } = require('node:crypto');
const { WORDS, WORD_THEMES, QUIZ, ROUTES, ENDINGS } = require('./content');
const { QUESTIONS, CHARACTERS, nextQuestion } = require('./characters');
const { mono, progress, command, numericText } = require('../ui/text');
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function startOptions(game,input='') {
  const args=normalize(input).split(/\s+/).slice(1);
  if(game==='forca'){
    if(args.length>2)throw Error('Use forca iniciar [tema] [facil/normal/dificil].');
    const difficulty=['facil','normal','dificil'].includes(args[0])?args.shift():args[1]||'normal';
    const theme=args[0]||'todos';
    if(!Object.hasOwn(WORD_THEMES,theme)||!['facil','normal','dificil'].includes(difficulty))throw Error('Tema ou dificuldade inválida. Use forca temas.');
    return {theme,difficulty};
  }
  if(game==='aventura'){
    if(args.length>1||args[0]&&!['classica','cristais'].includes(args[0]))throw Error('Use aventura iniciar [classica/cristais].');
    return {campaign:args[0]||'classica'};
  }
  if(args.length>1||args[0]&&!['facil','normal','dificil'].includes(args[0]))throw Error('Use iniciar [facil/normal/dificil].');
  return {difficulty:args[0]||'normal'};
}
function start(game, pick = randomInt, options={}) {
  if(require('./registry').has(game))return require('./registry').get(game).start(pick,options);
  if (game === 'akinator') return { candidates: CHARACTERS.map((_, i) => i), asked: [] };
  if (game === 'forca') {
    const theme=options.theme||'todos';
    if(!Object.hasOwn(WORD_THEMES,theme))throw Error('Tema de forca inválido.');
    const pool=WORD_THEMES[theme];
    const difficulty=options.difficulty||'normal';
    if(!['facil','normal','dificil'].includes(difficulty))throw Error('Dificuldade de forca inválida.');
    return { word: pool[pick(pool.length)], letters: [], mistakes: 0,theme:options.theme||'todos',difficulty,maxMistakes:({facil:8,normal:6,dificil:4})[difficulty]||6,pistasUsed:0 };
  }
  if (game === 'adivinhar') return { secret: pick(100) + 1, attempts: 0, low: 1, high: 100 };
  if (game === 'aventura') return options.campaign==='cristais'?require('./adventure-expansion').start():{ node: 'inicio', moves: 0 };
  if (game === 'quiz') {
    const deck = Array.from({ length: QUIZ.length }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) { const j = pick(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    return { deck: deck.slice(0, 5), round: 0, correct: 0 };
  }
  throw Error('Jogo não encontrado.');
}
function view(game, state, prefix) {
  if(require('./registry').has(game))return require('./registry').get(game).view(state)+`\n> ▸ ${command(`${prefix}${game} resposta`)}`;
  if (game === 'akinator') {
    if (state.candidates.length === 1 || nextQuestion(state) === -1)
      return `🔮 *Minha hipótese:* ${state.candidates.map(i => CHARACTERS[i][0]).join(', ')}\n_Acertei o personagem da sua trilha?_\n> ▸ ${command(`${prefix}akinator sim/não`)}`;
    return `🔮 _Pense em um dos ${mono(CHARACTERS.length)} personagens do catálogo:_\n${CHARACTERS.map(c => c[0]).join(', ')}\n*${QUESTIONS[nextQuestion(state)][1]}*\n> ▸ ${command(`${prefix}akinator sim/não/talvez`)}`;
  }
  if (game === 'forca') {
    const [word, hint] = WORDS[state.word];
    const max=state.maxMistakes||6;
    return `🧩 _${hint}_\n${mono([...word].map(c => state.letters.includes(c) ? c.toUpperCase() : '＿').join(' '))}\n*Tema:* ${state.theme||'clássico'} • *Dificuldade:* ${state.difficulty||'normal'}\n❤️ *Erros:* ${mono(`${state.mistakes}/${max}`)}\n${progress(state.mistakes, max)}\n*Letras:* ${mono(state.letters.join(', ') || 'nenhuma')}\n> ▸ ${command(`${prefix}forca letra`)}\n> ▸ ${command(`${prefix}forca pista`)} _uma vez após dois erros; reduz 10 pontos._`;
  }
  if (game === 'adivinhar') return `🎯 _Siga as pistas da matilha._\n*Intervalo:* ${mono(state.low)} a ${mono(state.high)}\n*Tentativas:* ${mono(`${state.attempts}/7`)}\n${progress(state.attempts, 7)}\n> ▸ ${command(`${prefix}adivinhar número`)}`;
  if (game === 'quiz') {
    const [question, choices] = QUIZ[state.deck[state.round]];
    return `🧠 *Rodada:* ${mono(`${state.round + 1}/5`)}\n*Acertos:* ${mono(state.correct)} ${progress(state.correct, 5)}\n${numericText(question)}\n${choices.map((c, i) => `▸ ${mono(i + 1)} ${numericText(c)}`).join('\n')}\n> ▸ ${command(`${prefix}quiz 1/2/3/4`)}`;
  }
  if(game==='aventura'&&state.campaign==='cristais')return require('./adventure-expansion').view(state,prefix);
  const [scene, choices] = ROUTES[state.node];
  return `🏕️ _${scene}_\n${choices.map((c, i) => `▸ ${mono(i + 1)} ${c}`).join('\n')}\n> ▸ ${command(`${prefix}aventura 1/2/3`)}`;
}
function advance(game, original, input,options={}) {
  const state = structuredClone(original), value = normalize(input);
  if(require('./registry').has(game))return require('./registry').get(game).advance(state,value,options);
  const done = (text, points, won) => ({ state, text, points, won, finished: true });
  if (game === 'akinator') {
    if (!['sim', 'nao', 'talvez'].includes(value)) throw Error('Responda sim, não ou talvez.');
    const question = nextQuestion(state);
    if (state.candidates.length === 1 || question === -1)
      return done(value === 'sim' ? '🎯 *Hipótese confirmada!*\n_A matilha encontrou seu personagem._' : '🔮 _A trilha terminou sem uma hipótese certa. Tente um personagem do catálogo._', value === 'sim' ? 10 : 0, value === 'sim');
    state.asked.push(question);
    if (value !== 'talvez') state.candidates = state.candidates.filter(i => CHARACTERS[i][1].includes(QUESTIONS[question][0]) === (value === 'sim'));
    if (!state.candidates.length) return done('🔮 _Nenhum personagem do catálogo corresponde às respostas._', 0, false);
    return { state, text: `🔮 *Hipóteses restantes:* ${mono(state.candidates.length)}` };
  }
  if (game === 'forca') {
    const word = WORDS[state.word][0];
    if(value==='pista'){
      if(state.pistasUsed||state.mistakes<2)throw Error('A pista pode ser usada uma vez, depois de dois erros.');
      const letter=[...word].find(c=>!state.letters.includes(c));
      if(letter)state.letters.push(letter);
      state.pistasUsed=1;
    } else {
      if (!/^[a-z]$/.test(value)) throw Error('Informe uma única letra.');
      if (state.letters.includes(value)) throw Error('Essa letra já foi usada.');
      state.letters.push(value);
      if (!word.includes(value)) state.mistakes++;
    }
    const points=({facil:25,normal:30,dificil:40})[state.difficulty||'normal']-(state.pistasUsed?10:0);
    if ([...word].every(c => state.letters.includes(c))) return done(`🏆 *Palavra descoberta!*\n${mono(word.toUpperCase())}`, points, true);
    if (state.mistakes >= (state.maxMistakes||6)) return done(`🌘 _A trilha da palavra chegou ao fim._\n*Resposta:* ${mono(word.toUpperCase())}`, 0, false);
    if(value==='pista')return {state,text:'💡 Uma letra foi revelada. O prêmio desta rodada foi reduzido em 10 pontos.'};
    return { state, text: word.includes(value) ? '✅ _A matilha encontrou uma letra!_' : '💨 _Essa letra não deixou rastros._' };
  }
  if (game === 'adivinhar') {
    if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 100) throw Error('Informe um inteiro entre 1 e 100.');
    const number = Number(value);
    if (number < state.low || number > state.high) throw Error(`Use as pistas: entre ${mono(state.low)} e ${mono(state.high)}.`);
    state.attempts++;
    if (number === state.secret) return done(`🏆 *Acertou!*\n*Tentativas:* ${mono(state.attempts)}`, 40 - state.attempts * 3, true);
    if (state.attempts >= 7) return done(`🌘 _As tentativas chegaram ao fim._\n*Número secreto:* ${mono(state.secret)}`, 0, false);
    if (number < state.secret) state.low = number + 1; else state.high = number - 1;
    return { state, text: number < state.secret ? '⬆️ _Siga acima: o número é maior!_' : '⬇️ _Siga abaixo: o número é menor!_' };
  }
  if(game==='aventura'&&state.campaign==='cristais')return require('./adventure-expansion').advance(state,value);
  const max = game === 'quiz' ? 4 : 3;
  if (!/^[1-4]$/.test(value) || Number(value) > max) throw Error(`Escolha uma opção entre ${mono(1)} e ${mono(max)}.`);
  const choice = Number(value) - 1;
  if (game === 'quiz') {
    const [, choices, answer, explanation] = QUIZ[state.deck[state.round]];
    const correct = choice === answer;
    if (correct) state.correct++;
    const text = `${correct ? '✅ *Acertou!*' : '❌ *Resposta:* ' + numericText(choices[answer]) + '.'}\n_${numericText(explanation)}_`;
    state.round++;
    if (state.round === state.deck.length) return done(`${text}\n🏁 *Acertos:* ${mono(`${state.correct}/5`)}\n${progress(state.correct, 5)}`, state.correct * 10, state.correct >= 3);
    return { state, text };
  }
  state.moves++;
  state.node = ROUTES[state.node][2][choice];
  if (ENDINGS[state.node]) { const [text, points, won] = ENDINGS[state.node]; return done(`_${text}_`, points, won); }
  return { state, text: '🐺 _A jornada da matilha continua..._' };
}
module.exports = { start, view, advance, normalize, startOptions };
