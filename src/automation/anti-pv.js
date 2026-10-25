'use strict';
function createAntiPV(api,{now=Date.now}={}){
 const db=api.db,key='antipv';
 const read=()=>{const row=db.prepare('SELECT value FROM expansion_settings WHERE key=?').get(key);return row?JSON.parse(row.value):{mode:0,whitelist:[]};};
 function save(value){db.prepare('INSERT INTO expansion_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
 async function command(sock,ctx){const actor=await require('../activations/access').resolveActor(sock,ctx);if(!actor.owner)throw Error('Somente donos cadastrados podem configurar anti-PV.');const s=read(),action=ctx.args[0]||'status';if(action==='status')return `🛡️ Anti-PV: modo ${s.mode}\n0 desligado • 1 avisa e permite • 2 avisa e ignora • 3 avisa e bloqueia\nLiberados: ${s.whitelist.length}`;if(['on','off','0','1','2','3'].includes(action)){s.mode=action==='on'?2:action==='off'?0:Number(action);save(s);return `🛡️ Anti-PV salvo no modo ${s.mode}.`;}if(['liberar','remover'].includes(action)){const number=ctx.args[1];if(!/^\d{10,15}$/.test(number||''))throw Error('Informe DDI + DDD + número, somente dígitos.');s.whitelist=action==='liberar'?[...new Set([...s.whitelist,number])]:s.whitelist.filter(n=>n!==number);save(s);return '🛡️ Lista branca atualizada.';}throw Error('Use antipV status/on/off/0/1/2/3/liberar/remover.');}
 async function handle(sock,msg,{jid,sender,isGroup}){const s=read();if(isGroup||msg.key.fromMe||!s.mode)return false;const {IdentityResolver}=await import('../../addons/alcateia/src/identity.js');const actor=await new IdentityResolver(sock,'').member(sender,msg.key.remoteJidAlt);const phone=actor?.phoneNumber?.split('@')[0],owners=require('../utils/owners').ownerNumbers();if(phone&&(owners.includes(phone)||s.whitelist.includes(phone)))return false;
 // An unresolved identity is ignored, never blocked: it may be an owner's LID.
 if(!phone)return s.mode>=2;
 const prior=db.prepare("SELECT expires_at FROM persistent_cooldowns WHERE chat_jid=? AND user_jid=? AND action='antipv'").get(jid,sender);if(!prior||prior.expires_at<=now()){await sock.sendMessage(jid,{text:'Este bot atende pelos grupos. Mensagens privadas estão restritas pelo dono.'});db.prepare("INSERT INTO persistent_cooldowns VALUES(?,?,'antipv',?) ON CONFLICT(chat_jid,user_jid,action) DO UPDATE SET expires_at=excluded.expires_at").run(jid,sender,now()+86400000);if(s.mode===3)await sock.updateBlockStatus(actor.phoneNumber,'block');}return s.mode>=2;}
 return {read,command,handle};
}
module.exports={createAntiPV};
