'use strict';
const fs=require('node:fs'),path=require('node:path');
const modules=new Map();
for(const file of fs.readdirSync(path.join(__dirname,'modules')).filter(f=>f.endsWith('.js')).sort()){
 const game=require(path.join(__dirname,'modules',file));
 if(!/^[a-z0-9]+$/.test(game.id)||modules.has(game.id)||!['start','view','advance'].every(key=>typeof game[key]==='function'))throw Error('Módulo de jogo inválido ou duplicado: '+file);
 modules.set(game.id,game);
}
module.exports=modules;
