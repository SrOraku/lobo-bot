'use strict';
function inspect(message) {
  let current = message || {},
    viewOnce = false;
  for (let i = 0; i < 5; i++) {
    const wrap =
      current.ephemeralMessage ||
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.viewOnceMessageV2Extension ||
      current.documentWithCaptionMessage;
    if (!wrap?.message) break;
    if (current.viewOnceMessage || current.viewOnceMessageV2 || current.viewOnceMessageV2Extension)
      viewOnce = true;
    current = wrap.message;
  }
  const type = Object.keys(current)[0];
  const body =
    current.conversation ||
    current.extendedTextMessage?.text ||
    current.imageMessage?.caption ||
    current.videoMessage?.caption ||
    '';
  const context = current[type]?.contextInfo || {};
  return { message: current, type, body, viewOnce, mentions: context.mentionedJid || [] };
}
const links = /(?:https?:\/\/|www\.|bit\.ly|t\.co|wa\.me|chat\.whatsapp\.com)[^\s]*/i;
const invitations = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;
function matchingFeatures(data, body, enabled) {
  const matches = [];
  const add = (id, test) => {
    if (test && enabled(id)) matches.push(id);
  };
  add('antilink', links.test(body));
  add('antilinkgrupo', invitations.test(body));
  add('antilinkexterno', links.test(body) && !invitations.test(body));
  add('anticontato', ['contactMessage', 'contactsArrayMessage'].includes(data.type));
  add('antimarcacao', data.mentions.length > 5);
  add('antiviewonce', data.viewOnce);
  for (const [id, types] of Object.entries({
    antilocalizacao: ['locationMessage', 'liveLocationMessage'],
    antidocumento: ['documentMessage'],
    antiaudio: ['audioMessage'],
    antivideo: ['videoMessage'],
    antiimagem: ['imageMessage'],
    antisticker: ['stickerMessage'],
  }))
    add(id, types.includes(data.type));
  return matches;
}
function createMessageTracker({ now = Date.now, maxEntries = 10000 } = {}) {
  const entries = new Map();
  return (jid, sender, body) => {
    body = body ? require('node:crypto').createHash('sha256').update(String(body)).digest('hex') : '';
    const key = jid + ':' + sender,
      time = now();
    let state = entries.get(key);
    if (!state || time - state.start > 10000)
      state = { start: time, count: 0, text: '', repeated: 0 };
    state.count++;
    state.repeated = body && body === state.text ? state.repeated + 1 : 1;
    state.text = body;
    entries.delete(key);
    entries.set(key, state);
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return { flood: state.count > 8, repeated: !!body && state.repeated >= 3 };
  };
}
module.exports = { inspect, matchingFeatures, createMessageTracker };
