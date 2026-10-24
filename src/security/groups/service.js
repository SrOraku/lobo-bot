'use strict';
function createSecurity({db,activationStore,owners,botAdmin,now=Date.now,capturePicture,identityFactory,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const store=require('./store').createSecurityStore(db,{now}),repository=activationStore||require('../../activations/store').createPolicyStore(db);
 let engine;const manager=require('../../activations/manager').createManager(repository,{security:()=>engine});
 const permissions=require('./permissions').createPermissions({store,manager,owners,botAdmin,now,identityFactory});
 engine=require('./engine').createSecurityEngine({store,manager,permissions,now,capturePicture});
 async function performParticipants(sock,ctx,targets,action){
  const {validateParticipantResults,participantError}=require('./participant-results');
  if(!['add','remove','promote','demote'].includes(action)||!Array.isArray(targets)||!targets.length||targets.length>100)throw participantError('INVALID_PARTICIPANTS','Ação ou participantes inválidos.');
  const c=await permissions.context(sock,ctx.jid,ctx.sender,ctx.msg?.key?.participantAlt,{force:true});
  if(!c.bot.isAdmin)throw participantError('BOT_ADMIN_REQUIRED','O bot precisa ser administrador do grupo para remover participantes.');
  if(!c.actor.inGroup&&!c.actor.globalOwner)throw participantError('ACTOR_NOT_IN_GROUP','Remetente não confirmado como participante deste grupo.');
  if(store.get(ctx.jid).pausedUntil>now()&&c.actor.level<5)throw participantError('SECURITY_PAUSED','Ações de participantes pausadas por segurança.');
  const resolved=[];
  for(const id of targets){const target=await c.identify(id),decision=permissions.canAct(c,action,target);if(action!=='add'&&!target.inGroup)throw participantError('TARGET_NOT_IN_GROUP','O participante não está mais no grupo.');if(!decision.allowed)throw participantError('ACTION_DENIED','Ação bloqueada: '+decision.reason);if(!resolved.some(item=>item.jid===target.jid))resolved.push(target);}
  const flag=action==='remove'?'antimasskick':action==='promote'?'antimasspromote':null;
  if(flag&&manager.isEnabled(ctx.jid,flag)){const rule=store.get(ctx.jid)[action==='remove'?'masskick':'masspromote'];if(store.count(ctx.jid,c.actor.canonical,'manual_'+action,rule.windowMs,targets.length)>rule.max){store.audit(ctx.jid,{actor:c.actor.canonical,action:'COMMAND_BLOCKED',authorized:false,result:'ADMIN_ACTION_LIMIT'});throw Error('Limite de ações administrativas atingido. Aguarde a janela configurada.');}}
  const ids=resolved.map(target=>target.jid);
  try {
   const result=await engine.operation(sock,ctx.jid,{action:action.toUpperCase(),target:ids.length===1?ids[0]:null,value:null},async()=>validateParticipantResults(await sock.groupParticipantsUpdate(ctx.jid,ids,action),resolved));
   if(action==='remove'){
    let confirmed=false;
    for(let attempt=0;attempt<3;attempt++){
     if(attempt)await wait(attempt===1?250:750);
     try{
      const meta=await permissions.fresh(sock,ctx.jid,{force:true});
      if(!Array.isArray(meta.participants)||!meta.participants.length)continue;
      const after=await permissions.context(sock,ctx.jid,ctx.sender,ctx.msg?.key?.participantAlt,{meta,force:true});
      if(!after.bot.inGroup||meta.id&&meta.id!==ctx.jid)continue;
      const remaining=await Promise.all(resolved.map(target=>after.identify(target.jid,target.phoneNumber)));
      if(remaining.every(target=>!target.inGroup)){confirmed=true;break;}
     }catch{ /* Metadata may lag or be temporarily unavailable; do not claim success. */ }
    }
    if(!confirmed)throw participantError('REMOVAL_UNCONFIRMED','O WhatsApp aceitou a solicitação, mas a saída do participante ainda não foi confirmada. Confira a lista do grupo antes de tentar novamente.');
   }
   for(const target of resolved)store.audit(ctx.jid,{actor:c.actor.canonical,target:target.canonical||target.jid,action:action.toUpperCase(),authorized:true,result:'COMMAND_APPLIED'});
   return result;
  }catch(error){
   for(const target of resolved)store.audit(ctx.jid,{actor:c.actor.canonical,target:target.canonical||target.jid,action:action.toUpperCase(),authorized:true,result:error.code||'WHATSAPP_REQUEST_FAILED'});
   throw error;
  }
 }
 return {store,repository,manager,permissions,engine,performParticipants};
}
let current;function security(){return current||(current=createSecurity({db:require('../../utils/database').db,activationStore:require('../../activations/store').getStore()}));}
module.exports={createSecurity,security};
