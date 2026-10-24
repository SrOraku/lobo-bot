'use strict';
function participantError(code, message, status) {
  return Object.assign(new Error(message), { code, ...(status ? { status } : {}) });
}
function validateParticipantResults(response, targets) {
  if (!Array.isArray(response) || response.length !== targets.length || !targets.length)
    throw participantError('WHATSAPP_UNCONFIRMED', 'O WhatsApp não confirmou a operação para todos os participantes.');
  const used = new Set();
  for (const target of targets) {
    const aliases = new Set([target.jid, target.canonical, ...(target.aliases || [])].filter(Boolean));
    const index = response.findIndex((row, i) => !used.has(i) && typeof row?.jid === 'string' && aliases.has(row.jid.replace(/:\d+@/, '@').replace(/@c\.us$/, '@s.whatsapp.net')));
    if (index < 0) throw participantError('WHATSAPP_UNCONFIRMED', 'O WhatsApp não confirmou o participante solicitado.');
    used.add(index);
    const status = String(response[index].status ?? '');
    if (!['200', '201'].includes(status)) {
      if (!/^\d{3}$/.test(status)) throw participantError('WHATSAPP_UNCONFIRMED', 'A resposta do WhatsApp não contém confirmação válida.');
      throw participantError('WHATSAPP_REFUSED', 'O WhatsApp recusou a operação.', status);
    }
  }
  return response;
}
module.exports = { validateParticipantResults, participantError };
