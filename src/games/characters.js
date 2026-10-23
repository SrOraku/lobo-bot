'use strict';
const QUESTIONS = [
  ['real', 'Seu personagem existe ou existiu na vida real?'],
  ['sport', 'Seu personagem é conhecido pelo esporte?'],
  ['music', 'Seu personagem é conhecido pela música?'],
  ['anime', 'Seu personagem aparece em anime?'],
  ['hero', 'Seu personagem é um super-herói de quadrinhos?'],
  ['brazil', 'Seu personagem é brasileiro?'],
  ['science', 'Seu personagem é conhecido pela ciência?'],
  ['magic', 'Seu personagem usa magia?'],
  ['pirate', 'Seu personagem é um pirata?'],
  ['saiyan', 'Seu personagem é um saiyajin?'],
  ['cape', 'Seu personagem usa capa?'],
  ['guitar', 'Seu personagem é conhecido por tocar guitarra?'],
  ['argentina', 'Seu personagem é argentino?'],
  ['portugal', 'Seu personagem é português?'],
  ['ninja', 'Seu personagem é um ninja?'],
  ['orange', 'Seu personagem é conhecido por usar laranja?'],
  ['business', 'Seu personagem é conhecido por empresas de tecnologia?'],
  ['rap', 'Seu personagem é conhecido pelo rap?'],
  ['queen', 'Seu personagem foi vocalista da banda Queen?'],
  ['prince', 'Seu personagem é um príncipe?'],
  ['dark', 'Seu personagem é conhecido como Cavaleiro das Trevas?'],
];
const CHARACTERS = [
  ['Naruto Uzumaki', ['anime', 'ninja', 'orange']], ['Sasuke Uchiha', ['anime', 'ninja']],
  ['Goku', ['anime', 'saiyan', 'orange']], ['Vegeta', ['anime', 'saiyan', 'prince']],
  ['Luffy', ['anime', 'pirate']], ['Harry Potter', ['magic']],
  ['Batman', ['hero', 'cape', 'dark']], ['Superman', ['hero', 'cape']],
  ['Spider-Man', ['hero']], ['Albert Einstein', ['real', 'science']],
  ['Neymar', ['real', 'sport', 'brazil']], ['Lionel Messi', ['real', 'sport', 'argentina']],
  ['Cristiano Ronaldo', ['real', 'sport', 'portugal']], ['Michael Jackson', ['real', 'music']],
  ['Bob Marley', ['real', 'music', 'guitar']],
  ['Elon Musk', ['real', 'business']], ['Eminem', ['real', 'music', 'rap']],
  ['Freddie Mercury', ['real', 'music', 'queen']],
];
function nextQuestion(state) {
  return QUESTIONS.findIndex(([key], i) => !state.asked.includes(i) &&
    state.candidates.some(n => CHARACTERS[n][1].includes(key)) &&
    state.candidates.some(n => !CHARACTERS[n][1].includes(key)));
}
module.exports = { QUESTIONS, CHARACTERS, nextQuestion };
