'use strict';
const crypto=require('node:crypto');
const {evaluate}=require('./policy');
const {FLAGS}=require('./config');
const {KeyedQueue}=require('../../core/keyed-queue');
function createSecurityEngine({store,manager,permissions,now=Date.now,capturePicture=require('./picture').capture}={}){
 const queue=new KeyedQueue({maxKeys:1000,maxPending:100});
 const flags=group=>Object.fromEntries(FLAGS.map(id=>[id,manager.isEnabled(group,id)]));
 async function prepare(group,defs,enabled,actor){
  if(!defs.some(f=>f.security))return null;
  if(!actor.owner&&(actor.securityLevel||0)<2)throw Error('Somente administradores autorizados, criador ou donos configuram LOBO SECURITY.');
  const sock=actor.securityContext?.sock,patches=new Map();let picture;
  const capture=enabled&&defs.some(f=>!manager.isEnabled(group,f.id)&&['antiroubo','lockname','lockdesc','lockpic'].includes(f.id));
  if(capture){
   if(!sock)throw Error('Metadata recente necessária para ativar esta proteção.');
   const metadata=await permissions.fresh(sock,group,{force:true});
   for(const f of defs){
    if(f.id==='antiroubo')patches.set(f.id,{subject:metadata.subject,desc:metadata.desc||'',restrict:!!metadata.restrict,announce:!!metadata.announce});
    if(f.id==='lockname')patches.set(f.id,{subject:metadata.subject});
    if(f.id==='lockdesc')patches.set(f.id,{desc:metadata.desc||''});
    if(f.id==='lockpic'&&!manager.isEnabled(group,f.id))picture=await capturePicture(sock,group);
   }
  }
  const fresh=sock?await permissions.context(sock,group,actor.jid||actor.phone,null,{force:true}):null;
  return {apply(current){
   if(fresh&&(permissions.commitLevel(fresh)<2||!fresh.actor.inGroup&&!fresh.actor.globalOwner))throw Error('Sua autorização de segurança mudou. Abra o painel novamente.');
   const next=store.get(group);
   for(const[id,patch]of patches)if(enabled&&!current.features[id]){
    const values={...patch};
    if(id==='antiroubo'){if(current.features.lockname)delete values.subject;if(current.features.lockdesc)delete values.desc;}
    Object.assign(next.baseline,values);
   }
   store.put(group,next);
   if(picture&&enabled&&!current.features.lockpic)store.savePicture(group,picture);
  }};
 }

 async function alert(sock,group,event,result,reason){const settings=store.get(group),key='alert:'+event.action;const row=store.db.prepare('SELECT seen_at FROM security_event_keys WHERE group_id=? AND event_key=?').get(group,key);if(row&&now()-row.seen_at<settings.alertCooldownMs)return;store.db.prepare('INSERT INTO security_event_keys VALUES(?,?,?) ON CONFLICT(group_id,event_key) DO UPDATE SET seen_at=excluded.seen_at').run(group,key,now());const mentions=[event.actor,event.target].filter(id=>/^\d+@(s\.whatsapp\.net|lid)$/.test(id||''));const text=require('../../menus/render').frameNotice('🚨 LOBO SECURITY',[`Ação: ${event.action}`,`Autor: ${event.actor?'@'+event.actor.split('@')[0]:'não identificado'}`,event.target?`Alvo: @${event.target.split('@')[0]}`:'',`Resultado: ${result}`,`Motivo: ${reason}`,reason==='BOT_NOT_ADMIN'?'⚠️ O bot não possui permissão para reverter.':''].filter(Boolean));try{await sock.sendMessage(group,{text,mentions});}catch(error){require('../../config/logger').logger.warn({component:'security',code:error.code||'ALERT_FAILED'},'Alerta de segurança não pôde ser enviado.');}}
 async function operation(sock,group,event,run){store.internal(group,event);try{const response=await run();if(Array.isArray(response)&&response.some(r=>r.status&&!['200','201'].includes(String(r.status))))throw Error('WHATSAPP_REFUSED');return response;}catch(error){store.db.prepare('DELETE FROM security_internal WHERE group_id=? AND fingerprint=?').run(group,store.fingerprint(event));throw error;}}
 async function process(sock,group,event){const enabled=flags(group);if(!Object.values(enabled).some(Boolean))return {result:'DISABLED'};
  const settings=store.get(group);if(event.field&&Object.hasOwn(settings.baseline,event.field)&&settings.baseline[event.field]===event.value)return {result:'UNCHANGED',allowed:true};const c=await permissions.context(sock,group,event.actor,event.actorAlt,{force:true});const actor=c.actor,target=event.target?await c.identify(event.target,event.targetAlt):null;if(target)target.protected=permissions.isProtectedUser(target);
  const key=(event.eventId?'id:':'')+crypto.createHash('sha256').update(JSON.stringify(event.eventId?[event.eventId,event.action,event.target||null]:[event.action,actor.canonical||event.actor||null,target?.canonical||event.target||null,event.value??null])).digest('hex');if(!store.dedup(group,key,event.eventId?Infinity:settings.eventDedupMs))return {result:'DUPLICATE'};
  const internal=store.consumeInternal(group,event),canonical={...event,actor:actor.canonical||null,target:target?.canonical||event.target||null};let mass=false;
  if(!actor.isBot&&!internal&&['PROMOTE','REMOVE'].includes(event.action)&&!(event.action==='REMOVE'&&actor.canonical===target?.canonical)){
    const rule=event.action==='REMOVE'?settings.masskick:settings.masspromote;
    const count=store.count(group,actor.canonical||'ACTOR_UNKNOWN',event.action,rule.windowMs);
    mass=count>=rule.max&&enabled[event.action==='REMOVE'?'antimasskick':'antimasspromote'];
  }
  const selfLeave=event.action==='REMOVE'&&actor.known&&actor.canonical===target?.canonical;
  const decision=selfLeave?{allowed:true,action:'LOG',reason:'SELF_LEAVE'}:evaluate({actor,target,action:event.action,flags:enabled,settings,mass,internal,botAdmin:!!c.bot.isAdmin});
  if(decision.allowed){if(event.action==='PICTURE_CHANGE'&&enabled.lockpic&&!internal&&!actor.isBot){try{store.savePicture(group,await capturePicture(sock,group));}catch{store.incident(group,canonical.actor,event.action,'PICTURE_CAPTURE_FAILED','BASELINE_UNCHANGED');}}if(event.field&&['subject','desc','restrict','announce'].includes(event.field)){settings.baseline[event.field]=event.value;store.put(group,settings);}store.audit(group,{actor:canonical.actor,target:canonical.target,action:event.action,newValue:event.value??null,authorized:true,result:decision.reason});if(decision.action==='WARN'){store.incident(group,canonical.actor,event.action,decision.reason,'AUTHORIZED_ACTIVITY');await alert(sock,group,canonical,'AUTHORIZED_ACTIVITY',decision.reason);}return {result:decision.reason,allowed:true};}
  if(mass&&actor.known&&actor.level<2)store.pause(group,now()+settings.pauseMs);
  let result=decision.action==='LOG'?'LOGGED':'ALERTED';const oldValue=event.field?settings.baseline[event.field]:null;
  if(decision.action==='DEMOTE_ACTOR'){try{const fresh=await permissions.context(sock,group,actor.jid,null,{force:true});if(fresh.bot.isAdmin&&fresh.actor.isAdmin&&fresh.actor.level===1&&!permissions.isProtectedUser(fresh.actor)){await operation(sock,group,{action:'DEMOTE',target:fresh.actor.jid,value:null},()=>sock.groupParticipantsUpdate(group,[fresh.actor.jid],'demote'));result='ACTOR_DEMOTED';}else result='ACTOR_NOT_ELIGIBLE';}catch{result='REVERT_FAILED';}}
  if(decision.action==='REVERT'){
    try{
      if(['PROMOTE','DEMOTE'].includes(event.action)){
        if(!target?.known||!target.inGroup)result='TARGET_UNAVAILABLE';
        else if(event.action==='PROMOTE'&&!target.isAdmin||event.action==='DEMOTE'&&target.isAdmin)result='STALE_EVENT';
        else {const action=event.action==='PROMOTE'?'demote':'promote';await operation(sock,group,{action:action.toUpperCase(),target:event.target,value:null},()=>sock.groupParticipantsUpdate(group,[target.jid],action));result='REVERTED';}
      }else if(event.action==='NAME_CHANGE'||event.action==='DESCRIPTION_CHANGE'){
        if(typeof oldValue!=='string')result='BASELINE_MISSING';
        else if(c.meta[event.field]!==event.value)result='STALE_EVENT';
        else{await operation(sock,group,{action:event.action,value:oldValue},()=>event.action==='NAME_CHANGE'?sock.groupUpdateSubject(group,oldValue):sock.groupUpdateDescription(group,oldValue));result='REVERTED';}
      }else if(event.action==='SETTINGS_CHANGE'){
        if(typeof oldValue!=='boolean')result='BASELINE_MISSING';
        else if(c.meta[event.field]!==event.value)result='STALE_EVENT';
        else{const value=event.field==='restrict'?(oldValue?'locked':'unlocked'):(oldValue?'announcement':'not_announcement');await operation(sock,group,{action:event.action,target:event.field,value:oldValue},()=>sock.groupSettingUpdate(group,value));result='REVERTED';}
      }else if(event.action==='PICTURE_CHANGE'){
        const picture=store.picture(group);if(!picture)result='BASELINE_MISSING';else if(crypto.createHash('sha256').update(picture.image).digest('hex')!==picture.sha256)result='BASELINE_CORRUPTED';else{await operation(sock,group,{action:'PICTURE_CHANGE',value:null},()=>sock.updateProfilePicture(group,picture.image));result='REVERTED';}
      }else if(event.action==='EDIT'){
        if(!event.messageKey)result='MESSAGE_UNKNOWN';else{await sock.sendMessage(group,{delete:event.messageKey});result='DELETED';}
      }
      if(decision.punish&&result==='REVERTED'&&!permissions.isProtectedUser(actor)){
        const check=await permissions.context(sock,group,actor.jid,null,{force:true});if(check.bot.isAdmin&&check.actor.isAdmin&&check.actor.level===1&&!permissions.isProtectedUser(check.actor)){await operation(sock,group,{action:'DEMOTE',target:check.actor.jid,value:null},()=>sock.groupParticipantsUpdate(group,[check.actor.jid],'demote'));store.audit(group,{actor:check.bot.canonical,target:check.actor.canonical,action:'DEMOTE',authorized:true,result:'POLICY_MODE_3'});}
      }
    }catch(error){result='REVERT_FAILED';require('../../config/logger').logger.warn({component:'security',code:error.code||'WHATSAPP_REJECTED'},'Reversão administrativa não concluída.');}
  }
  store.audit(group,{actor:canonical.actor,target:canonical.target,action:event.action,oldValue,newValue:event.value??null,authorized:false,result});store.incident(group,canonical.actor,event.action,decision.reason,result);
  if(decision.action!=='LOG')await alert(sock,group,canonical,result,decision.reason);
  return {allowed:false,result,reason:decision.reason};
 }
 return {flags,prepare,operation,auditActivation(group,id,previous,next,actor){store.audit(group,{actor:actor.phone||actor.jid,action:next?'SECURITY_ENABLE':'SECURITY_DISABLE',oldValue:{[id]:previous},newValue:{[id]:next},authorized:true,result:'SAVED'});},process:(sock,group,event)=>queue.run(group,()=>process(sock,group,event)),
  participants(sock,update){return queue.run(update.id,async()=>{permissions.invalidate(update.id);const results=[];for(const value of update.participants||[]){const target=typeof value==='string'?value:value?.id||value?.lid||value?.phoneNumber;const targetAlt=typeof value==='object'?value.phoneNumber:null;if(!target)continue;results.push(await process(sock,update.id,{action:{promote:'PROMOTE',demote:'DEMOTE',remove:'REMOVE',add:'ADD'}[update.action]||'MODIFY',actor:update.author,actorAlt:update.authorPn,target,targetAlt,eventId:update.eventId}));}return results;});},
  groups(sock,update){return queue.run(update.id,async()=>{permissions.invalidate(update.id);const results=[];for(const[field,action]of [['subject','NAME_CHANGE'],['desc','DESCRIPTION_CHANGE'],['restrict','SETTINGS_CHANGE'],['announce','SETTINGS_CHANGE']])if(Object.hasOwn(update,field))results.push(await process(sock,update.id,{action,actor:update.author||(field==='subject'?update.subjectOwner:field==='desc'?update.descOwner:null),actorAlt:update.authorPn||(field==='subject'?update.subjectOwnerPn:field==='desc'?update.descOwnerPn:null),field,target:action==='SETTINGS_CHANGE'?field:null,value:update[field]}));return results;});},
  async edits(sock,updates,load){for(const item of updates){const group=item.key?.remoteJid;if(!group?.endsWith('@g.us')||!manager.isEnabled(group,'antiedit')||!item.update?.message?.editedMessage)continue;const cached=await load?.(group,item.key.id);const key={...cached?.key,...item.key},actor=key.fromMe?sock.user?.id:key.participant;if(!actor){await this.process(sock,group,{action:'EDIT',actor:null,eventId:item.key.id+':'+String(item.update.messageTimestamp||'')});continue;}await this.process(sock,group,{action:'EDIT',actor,actorAlt:key.participantAlt,messageKey:key,eventId:item.key.id+':'+String(item.update.messageTimestamp||'')});}},
  async picture(sock,msg){const group=msg.key?.remoteJid;if(!group?.endsWith('@g.us'))return;return this.process(sock,group,{action:'PICTURE_CHANGE',actor:msg.key?.participant||msg.participant,actorAlt:msg.key?.participantAlt,value:null,eventId:msg.key?.id});},
 };
}
module.exports={createSecurityEngine};
