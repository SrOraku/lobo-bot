'use strict';
async function groupPermissions(sock,ctx){if(!ctx.args.length)return require('./menu').menu(sock,{...ctx,args:['adm']});const[section,action]=ctx.args;
 const command=require('./security').createSecurityCommand;
 if(section==='perm'){
  const actor=await require('../activations/access').resolveActor(sock,ctx);
  if(['on','off','permitir','revogar'].includes(action)&&!actor.owner)return sock.sendMessage(ctx.jid,{text:'🛡️ Este atalho permanece exclusivo dos donos globais. Use os comandos LOBO SECURITY conforme sua confiança.'},{quoted:ctx.msg});
  if(!action||action==='status')return command('security')(sock,{...ctx,args:[]});
  if(action==='on'||action==='off'){
    const service=require('../security/groups/service').security();
    if(action==='on'&&!actor.botAdmin)return sock.sendMessage(ctx.jid,{text:'🛡️ O bot precisa ser administrador para ativar este atalho legado.'},{quoted:ctx.msg});
    await service.manager.set(ctx.jid,['antiroubo','lockname','lockdesc'],action==='on',{actor,botAdmin:actor.botAdmin});
    if(action==='on'){
      const latest=await service.permissions.context(sock,ctx.jid,ctx.sender,ctx.msg?.key?.participantAlt,{force:true});if(service.permissions.commitLevel(latest)!==5)throw Error('A autorização do dono global mudou.');
      await service.engine.operation(sock,ctx.jid,{action:'SETTINGS_CHANGE',target:'restrict',value:true},()=>sock.groupSettingUpdate(ctx.jid,'locked'));
      const policy=service.store.get(ctx.jid);service.store.put(ctx.jid,{...policy,mode:'alta',baseline:{...policy.baseline,restrict:true}});
    }
    return sock.sendMessage(ctx.jid,{text:`🛡️ Anti-Roubo, nome e descrição: ${action==='on'?'ativados em nível alto':'desativados'}. As demais proteções mantêm seus estados.`},{quoted:ctx.msg});
  }
  if(action==='permitir'||action==='revogar')return command(action==='permitir'?'trust':'untrust')(sock,{...ctx,args:ctx.args.slice(2)});
 }
 if(section==='nome'||section==='descricao')return command(section==='nome'?'setnameguard':'setdescguard')(sock,{...ctx,args:ctx.args.slice(1)});
 return sock.sendMessage(ctx.jid,{text:'🛡️ Use adm perm status/on/off/permitir/revogar ou adm nome/descricao TEXTO.'},{quoted:ctx.msg});}
module.exports={groupPermissions};
