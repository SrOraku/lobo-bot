'use strict';
const { mono, progress } = require('../../ui/text');
const words=['alcateia','floresta','amizade','coragem','matilha','territorio'];
module.exports={id:'anagrama',title:'🧩 ANAGRAMA',description:'Reorganize as letras',start(pick){const word=words[pick(words.length)];return {word,scrambled:word.slice(1)+word[0],attempts:0};},view:s=>`🧩 ${mono(s.scrambled.toUpperCase())}\n*Tentativas:* ${mono(`${s.attempts}/5`)}\n${progress(s.attempts, 5)}`,advance(s,input){s.attempts++;const won=input===s.word;return {state:s,text:won?'🏆 *Palavra descoberta!*':'🐺 _Procure outra combinação na trilha._',finished:won||s.attempts>=5,won,points:won?30:0};}};
