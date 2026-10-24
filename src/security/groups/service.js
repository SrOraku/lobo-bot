'use strict';
function createSecurity({db,activationStore,owners,botAdmin,now=Date.now,capturePicture,identityFactory}={}){
 const store=require('./store').createSecurityStore(db,{now}),repository=activationStore||require('../../activations/store').createPolicyStore(db);
 let engine;const manager=require('../../activations/manager').createManager(repository,{security:()=>engine});
 const permissions=require('./permissions').createPermissions({store,manager,owners,botAdmin,now,identityFactory});
 engine=require('./engine').createSecurityEngine({store,manager,permissions,now,capturePicture});
 async function performParticipants(sock,ctx,targets,action){
  const c=await permissions.context(sock,ctx.jid,ctx.sender,ctx.msg?.key?.participantAlt,{force:true});
  if(!c.bot.isAdmin)throw Error('O bot não possui permissão de administrador.');
  if(store.get(ctx.jid).pausedUntil>now()&&c.actor.level<5)throw Error('Ações de participantes pausadas por segurança.');
  for(const id of targets){const target=await c.identify(id),decision=permissions.canAct(c,action,target);if(action!=='add'&&!target.inGroup)throw Error('O participante não está mais no grupo.');if(!decision.allowed)throw Error('Ação bloqueada: '+decision.reason);}
  const flag=action==='remove'?'antimasskick':action==='promote'?'antimasspromote':null;
  if(flag&&manager.isEnabled(ctx.jid,flag)){const rule=store.get(ctx.jid)[action==='remove'?'masskick':'masspromote'];if(store.count(ctx.jid,c.actor.canonical,'manual_'+action,rule.windowMs,targets.length)>rule.max){store.audit(ctx.jid,{actor:c.actor.canonical,action:'COMMAND_BLOCKED',authorized:false,result:'ADMIN_ACTION_LIMIT'});throw Error('Limite de ações administrativas atingido. Aguarde a janela configurada.');}}
  const result=await engine.operation(sock,ctx.jid,{action:action.toUpperCase(),target:targets.length===1?targets[0]:null,value:null},()=>sock.groupParticipantsUpdate(ctx.jid,targets,action));
  for(const target of targets)store.audit(ctx.jid,{actor:c.actor.canonical,target,action:action.toUpperCase(),authorized:true,result:'COMMAND_APPLIED'});
  return result;
 }
 return {store,repository,manager,permissions,engine,performParticipants};
}
let current;function security(){return current||(current=createSecurity({db:require('../../utils/database').db,activationStore:require('../../activations/store').getStore()}));}
module.exports={createSecurity,security};
