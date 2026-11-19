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
