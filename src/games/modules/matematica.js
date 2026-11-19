'use strict';
const { mono } = require('../../ui/text');
const random = require('../random');
// Cada rodada sorteia novas parcelas pela semente da partida.
function roll(s){const max=s.difficulty==='facil'?10:20;s.a=random.int(s,max)+1;s.b=random.int(s,max)+1;}
const answer=s=>s.op==='×'?s.a*s.b:s.op==='−'?s.a-s.b:s.a+s.b;
module.exports={id:'matematica',title:'🧠 DESAFIO MATEMÁTICO',description:'Resolva cinco contas em três dificuldades',start(pick,{difficulty='normal'}={}){const s={round:1,correct:0,seed:random.seed(pick),difficulty,op:difficulty==='dificil'?'×':'+'};roll(s);return s;},view:s=>`🧠 *Rodada:* ${mono(`${s.round}/5`)}\n${mono(`${s.a} ${s.op||'+'} ${s.b} = ?`)}`,advance(s,input){if(!/^-?\d{1,5}$/.test(input))throw Error('Envie a resposta numérica.');const expected=answer(s),hit=Number(input)===expected;if(hit)s.correct++;const text=hit?'✅ *Correto!*':`❌ *Resposta:* ${mono(expected)}`;s.round++;roll(s);if(s.difficulty==='dificil')s.op=s.round%2?'×':'−';return {state:s,text,finished:s.round>5,won:s.correct>=3,points:s.correct*(s.difficulty==='dificil'?12:10)};}};
