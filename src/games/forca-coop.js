'use strict';
const {randomUUID,randomInt}=require('node:crypto');
const engine=require('./engine');
const {canonicalArcadeUser,recordArcadeResult}=require('./history');
const {mono}=require('../ui/text');

function createCoopForca(db,{now=Date.now,pick=randomInt}={}){
 const read=chat=>{const row=db.prepare("SELECT * FROM phase1_arcade_coop WHERE chat_jid=? AND game='forca'").get(chat);return row?{...row,state:row.state?JSON.parse(row.state):null}:null;};
 const save=(chat,state,available=0)=>db.prepare("INSERT INTO phase1_arcade_coop VALUES(?,'forca',?,?) ON CONFLICT(chat_jid,game) DO UPDATE SET state=excluded.state,available_at=excluded.available_at").run(chat,state?JSON.stringify(state):null,available);
 const play=db.transaction(({chat,user,name='Lobo',args=[],event,prefix='!',admin=false})=>{
  if(!chat.endsWith('@g.us'))throw Error('A forca cooperativa funciona em grupos.');
  user=canonicalArcadeUser(db,chat,user);
  if(!/^\d+@s\.whatsapp\.net$/.test(user))throw Error('Telefone do jogador não confirmado.');
  if(!event)throw Error('Não foi possível identificar esta jogada.');
  if(db.prepare('SELECT 1 FROM arcade_events WHERE chat_jid=? AND event_id=?').get(chat,event))return null;
  const row=read(chat),s=row?.state;
  let state=s&&s.ends>now()?s:null;
  const action=engine.normalize(args[0]||'status');
  let text;
  if(action==='iniciar'){
   if(state)throw Error('Já há uma forca cooperativa ativa. Use entrar ou status.');
   if(row?.available_at>now())throw Error('Aguarde um minuto para iniciar outra rodada.');
   const options=engine.startOptions('forca','iniciar '+args.slice(1).join(' '));
   state={id:randomUUID(),leader:user,members:[user],names:{[user]:name},contributors:{},participants:{},cooldowns:{},game:engine.start('forca',pick,options),ends:now()+20*60000};
   state.game._startedAt=now();text='🤝 Forca cooperativa iniciada. Companheiros podem entrar voluntariamente com '+prefix+'forca cooperativa entrar.';
  } else {
   if(!state)throw Error('Não há rodada cooperativa ativa. Use '+prefix+'forca cooperativa iniciar [tema] [dificuldade].');
   if(action==='entrar'){
    if(state.members.includes(user))throw Error('Você já participa desta rodada.');
    if(state.members.length>=10)throw Error('Esta rodada já tem dez participantes.');
    state.members.push(user);state.names[user]=name;text='🐾 Você entrou na rodada. Uma letra por ação; todos compartilham os erros.';
   } else if(action==='parar'){
    if(state.leader!==user&&!admin)throw Error('Somente quem iniciou ou um administrador pode encerrar.');
    save(chat,null,now()+60000);text='🌙 Rodada cooperativa encerrada sem recompensas.';state=null;
   } else if(action==='status')text='🤝 *Equipe:* '+state.members.length+'/10 • *Contribuíram:* '+Object.keys(state.contributors).length;
   else {
    if(!state.members.includes(user))throw Error('Entre voluntariamente com '+prefix+'forca cooperativa entrar.');
    if(state.cooldowns[user]>now())throw Error('Aguarde dois segundos antes da próxima letra.');
    const previous=state.game.letters.length,result=engine.advance('forca',state.game,args.join(' '));
    state.game=result.state;state.cooldowns[user]=now()+2000;
    state.participants||={};if(/^[a-z]$/.test(action))state.participants[user]=true;
    if(state.game.letters.length>previous&&action!=='pista'&&require('./content').WORDS[state.game.word][0].includes(action))state.contributors[user]=true;
    text=result.text;
    if(result.finished){
     const winners=result.won?state.members.filter(member=>state.contributors[member]):[];
     for(const member of state.members.filter(member=>state.participants?.[member])){
      const won=winners.includes(member),points=won?20:0;
      const resultEvent='forca-coop:'+state.id;
      if(recordArcadeResult(db,{chat,user:member,event:resultEvent,name:state.names[member],game:'forca',points,won,state:state.game,at:now()})){
       db.prepare('INSERT INTO arcade_scores VALUES(?,?,?,?,?,1) ON CONFLICT(chat_jid,user_jid) DO UPDATE SET name=excluded.name,points=points+excluded.points,wins=wins+excluded.wins,played=played+1').run(chat,member,state.names[member],points,Number(won));
       require('../missions/service').recordGameEvent(db,{chat,user:member,event:resultEvent,kind:'arcade_complete',at:now(),metadata:{game:'forca',won,points}});
      }
     }
     text+='\n'+(result.won?'⭐ +20 pontos para cada participante que acertou ao menos uma letra.':'Sem prêmio nesta rodada.')+'\n_Pontos de jogos; não movimentam WoK coin._';
     save(chat,null,now()+60000);state=null;
    }
   }
  }
  if(state)save(chat,state);
  db.prepare('INSERT INTO arcade_events VALUES(?,?,?)').run(chat,event,now());
  return text+(state?'\n'+engine.view('forca',state.game,prefix).replaceAll(prefix+'forca ',prefix+'forca cooperativa ')+'\n⏳ *Fim da rodada:* '+mono(new Date(state.ends).toISOString()):'');
 });
 return {play,read};
}
module.exports={createCoopForca};
