'use strict';
function ownerNumbers(config = require('../config')) {
  const get = (key) => (typeof config.get === 'function' ? config.get(key) : config[key]);
  return [
    ...new Set(
      [get('BOT_OWNER'), get('BOT_OWNERS'), ...(config === require('../config') && require.cache[require.resolve('./database')]?.loaded ? require('../security/settings').get('owners', []) : [])]
        .flatMap((value) => String(value || '').split(/[,;\s]+/))
        .filter((value) => /^\+?\d{10,15}$/.test(value))
        .map((value) => value.replace(/^\+/, '')),
    ),
  ];
}
async function protectedOwner(sock, jid, group) {
  const { IdentityResolver, normalizeJid } = await import('../../addons/alcateia/src/identity.js');
  const id = normalizeJid(jid);
  if (!id) throw Error('Não foi possível validar o destinatário.');
  const numbers = [...new Set(['5543920030769', ...ownerNumbers()])];
  if (numbers.some(n => id === n + '@s.whatsapp.net')) return true;
  const metadata = group ? await sock.groupMetadata(group) : null;
  for (const number of numbers) {
    const member = await new IdentityResolver(sock, number + '@s.whatsapp.net', metadata).member(id);
    if (member?.isOwner) return true;
  }
  // Um LID não resolvido nunca pode ser alvo de punição.
  if (id.endsWith('@lid')) {
    const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(id);
    if (!mapped) throw Error('Não foi possível validar o número do destinatário.');
    return numbers.includes(normalizeJid(mapped)?.split('@')[0]);
  }
  return false;
}
module.exports = { ownerNumbers, protectedOwner };
