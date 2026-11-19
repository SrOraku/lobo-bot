'use strict';
const { mono } = require('../../ui/text');
const random = require('../random');
// Peça nova numa casa vazia sorteada: 90% vale 2 e 10% vale 4, como no jogo original.
function add(state) {
  const empty = state.board.flatMap((value, index) => (value ? [] : [index]));
  if (!empty.length) return;
  state.board[empty[random.int(state, empty.length)]] = random.next(state) < 0.1 ? 4 : 2;
}
module.exports={id:'2048',title:'🔢 2048',description:'Combine blocos até 2048, sem apostas',start(pick){const state={board:Array(16).fill(0),score:0,seed:random.seed(pick)};add(state);add(state);return state;},view:s=>[0,4,8,12].map(i=>mono(s.board.slice(i,i+4).map(n=>n||'·').join(' '))).join('\n')+'\n> _Cima / baixo / esquerda / direita_',advance(s,input){if(!['cima','baixo','esquerda','direita'].includes(input))throw Error('Use cima, baixo, esquerda ou direita.');const original=[...s.board];for(let i=0;i<4;i++){let indexes=Array.from({length:4},(_,j)=>['cima','baixo'].includes(input)?j*4+i:i*4+j);if(['baixo','direita'].includes(input))indexes.reverse();const row=indexes.map(n=>s.board[n]).filter(Boolean),merged=[];for(let k=0;k<row.length;k++){if(row[k]===row[k+1]){merged.push(row[k]*2);s.score+=row[k]*2;k++;}else merged.push(row[k]);}indexes.forEach((n,k)=>{s.board[n]=merged[k]||0;});}if(original.every((n,i)=>n===s.board[i]))throw Error('Essa direção não move nenhum bloco.');add(s);const won=s.board.includes(2048),available=s.board.includes(0)||s.board.some((n,i)=>(i%4<3&&s.board[i+1]===n)||(i<12&&s.board[i+4]===n));return {state:s,text:`🔢 *Pontos:* ${mono(s.score)}`,finished:won||!available,won,points:Math.min(200,Math.floor(s.score/10))};}};
