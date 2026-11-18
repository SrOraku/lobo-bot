'use strict';
const { mono } = require('../../ui/text');
const { shuffle } = require('../random');
const WORDS=['LOBO','LUA','ROSA','UIVO','TOCA','FARO','PRESA','GARRA','NOITE','TRILHA','MATILHA','SOMBRA','LUAR','PELO','CACA','ALCATEIA','FLORESTA','CAVERNA','NEBLINA','CRISTAL'];
const SIZE=8,COUNT=4;
// Horizontal, vertical e as duas diagonais, nos dois sentidos (inclusive invertida).
const DIRECTIONS=[[0,1],[1,0],[1,1],[-1,1],[0,-1],[-1,0],[-1,-1],[1,-1]];
function place(grid,word,pick){
 const fits=(r,c,[dr,dc])=>[...word].every((ch,k)=>{const y=r+dr*k,x=c+dc*k;return y>=0&&y<SIZE&&x>=0&&x<SIZE&&(grid[y][x]===''||grid[y][x]===ch);});
 const write=(r,c,[dr,dc])=>[...word].forEach((ch,k)=>{grid[r+dr*k][c+dc*k]=ch;});
 for(let t=0;t<60;t++){const d=DIRECTIONS[pick(DIRECTIONS.length)],r=pick(SIZE),c=pick(SIZE);if(fits(r,c,d)){write(r,c,d);return true;}}
 // Sorteio sem sorte (ou tabuleiro apertado): varre todas as posições a partir de um ponto sorteado.
 const total=SIZE*SIZE*DIRECTIONS.length,offset=pick(total);
 for(let n=0;n<total;n++){const i=(n+offset)%total,d=DIRECTIONS[i%DIRECTIONS.length],cell=Math.floor(i/DIRECTIONS.length);if(fits(Math.floor(cell/SIZE),cell%SIZE,d)){write(Math.floor(cell/SIZE),cell%SIZE,d);return true;}}
 return false;
}
function generate(pick){
 const grid=Array.from({length:SIZE},()=>Array(SIZE).fill('')),words=[];
 for(const word of shuffle(WORDS,pick)){if(words.length>=COUNT)break;if(place(grid,word,pick))words.push(word);}
 for(const row of grid)for(let c=0;c<SIZE;c++)if(!row[c])row[c]=String.fromCharCode(65+pick(26));
 return {words,rows:grid.map(row=>row.join(''))};
}
module.exports={id:'cacapalavras',title:'🔎 CAÇA-PALAVRAS',description:'Encontre palavras no tabuleiro',WORDS,DIRECTIONS,SIZE,start(pick){return {...generate(pick),found:[]};},view:s=>s.rows.map(r=>mono(r.split('').join(' '))).join('\n')+`\n*Palavras:* ${s.words.map(w=>s.found.includes(w)?`~${w}~ ✓`:w).join(' • ')}\n> _Faltam ${mono(s.words.length-s.found.length)}. Vale na horizontal, vertical, diagonal e de trás para frente._`,advance(s,input){const word=input.toUpperCase();if(!s.words.includes(word)||s.found.includes(word))throw Error('Palavra não encontrada ou já utilizada.');s.found.push(word);const won=s.found.length===s.words.length;return {state:s,text:'✅ *Palavra encontrada!*',finished:won,won,points:won?30:0};}};
