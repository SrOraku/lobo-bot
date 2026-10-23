'use strict';
const cache = new Map(), queues = new Map();
const db = () => require('../utils/database').db;
function get(jid) {
  if (!cache.has(jid)) {
    const row = db().prepare('SELECT enabled,policy FROM group_guard WHERE group_jid=?').get(jid);
    cache.set(jid,row ? {...JSON.parse(row.policy),enabled:!!row.enabled} : {enabled:false,allowed:[]});
  }
  return structuredClone(cache.get(jid));
}
function save(jid, policy, actor, action) {
  db().transaction(() => {
    db().prepare('INSERT INTO group_guard(group_jid,enabled,policy) VALUES (?,?,?) ON CONFLICT(group_jid) DO UPDATE SET enabled=excluded.enabled,policy=excluded.policy').run(jid,Number(policy.enabled),JSON.stringify(policy));
    db().prepare('INSERT INTO security_audit(chat_jid,actor,action) VALUES (?,?,?)').run(jid,actor,action);
  })(); cache.set(jid,structuredClone(policy));
}
function authorized(policy, phone) {
  return require('../utils/owners').ownerNumbers().includes(phone?.split('@')[0]) || policy.allowed.includes(phone);
}
async function canManage(sock, ctx) {
  const policy = get(ctx.jid); if (!policy.enabled) return true;
  const actor = await require('../activations/access').resolveActor(sock,ctx);
  return authorized(policy,actor.phone);
}
async function enforce(sock,update,{resolveIdentity}={}) {
  const previous = queues.get(update.id) || Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    const policy = get(update.id); if(!policy.enabled) return;
    let identities;
    if(resolveIdentity) identities=await resolveIdentity(sock,update.id);
    else {
      const {IdentityResolver} = await import('../../addons/alcateia/src/identity.js');
      const meta = await sock.groupMetadata(update.id);
      identities = new IdentityResolver(sock,require('../config').get('BOT_OWNER')+'@s.whatsapp.net',meta);
    }
    const actor = update.author ? await identities.member(update.author,update.authorPn) : null;
    const changes = ['subject','desc','restrict','announce'].filter(key => Object.hasOwn(update,key) && update[key] !== policy[key]);
    if(!changes.length) return;
    if(actor?.isBot || authorized(policy,actor?.phoneNumber)) {
      for(const key of changes) policy[key] = update[key];
      save(update.id,policy,actor?.phoneNumber || 'bot','guard.accept');return;
    }
    const bot = await identities.member(sock.user?.id);
    if(!bot?.isAdmin) throw Error('Antirroubo não consegue restaurar informações: o bot deixou de ser administrador.');
    for(const key of changes) {
      if(key === 'subject') await sock.groupUpdateSubject(update.id,policy.subject);
      if(key === 'desc') await sock.groupUpdateDescription(update.id,policy.desc || '');
      if(key === 'restrict') await sock.groupSettingUpdate(update.id,policy.restrict ? 'locked':'unlocked');
      if(key === 'announce') await sock.groupSettingUpdate(update.id,policy.announce ? 'announcement':'not_announcement');
    }
    save(update.id,policy,actor?.phoneNumber || 'autor não informado','guard.restore');
  });
  queues.set(update.id,job);
  try {await job;} finally {if(queues.get(update.id)===job) queues.delete(update.id);}
}
module.exports = { get, save, authorized, canManage, enforce };
