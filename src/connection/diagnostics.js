'use strict';

const NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH']);
function statusCode(value) {
  for (const candidate of [value?.output?.statusCode, value?.statusCode, value?.data?.attrs?.code, value?.fullErrorNode?.attrs?.code, value?.reasonNode?.attrs?.code]) {
    const number = Number(candidate);
    if (Number.isInteger(number) && number >= 400 && number <= 599) return number;
  }
  if (value?.reasonNode?.tag === 'conflict' && value.reasonNode.attrs?.type === 'replaced') return 440;
  return undefined;
}

// Error-level messages written by the Baileys version in package-lock.json (fixed strings
// from its source code). Only these go to the private log files, so an unknown failure can
// still be identified later; any other text is dropped because it could carry private data.
// test/whatsapp-diagnostics.test.js compares this list with the installed library.
const LIBRARY_MESSAGES = new Map([
  'Failed to check/upload pre-keys during initialization', 'Failed to create own LID session', 'Failed to decode plaintext newsletter message',
  'Failed to encrypt for recipient', 'Failed to send retry', 'Failed to upload pre-keys to server', 'error in handling call', 'error in handling message',
  'error in sending keep alive', 'error in sending message again', 'error in socket end handler', 'error in validating connection', 'failed to ack call',
  'failed to ack message after error', 'failed to ack notification', 'failed to ack receipt', 'failed to decrypt message', 'failed to handle devices notification',
  'failed to parse mex newsletter notification', 'failed to parse mex notification JSON', 'failed to process sender key distribution message',
  'recv invalid presence node', 'stream errored out', 'transaction failed, rolling back',
].map(text => [text.toLowerCase(), text]));
const libraryMessage = value => LIBRARY_MESSAGES.get(String(value ?? '').trim().toLowerCase());
const errorName = value => /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(String(value || '')) ? String(value) : undefined;

// Library records may contain keys, phone numbers and message bodies. Inspect
// them locally, but return only fixed identifiers and messages chosen here.
function libraryDiagnostic(record = {}) {
  const error = record.err || record.error || {};
  const status = statusCode(record) || statusCode(error);
  if (status === 515) return null; // The lifecycle announces this expected restart.
  const message = String(record.msg || '').toLowerCase();
  const detail = String(error.message || '').toLowerCase();
  const network = NETWORK_CODES.has(error.code) ? error.code : undefined;
  // pino stores the constructor name of a real Error in `type`.
  const source = libraryMessage(record.msg), name = errorName(error.type || error.name);
  const diagnostic = (code, message, reason) => ({ code, message, ...(status ? { status } : {}), ...(network ? { network } : {}), ...(reason ? { reason } : {}),
    ...(source ? { source } : {}), ...(name && name !== 'Error' ? { errorName: name } : {}) });
  if (/decrypt|sender key distribution/.test(message)) {
    const reason = /bad mac|mac verification/.test(detail) ? 'BAD_MAC' : /no session|session record/.test(detail) ? 'SESSION_NOT_FOUND' : 'MESSAGE_DECRYPTION';
    return diagnostic('WHATSAPP_DECRYPT_FAILED', 'Não foi possível descriptografar uma mensagem. Isso não confirma queda da conexão.', reason);
  }
  if (/pre.keys|pre-keys|own lid session/.test(message)) return diagnostic('WHATSAPP_KEY_SYNC_FAILED', 'Falha ao sincronizar chaves do WhatsApp. A sessão foi preservada.');
  if (/ack receipt|ack notification|ack message|ack call/.test(message)) return diagnostic('WHATSAPP_ACK_FAILED', 'Falha ao confirmar recebimento no WhatsApp.');
  if (/sync|patch|notification/.test(message)) return diagnostic('WHATSAPP_SYNC_FAILED', 'Falha ao sincronizar uma atualização do WhatsApp.');
  if (status === 401) return diagnostic('WHATSAPP_LOGGED_OUT', 'O WhatsApp desvinculou esta sessão. Confira os aparelhos conectados.');
  if (status === 440) return diagnostic('WHATSAPP_CONNECTION_REPLACED', 'Outra conexão substituiu este bot. Confira se há duas instâncias com a mesma sessão.');
  if (status || network || /socket|stream|keep alive|validating connection/.test(message)) return diagnostic('WHATSAPP_TRANSPORT', 'Falha na conexão com o WhatsApp.', network || (status === 408 ? 'TIMEOUT' : undefined));
  return diagnostic('WHATSAPP_LIBRARY_ERROR', 'Falha interna na integração com o WhatsApp. Consulte o diagnóstico no log privado.');
}

module.exports = { statusCode, libraryDiagnostic, libraryMessage, LIBRARY_MESSAGES };
