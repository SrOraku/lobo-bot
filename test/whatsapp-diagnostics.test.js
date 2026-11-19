'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createActivityLogger } = require('../src/utils/activity-logger');
const { libraryDiagnostic, statusCode } = require('../src/connection/diagnostics');

test('message decryption errors are distinct from transport failure without leaking message/session data', () => {
  const lines = [], errors = [];
  const app = createActivityLogger({ file: { write: line => lines.push(line) }, stderr: { write: line => errors.push(line) } });
  app.baileysLogger().error({
    err: { message: 'Bad MAC PRIVATE-FIXTURE', stack: 'PRIVATE-FIXTURE', session: { key: 'PRIVATE-FIXTURE' } },
    sender: '5511999999999@s.whatsapp.net', key: { id: 'private-message' }, plaintext: 'PRIVATE-FIXTURE',
  }, 'failed to decrypt message');
  const record = JSON.parse(lines[0]);
  assert.equal(record.code, 'WHATSAPP_DECRYPT_FAILED');
  assert.equal(record.reason, 'BAD_MAC');
  assert.match(errors.join(''), /descriptografar/);
  assert.ok(!JSON.stringify([lines, errors]).includes('PRIVATE-FIXTURE'));
  assert.ok(!JSON.stringify([lines, errors]).includes('5511999999999'));
  assert.ok(!JSON.stringify([lines, errors]).includes('private-message'));
});

test('diagnostics distinguish synchronization, acknowledgments, connection conflicts and unknown library failures', () => {
  for (const [msg, code] of [
    ['Failed to create own LID session', 'WHATSAPP_KEY_SYNC_FAILED'],
    ['failed to ack receipt', 'WHATSAPP_ACK_FAILED'],
    ['failed to sync state', 'WHATSAPP_SYNC_FAILED'],
    ['unexpected error in messages', 'WHATSAPP_LIBRARY_ERROR'],
  ]) assert.equal(libraryDiagnostic({ msg }).code, code);
  assert.equal(libraryDiagnostic({ fullErrorNode: { attrs: { code: '515' } } }), null);
  const conflict = libraryDiagnostic({ msg: 'stream errored out', reasonNode: { tag: 'conflict', attrs: { type: 'replaced' } } });
  assert.equal(conflict.code, 'WHATSAPP_CONNECTION_REPLACED'); assert.equal(conflict.status, 440);
  assert.equal(libraryDiagnostic({ err: { output: { statusCode: 401 } } }).code, 'WHATSAPP_LOGGED_OUT');
  assert.equal(statusCode({ statusCode: '428' }), 428);
});

test('network diagnostics expose only allowlisted error identifiers and retain HTTP status on the console', () => {
  const output = [], lines = [];
  const app = createActivityLogger({ stderr: { write: text => output.push(text) }, file: { write: text => lines.push(text) } });
  app.baileysLogger().error({ err: { code: 'ETIMEDOUT', output: { statusCode: 408 }, message: 'secret-url?apikey=PRIVATE' } }, 'error in sending keep alive');
  const record = JSON.parse(lines[0]);
  assert.equal(record.network, 'ETIMEDOUT'); assert.equal(record.status, 408);
  assert.match(output.join(''), /408/); assert.match(output.join(''), /WHATSAPP_TRANSPORT/);
  assert.ok(!JSON.stringify([lines, output]).includes('PRIVATE'));
  const unknown = libraryDiagnostic({ err: { code: 'PRIVATE', message: 'PRIVATE' }, msg: 'PRIVATE' });
  assert.ok(!JSON.stringify(unknown).includes('PRIVATE'));
});

test('erro desconhecido da biblioteca: o log privado guarda qual foi, o console não muda e nada pessoal vaza', () => {
  const lines = [], errors = [];
  const app = createActivityLogger({ file: { write: line => lines.push(line) }, stderr: { write: line => errors.push(line) } });
  const failure = new TypeError('Cannot read properties of undefined (reading 5511999999999)');
  app.baileysLogger().error({ err: failure, jid: '5511999999999@s.whatsapp.net', text: 'PRIVATE-FIXTURE' }, 'error in handling message');
  const record = JSON.parse(lines[0]);
  assert.equal(record.code, 'WHATSAPP_LIBRARY_ERROR');
  assert.equal(record.source, 'error in handling message');
  assert.equal(record.errorName, 'TypeError');
  assert.doesNotMatch(errors.join(''), /error in handling message/, 'o console continua só com a frase e o código');
  assert.match(errors.join(''), /WHATSAPP_LIBRARY_ERROR/);
  for (const secret of ['5511999999999', 'PRIVATE-FIXTURE', 'Cannot read']) assert.ok(!JSON.stringify([lines, errors]).includes(secret), secret);
});

test('só frases fixas da biblioteca entram no log; qualquer outro texto é descartado', () => {
  const { libraryMessage } = require('../src/connection/diagnostics');
  assert.equal(libraryMessage('failed to ack receipt'), 'failed to ack receipt');
  assert.equal(libraryMessage('  Error In Handling Message '), 'error in handling message');
  for (const text of ['PRIVATE', 'retry 5511999999999 failed', 'falhou para 5511999999999@s.whatsapp.net', '{"key":"abc"}', undefined]) assert.equal(libraryMessage(text), undefined, String(text));
});

test('a lista de frases acompanha o Baileys instalado (avisa quando uma versão nova traz frases novas)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const { LIBRARY_MESSAGES } = require('../src/connection/diagnostics');
  const lib = path.join(path.dirname(require.resolve('@whiskeysockets/baileys/package.json')), 'lib');
  const found = new Set();
  const visit = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.js')) for (const match of fs.readFileSync(file, 'utf8').matchAll(/logger\.error\(([^;]{0,240}?)['`]([^'`$]{4,90})['`]\s*\)/g)) found.add(match[2]);
  } };
  visit(lib);
  assert.ok(found.size >= 20, `frases encontradas: ${found.size}`);
  const missing = [...found].filter(text => !LIBRARY_MESSAGES.has(text.toLowerCase()));
  assert.deepEqual(missing, [], 'acrescente as frases novas em LIBRARY_MESSAGES (src/connection/diagnostics.js)');
});

test('falhas de notificação do WhatsApp contam como sincronização, não como erro desconhecido', () => {
  for (const msg of ['failed to handle devices notification', 'failed to parse mex newsletter notification', 'failed to parse mex notification JSON']) {
    assert.equal(libraryDiagnostic({ msg }).code, 'WHATSAPP_SYNC_FAILED', msg);
  }
  assert.equal(libraryDiagnostic({ msg: 'failed to ack notification' }).code, 'WHATSAPP_ACK_FAILED', 'confirmação continua confirmação');
});
