'use strict';
// Garante que, nos processos de teste, o stdout leva só as molduras do executor do
// `node --test` (ver test/support/stdout-guard.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DefaultDeserializer } = require('node:v8');
const { install, isFrame } = require('./support/stdout-guard');

const GUARD = path.join(__dirname, 'support', 'stdout-guard.js');
const FIXTURE = path.join(__dirname, 'support', 'stdout-noise.fixture.js');

// Roda a fixture do jeito que o executor roda cada arquivo de teste.
function child(args) {
  const result = spawnSync(process.execPath, [...args, FIXTURE], { env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' }, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result;
}

// Lê o stdout como o executor deveria (tamanho sem sinal) e separa molduras de texto solto.
function split(stdout) {
  const frames = [];
  let loose = 0, offset = 0;
  while (offset < stdout.length) {
    if (stdout[offset] === 0xff && stdout[offset + 1] === 0x0f && offset + 6 <= stdout.length) {
      const end = offset + 6 + stdout.readUInt32BE(offset + 2);
      const deserializer = new DefaultDeserializer(stdout.subarray(offset + 6, end));
      deserializer.readHeader();
      frames.push(deserializer.readValue());
      offset = end;
    } else { loose++; offset++; }
  }
  return { frames, loose };
}

test('o defeito existe: texto com emoji vira tamanho negativo na conta com sinal do executor', () => {
  const text = Buffer.from('  🌹 Migration v1 aplicada');
  const signed = (text[2] << 24 | text[3] << 16 | text[4] << 8 | text[5]) + 6;
  assert.ok(signed < 0, 'é isso que faz o executor ler lixo');
  const plain = Buffer.from('Migration v1 aplicada');
  assert.ok((plain[2] << 24 | plain[3] << 16 | plain[4] << 8 | plain[5]) + 6 > 1e8, 'texto sem acento só faz o executor esperar mais dados');
});

test('sem a proteção, o texto do bot cai no meio das molduras do executor', () => {
  const { stdout } = child([]);
  const { frames, loose } = split(stdout);
  assert.ok(frames.length > 40);
  assert.ok(loose > 1000, `${loose} bytes de texto misturados no canal`);
});

test('com a proteção, o stdout tem só molduras e o texto vai inteiro para o stderr', () => {
  const { stdout, stderr } = child(['--require', GUARD]);
  const { frames, loose } = split(stdout);
  assert.equal(loose, 0, 'nenhum byte fora das molduras');
  assert.equal(frames.filter(item => item.type === 'test:pass').length, 40);
  const text = stderr.toString();
  for (const expected of ['  🌹 Migration v40 "teste" aplicada', '🌹 Verificando banco de dados...', 'ação concluída', 'não é moldura']) assert.ok(text.includes(expected), expected);
});

test('install só age dentro dos processos de teste e uma vez só', () => {
  const written = { out: [], err: [] };
  const stdout = { write(chunk) { written.out.push(chunk); return true; } };
  const stderr = { write(chunk, encoding, callback) { written.err.push([chunk, encoding, callback]); return true; } };
  assert.equal(install({ stdout, stderr, env: {} }), false, 'no processo principal não mexe em nada');
  assert.equal(install({ stdout, stderr, env: { NODE_TEST_CONTEXT: 'child-v8' } }), true);
  assert.equal(install({ stdout, stderr, env: { NODE_TEST_CONTEXT: 'child-v8' } }), false, 'não embrulha duas vezes');
  const frame = Buffer.from([0xff, 0x0f, 0, 0, 0, 0]);
  const done = () => {};
  stdout.write(frame); stdout.write('🌹 texto', 'utf8', done); stdout.write(Buffer.from('buffer de texto'));
  assert.deepEqual(written.out, [frame]);
  assert.deepEqual(written.err.map(([chunk]) => String(chunk)), ['🌹 texto', 'buffer de texto']);
  assert.equal(written.err[0][2], done, 'o callback chega ao stderr');
  assert.equal(isFrame(new Uint8Array()), false); assert.equal(isFrame('\xff'), false);
});

test('o npm test carrega a proteção em todo processo de teste', () => {
  const scripts = require('../package.json').scripts;
  for (const name of ['test', 'test:background']) assert.match(scripts[name], /^node --test --require \.\/test\/support\/stdout-guard\.js /, name);
  // Este arquivo também roda como processo de teste: a proteção tem que estar ativa aqui.
  if (process.env.NODE_TEST_CONTEXT === 'child-v8') assert.equal(process.stdout[Symbol.for('lobo.stdoutGuard')], true, 'rode os testes com npm test');
});
