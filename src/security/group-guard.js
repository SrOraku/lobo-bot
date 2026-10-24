'use strict';
// Compatibility API: every value now comes from LOBO SECURITY and its activation manager.
function createGuard(service){const {store,repository,manager,engine,permissions}=service;return {
 get(group){const state=store.get(group);return {enabled:manager.isEnabled(group,'antiroubo'),allowed:store.trusted(group).map(row=>row.user_jid),...state.baseline};},
 save(group,policy,actor,action){try{store.db.transaction(()=>{const state=store.get(group);store.put(group,{...state,mode:policy.enabled?'alta':state.mode,baseline:{...state.baseline,subject:policy.subject,desc:policy.desc||'',restrict:!!policy.restrict,announce:!!policy.announce}});for(const row of store.trusted(group))store.trust(group,row.user_jid,actor,false);for(const jid of policy.allowed||[])store.trust(group,jid,actor,true);repository.update(group,actor,current=>{current.features.antiroubo=!!policy.enabled;current.features.lockname=!!policy.enabled;current.features.lockdesc=!!policy.enabled;return current;});store.db.prepare('INSERT INTO security_audit(chat_jid,actor,action) VALUES(?,?,?)').run(group,actor,action);})();}catch(error){repository.invalidate(group);throw error;}},
 authorized(policy,phone){return require('../utils/owners').ownerNumbers().includes(phone?.split('@')[0])||policy.allowed.includes(phone);},
 async canManage(sock,ctx){const c=await permissions.context(sock,ctx.jid,ctx.sender,ctx.msg?.key?.participantAlt);return permissions.canAct(c,'settings').allowed;},
 enforce:(sock,update)=>engine.groups(sock,update),
 };}
let facade;const current=()=>facade||(facade=createGuard(require('./groups/service').security()));
module.exports={createGuard,get:(...a)=>current().get(...a),save:(...a)=>current().save(...a),authorized:(...a)=>current().authorized(...a),canManage:(...a)=>current().canManage(...a),enforce:(...a)=>current().enforce(...a)};
