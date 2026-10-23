'use strict';
const {definitions,queuedHandler}=require('./handler');
function registerBronxys(register,registry) {
 const add=def=>{def.handler.auditFile ||= 'src/integrations/bronxys/handler.js';def.handler.auditExport ||= 'createHandler';register(def);};
 const grouped=new Set(['logo','montage']);
 for(const [format,name,description]of [['logo','logos','Gerar logo: escolha um efeito e texto'],['montage','montagem','Aplicar efeito à imagem respondida']]) {
  const choices=definitions.filter(def=>def.format===format);
  const aliases=choices.map(def=>def.name).filter(alias=>!registry.has(alias));
  add({name,aliases,category:'ferramentas',description,usage:'!'+name+' efeito [texto]',cost:5,rateLimit:{max:3,window:60000},handler:(sock,ctx)=>{
   const direct=choices.find(def=>def.name===ctx.command);
   const args=[...(ctx.args||[])],def=direct||choices.find(def=>def.name===String(args.shift()||'').toLowerCase());
   if(!def)return sock.sendMessage(ctx.jid,{text:'🌹 Efeitos: '+choices.map(item=>item.name).join(', ')+' 🐺'},{quoted:ctx.msg});
   return queuedHandler(def)(sock,{...ctx,args});
  }});
 }
 for(const def of definitions) {
  if(grouped.has(def.format)||registry.has(def.name))continue;
  const aliases=def.aliases.filter(alias=>!registry.has(alias));
  add({name:def.name,aliases,category:def.category,description:def.description,usage:'!'+def.name+(def.parameter?' '+(def.parameter==='url'?'link':'texto') : ''),cost:5,rateLimit:{max:3,window:60000},handler:queuedHandler(def)});
 }
 add({name:'apibronxys',category:'dono',minLevel:3,ownerOnly:true,description:'Configurar a API Bronxys no privado',usage:'!apibronxys [status|testar|chave SUA_CHAVE]',handler:require('../../commands/bronxys-config').apiBronxys});
}
module.exports={registerBronxys};
