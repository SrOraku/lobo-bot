'use strict';
const { mono } = require('../../ui/text');
const random = require('../random');
// Cada rodada sorteia novos números pela semente da partida.
function roll(s){s.a=random.int(s,20)+1;s.b=random.int(s,20)+1;}
module.exports={id:'batalhanumeros',title:'⚔️ BATALHA DE NÚMEROS',description:'Escolha a maior expressão, sem apostas',start(pick){const s={round:1,correct:0,seed:random.seed(pick)};roll(s);return s;},view:s=>`⚔️ *Rodada:* ${mono(`${s.round}/5`)}\n▸ ${mono(1)} ${mono(`${s.a} × 3`)}\n▸ ${mono(2)} ${mono(`${s.b} × 2`)}\n_Qual resultado é maior?_\n> _Escolha:_ ${mono('1/2/empate')}`,advance(s,input){if(!['1','2','empate'].includes(input))throw Error('Use `1`, `2` ou `empate`.');const expected=s.a*3===s.b*2?'empate':s.a*3>s.b*2?'1':'2',hit=input===expected;if(hit)s.correct++;s.round++;roll(s);return {state:s,text:hit?'✅ *Acertou!*':`❌ *Resposta:* ${mono(expected)}.`,finished:s.round>5,won:s.correct>=3,points:s.correct*10};}};
