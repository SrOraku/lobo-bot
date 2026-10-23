'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeFailure } = require('../src/updater/service');
test('diagnóstico distingue bloqueio npm, rede, disco e permissão sem vazar stderr', () => {
  for (const code of ['EALLOWREMOTE', 'EALLOWGIT', 'ENOSPC', 'EACCES', 'ENOMEM', 'ENOTFOUND']) {
    const result = describeFailure({ stderr: `secret-token npm error ${code}` }, 'instalação de dependências');
    assert.equal(result.code, code);
    assert.ok(!JSON.stringify(result).includes('secret-token'));
  }
  assert.equal(describeFailure({ response: { status: 429 } }, 'consulta ao GitHub').code, 'HTTP_429');
  assert.match(describeFailure({}, 'verificação de inicialização').reason, /não foi aplicada/);
});


test('diagnóstico preserva código SQLite e distingue a etapa real do backup', () => {
  const result = describeFailure({ code: 'SQLITE_CANTOPEN', updateStage: 'backup dos dados e sessão' }, 'backup e aplicação');
  assert.equal(result.code, 'SQLITE_CANTOPEN');
  assert.equal(result.stage, 'backup dos dados e sessão');
  assert.match(result.reason, /permissões/);
  assert.match(describeFailure({code:'BACKUP_SYMLINK'}, 'backup').reason, /link simbólico/);
  assert.match(describeFailure({code:'EXDEV'}, 'troca').reason, /volume separado/);
});
