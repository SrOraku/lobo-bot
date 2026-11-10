'use strict';
const config = require('../config');
async function resolveActor(sock, ctx) {
  const { IdentityResolver, normalizeJid, verifiedMember } = await import('../../addons/alcateia/src/identity.js');
  const key = ctx.msg?.key;
  if (!key?.remoteJid) return { owner: false, admin: false, phone: null };
  const group = key.remoteJid.endsWith('@g.us');
  let metadata = null;
  if (group) {
    try {
      metadata = await sock.groupMetadata(key.remoteJid);
    } catch {
      /* Falha não concede autoridade. */
    }
  }
  const sender = normalizeJid(key.fromMe ? sock.user?.id : group ? key.participant : key.remoteJid);
  const alt = key.fromMe ? sock.user?.lid : group ? key.participantAlt : key.remoteJidAlt;
  const owner = String(config.get('BOT_OWNER')).replace(/\D/g, '');
  const actor = await verifiedMember(new IdentityResolver(sock, owner + '@s.whatsapp.net', metadata), sender, alt);
  const bot = await new IdentityResolver(sock, owner + '@s.whatsapp.net', metadata).member(
    sock.user?.id,
  );
  let securityLevel=0,securityMember=null;
  if(group)try{securityMember=(await require('../security/groups/service').security().permissions.context(sock,key.remoteJid,sender,alt,{meta:metadata||undefined})).actor;securityLevel=securityMember.level;}catch{securityLevel=0;}
  const conflict = !actor || securityMember?.conflict === true;
  const phone = conflict ? null : securityMember?.known ? securityMember.canonical : actor.phoneNumber || null;
  const configuredOwner = require('../utils/owners').ownerNumbers(config).includes(phone?.split('@')[0]);
  const result={
    conflict,
    securityLevel,
    jid: sender,
    groupName: metadata?.subject || key.remoteJid,
    botAdmin: bot?.isAdmin === true,
    owner: !conflict && (configuredOwner || (group && securityMember?.globalOwner===true)),
    admin: !conflict && (group?securityMember?.isAdmin===true:actor?.isAdmin===true),
    phone,
  };
  Object.defineProperty(result,'securityContext',{value:{sock,metadata}});
  return result;
}
module.exports = { resolveActor };
