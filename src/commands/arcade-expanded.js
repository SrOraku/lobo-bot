'use strict';
const {frameMenu,frameNotice,clean}=require('../menus/render');
const {mono,command}=require('../ui/text');
const {createHistory,canonicalArcadeUser}=require('../games/history');
const {WORD_THEMES}=require('../games/content');
const ALL_GAMES=new Set(['quiz','forca','adivinhar','aventura','akinator','gartic',...require('../games/registry').keys()]);

function createExpandedArcade({api=()=>require('../utils/database'),prefix=()=>require('../config').get('PREFIX')}={}){
 const repository=()=>typeof api==='function'?api():api;
 async function handle(name,sock,ctx){
  const reply=text=>sock.sendMessage(ctx.jid,{text},{quoted:ctx.msg});
  try{
   const db=repository().db,p=prefix(),args=[...(ctx.args||[])],kind=String(args[0]||'').toLowerCase();
   if(name==='forca'){
    if(kind==='temas'){await reply(frameMenu('🧩 TEMAS DA FORCA',[
     ...Object.entries(WORD_THEMES).map(([theme,ids])=>`${theme} • ${ids.length} palavras`),
     command(p+'forca iniciar [tema] [facil/normal/dificil]'),
     'Fácil: 8 erros / 25 pontos • normal: 6 / 30 • difícil: 4 / 40.',
     'Pista: uma vez após dois erros; revela uma letra e reduz 10 pontos.',
     command(p+'forca cooperativa iniciar [tema] [dificuldade]'),
     'Cooperativa: até dez participantes voluntários, 20 minutos, +20 pontos por contribuinte que acertou letras na vitória.',
    ]));return true;}
    if(kind!=='cooperativa'&&kind!=='coop')return false;
    let admin=false;
    if(String(args[1]).toLowerCase()==='parar'){
     const actor=await require('../activations/access').resolveActor(sock,ctx);admin=Boolean(actor.owner||actor.admin);
    }
    const text=require('../games/forca-coop').createCoopForca(db).play({chat:ctx.jid,user:ctx.sender,name:clean(ctx.pushName||'Lobo'),args:args.slice(1),event:ctx.msg?.key?.id,prefix:p,admin});
    if(text)await reply(frameMenu('🤝 FORCA COOPERATIVA',[text]));
    return true;
   }
   if(name==='aventura'){
    if(kind==='capitulos'){
     await reply(frameMenu('🏕️ TRILHAS DA LUA',[
      'Clássica: as três trilhas e oito finais originais continuam disponíveis.',command(p+'aventura iniciar classica'),
      'O Farol de Cristal: três capítulos com rotas, objetos, condições de passagem e três finais de vitória.',command(p+'aventura iniciar cristais'),
      command(p+'aventura inventario')+' • objetos e decisões da jornada em andamento.',
     ]));return true;
    }
    if(kind==='inventario'){
     const user=canonicalArcadeUser(db,ctx.jid,ctx.sender),row=db.prepare("SELECT state FROM arcade_sessions WHERE chat_jid=? AND user_jid=? AND game='aventura'").get(ctx.jid,user),state=row?.state?JSON.parse(row.state):null;
     await reply(frameMenu('🎒 INVENTÁRIO DA AVENTURA',state?[`*Campanha:* ${state.campaign||'clássica'}`,`*Local:* ${state.node}`,`*Objetos:* ${state.inventory?.join(', ')||'nenhum'}`,`*Decisões:* ${Object.keys(state.flags||{}).join(', ')||'nenhuma'}`]:['Nenhuma jornada em andamento. Use '+command(p+'aventura iniciar cristais')+'.']));return true;
    }
    return false;
   }
   const game=args[0]&&!/^\d+$/.test(args[0])?args.shift().toLowerCase():null;
   if(game&&!ALL_GAMES.has(game))throw Error('Jogo inválido. Consulte '+p+'menu jogos.');
   const history=createHistory(db);
   if(name==='historicojogos'){
    if(args.length>1)throw Error('Use historicojogos [jogo] [página].');
    const page=args[0]===undefined?1:Number(args[0]),result=history.list(ctx.jid,ctx.sender,{game,page});
    await reply(frameMenu('📜 HISTÓRICO DOS JOGOS',[
     `*Página:* ${result.page}/${result.pages} • *Resultados:* ${result.total}`,
     ...result.rows.map(row=>`${mono(new Date(row.at).toISOString())} • *${row.game}*\n${row.won?'🏆 Vitória':'🌙 Concluído'} • ${row.points} pontos • ${row.moves} ações`),
     ...(result.total?[]:['Os resultados concluídos a partir desta atualização serão registrados aqui.']),
     command(p+'historicojogos [jogo] [página]'),
    ]));return true;
   }
   if(args.length)throw Error('Use recordes [jogo].');
   const records=history.records(ctx.jid,ctx.sender,game);
   await reply(frameMenu('🏅 RECORDES DA MATILHA',records.length?records.map(row=>`*${row.game}* • ${row.played} partidas • ${row.wins} vitórias\n⭐ Melhor prêmio: ${row.best_points} pontos${row.best_score===null?'':' • Melhor placar: '+row.best_score}${row.fastest_ms===null?'':' • Vitória mais rápida: '+Math.ceil(row.fastest_ms/1000)+'s'}`):['Conclua um minijogo para registrar seu primeiro recorde.']));return true;
  }catch(error){await reply(frameNotice('⚠️ JOGADA INVÁLIDA',[error.code||error instanceof SyntaxError?'Não consegui carregar ou salvar essa jogada.':error.message]));return true;}
 }
 return {handle};
}

function register(r,registry){
 const commands=createExpandedArcade();
 for(const name of ['historicojogos','recordes'])r({name,category:'jogos',description:name==='recordes'?'Recordes pessoais por jogo':'Resultados pessoais persistentes por jogo',usage:'!'+name+(name==='recordes'?' [jogo]':' [jogo] [página]'),handler:(sock,ctx)=>commands.handle(name,sock,ctx)});
 for(const name of ['forca','aventura']){
  const previous=registry.get(name);if(!previous)continue;
  r({...previous,replace:true,handler:async(sock,ctx)=>await commands.handle(name,sock,ctx)||previous.handler(sock,ctx)});
 }
}
module.exports={createExpandedArcade,register};
