'use strict';
const words=['alcateia','floresta','amizade','coragem','matilha','territorio'];
module.exports={id:'anagrama',title:'🧩 ANAGRAMA',description:'Reorganize as letras',start(pick){const word=words[pick(words.length)];return {word,scrambled:word.slice(1)+word[0],attempts:0};},view:s=>`${s.scrambled.toUpperCase()} • tentativas ${s.attempts}/5`,advance(s,input){s.attempts++;const won=input===s.word;return {state:s,text:won?'🏆 Palavra descoberta!':'🐾 Tente outra combinação.',finished:won||s.attempts>=5,won,points:won?30:0};}};
