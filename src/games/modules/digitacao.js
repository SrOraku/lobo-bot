'use strict';
const { mono } = require('../../ui/text');
module.exports={id:'digitacao',title:'⌨️ DIGITAÇÃO',description:'Digite uma frase com precisão',start(){return {text:'a matilha respeita a floresta',started:Date.now()};},view:s=>`⌨️ *Digite exatamente:*\n${mono(s.text)}\n> _Limite:_ ${mono('60 segundos')}`,advance(s,input){const expired=Date.now()-s.started>60000,won=!expired&&input===s.text;return {state:s,text:expired?'⌛ _Tempo esgotado._':won?'🏆 *Digitação correta!*':'🐺 _Confira cada palavra da frase._',finished:expired||won,won,points:won?25:0};}};
