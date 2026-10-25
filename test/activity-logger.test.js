'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createActivityLogger } = require('../src/utils/activity-logger');
function fixture(options = {}) {
  const out = [], err = [], file = [], errors = [];
  const app = createActivityLogger({ stdout: { write: v => out.push(v) }, stderr: { write: v => err.push(v) },
    file: { write: v => file.push(v) }, errorFile: { write: v => errors.push(v) }, ...options });
  return { ...app, out, err, file, errors };
}
test('group command summaries remain visible despite legacy LOG_LEVEL=error, with real prefix', () => {
  const x = fixture({ level: 'error', prefix: () => '#' });
  x.logCommand('55119999@s.whatsapp.net', 'menu', '120000@g.us', { userName: 'Ana', groupName: 'Alcateia' });
  assert.match(x.out.join(''), /CMD #menu.*Grupo: Alcateia.*Usuário: Ana/);
  const record = JSON.parse(x.file[0]); assert.equal(record.type, 'command'); assert.equal(record.group, '120000@g.us');
});
test('debug and generic routine info do not clutter console; real errors remain visible', () => {
  const x = fixture(); x.logger.info('routine noise'); x.logger.warn({ privKey: 'secret' }, 'internal warning');
  x.logger.error({ code: 'EACCES', creds: { privateKey: 'secret' }, err: { message: 'private error body' } }, 'Falha de escrita');
  assert.equal(x.out.length, 0); assert.match(x.err.join(''), /Falha de escrita.*EACCES/);
  assert.ok(!x.err.join('').includes('secret')); assert.ok(!x.err.join('').includes('private error body'));
  assert.ok(!x.file.join('').includes('secret')); assert.equal(x.errors.length, 1);
});
test('command logging can be disabled independently without disabling errors or connection status', () => {
  const x = fixture({ commands: () => false }); x.logCommand('user', 'menu', 'group');
  x.logConnection('ONLINE — conectado'); x.logger.error({ code: 'TEST' }, 'Erro real');
  assert.equal(x.out.length, 1); assert.match(x.out[0], /ONLINE/); assert.equal(x.err.length, 1);
  assert.equal(x.file.some(line => line.includes('"type":"command"')), false);
});
test('terminal control characters in user names cannot clear or forge console lines', () => {
  const x = fixture(); x.logCommand('user', 'menu', 'group', { userName: 'Ana\nFORGED\x1b[2J' });
  assert.equal(x.out[0].split('\n').length, 2); assert.ok(!x.out[0].includes('\x1b'));
});
test('Baileys 515 has a controlled lifecycle notice while other transport errors stay visible without dumps', () => {
  const x = fixture(), library = x.baileysLogger();
  library.error({ fullErrorNode: { attrs: { code: '515' } }, session: { privKey: 'session-secret' } }, 'stream errored out');
  assert.equal(x.err.length, 0); assert.equal(x.file.length, 0);
  x.logConnection('WhatsApp solicitou reinício (515). Reconectando com a sessão salva.');
  library.error({ fullErrorNode: { attrs: { code: '500' } }, auth: 'session-secret' }, 'raw secret dump');
  assert.match(x.err[0], /WhatsApp.*500/); assert.match(x.out[0], /515/);
  assert.ok(!JSON.stringify([x.out, x.err, x.file]).includes('session-secret'));
});
