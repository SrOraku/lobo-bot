'use strict';
const { mono, progress } = require('../../ui/text');
const { shuffle } = require('../random');
const words=['alcateia','floresta','amizade','coragem','matilha','territorio','lobisomem','guardiao','sombra','trilha','noturno','lealdade','instinto','fogueira','neblina','cristal','ancestral','rugido','pegadas','vigilia','penhasco','relampago','santuario','cacador','montanha','caverna','eclipse','tempestade'];
// Embaralha de verdade (Fisher–Yates) e garante que o resultado não seja a própria palavra.
function scramble(word,pick){let out=word;for(let tries=0;tries<10&&out===word;tries++)out=shuffle([...word],pick).join('');return out===word?word.slice(1)+word[0]:out;}
module.exports={id:'anagrama',title:'🧩 ANAGRAMA',description:'Reorganize as letras',words,start(pick){const word=words[pick(words.length)];return {word,scrambled:scramble(word,pick),attempts:0};},view:s=>`🧩 ${mono(s.scrambled.toUpperCase())}\n*Tentativas:* ${mono(`${s.attempts}/5`)}\n${progress(s.attempts, 5)}`,advance(s,input){s.attempts++;const won=input===s.word;return {state:s,text:won?'🏆 *Palavra descoberta!*':'🐺 _Procure outra combinação na trilha._',finished:won||s.attempts>=5,won,points:won?30:0};}};
