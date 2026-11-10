'use strict';
const CREATOR = require('../config/creator');

// O criador vale por número de telefone (dígitos ou JID de telefone). Um
// @lid é um identificador interno do WhatsApp: os dígitos dele não são um
// telefone, então nunca casam com o criador por coincidência.
function isCreator(value) {
  const text = String(value ?? '').trim();
  const digits = /^\+?(\d{10,15})$/.exec(text)?.[1] || /^(\d{10,15})(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/.exec(text)?.[1];
  return digits === CREATOR.number;
}

// Donos desta instalação: BOT_OWNER, BOT_OWNERS e os cadastrados pelo !donos.
function configuredOwners(config = require('../config')) {
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

// Todos com autoridade de dono: os configurados e, sempre, o criador — que é
// dono absoluto em qualquer instalação, mesmo com outro número em BOT_OWNER.
function ownerNumbers(config = require('../config')) {
  return [...new Set([...configuredOwners(config), CREATOR.number])];
}

// Dono principal (gerencia o !donos). O criador nunca vira o principal sozinho.
function primaryOwner(config = require('../config')) {
  return configuredOwners(config)[0] || '';
}

async function protectedOwner(sock, jid, group) {
  const { IdentityResolver, normalizeJid } = await import('../../addons/alcateia/src/identity.js');
  const id = normalizeJid(jid);
  if (!id) throw Error('Não foi possível validar o destinatário.');
  const numbers = ownerNumbers();
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
module.exports = { ownerNumbers, configuredOwners, primaryOwner, protectedOwner, isCreator, CREATOR };
