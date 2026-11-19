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

test('download diagnostics identify managed file and hash errors without leaking transport details', () => {
  const d = describeFailure({ code: 'DOWNLOAD_HASH_MISMATCH', updateFile: 'src/index.js', message: 'private URL and token' }, 'download dos arquivos');
  assert.equal(d.file, 'src/index.js'); assert.equal(d.code, 'DOWNLOAD_HASH_MISMATCH'); assert.match(d.reason, /hash/);
  assert.ok(!JSON.stringify(d).includes('private'));
  assert.equal(describeFailure({ code: 'DOWNLOAD_FAILED', updateFile: '../../.env' }, 'download').file, undefined);
  assert.match(describeFailure({ response: { status: 503 } }, 'download').reason, /temporariamente/);
  assert.equal(describeFailure({ code: 'DOWNLOAD_FAILED', response: { status: 503 } }, 'download').httpStatus, 503);
  assert.match(describeFailure({ code: 'DOWNLOAD_FAILED', response: { status: 503 } }, 'download').reason, /temporariamente/);
});

test('limite do GitHub explica o motivo e a hora de liberação no !atualizar', () => {
  const { describeFailure } = require('../src/updater/service');
  const d = describeFailure(Object.assign(new Error('Limite de consultas do GitHub atingido.'), { code: 'GITHUB_RATE_LIMIT', response: { status: 403 }, resetAt: Date.parse('2026-11-19T19:05:00Z') }), 'verificação');
  assert.equal(d.code, 'GITHUB_RATE_LIMIT'); assert.equal(d.httpStatus, 403);
  assert.match(d.reason, /limitou as consultas deste servidor.*depois das 16:05 \(Brasília\)/);
});

test('conexão recusada ou DNS temporário contam como falha de rede', () => {
  const { describeFailure } = require('../src/updater/service');
  for (const code of ['ECONNREFUSED', 'EAI_AGAIN']) {
    const d = describeFailure(Object.assign(new Error(`connect ${code} 127.0.0.1:9`), { code }), 'consulta ao GitHub');
    assert.equal(d.code, code); assert.match(d.reason, /Falha de rede/);
  }
});
