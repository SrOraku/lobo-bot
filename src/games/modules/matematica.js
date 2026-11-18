'use strict';
const { mono } = require('../../ui/text');
const random = require('../random');
// Cada rodada sorteia novas parcelas pela semente da partida.
function roll(s){s.a=random.int(s,20)+1;s.b=random.int(s,20)+1;}
module.exports={id:'matematica',title:'🧠 DESAFIO MATEMÁTICO',description:'Resolva cinco contas',start(pick){const s={round:1,correct:0,seed:random.seed(pick)};roll(s);return s;},view:s=>`🧠 *Rodada:* ${mono(`${s.round}/5`)}\n${mono(`${s.a} + ${s.b} = ?`)}`,advance(s,input){if(!/^\d{1,4}$/.test(input))throw Error('Envie a resposta numérica.');const hit=Number(input)===s.a+s.b;if(hit)s.correct++;const text=hit?'✅ *Correto!*':`❌ *Resposta:* ${mono(s.a+s.b)}`;s.round++;roll(s);return {state:s,text,finished:s.round>5,won:s.correct>=3,points:s.correct*10};}};
