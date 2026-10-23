'use strict';
const config = require('../config');
async function resolveActor(sock, ctx) {
  const { IdentityResolver, normalizeJid } = await import('../../addons/alcateia/src/identity.js');
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
  const actor = await new IdentityResolver(sock, owner + '@s.whatsapp.net', metadata).member(
    sender,
    alt,
  );
  return {
    owner: require('../utils/owners')
      .ownerNumbers(config)
      .includes(actor?.phoneNumber?.split('@')[0]),
    admin: actor?.isAdmin === true,
    phone: actor?.phoneNumber || null,
  };
}
module.exports = { resolveActor };
