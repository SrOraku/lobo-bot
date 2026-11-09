'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { askConsole, localAsk } = require('../src/utils/terminal-input');
const { choosePairingNumber } = require('../src/utils/pairing-number');
test('escolha de número usa o console do inicializador e ignora respostas de outro pedido', async () => {
  const channel = new EventEmitter(); channel.connected = true;
  channel.send = message => {
    assert.equal(message.type, 'lobo:prompt'); assert.match(message.question, /Digite o número/);
    channel.emit('message', {type:'lobo:prompt-answer',id:'outro',answer:'5543920030769'});
    channel.emit('message', {type:'lobo:prompt-answer',id:message.id,answer:'5511988887777'});
  };
  const number = await choosePairingNumber(question => askConsole(question, {channel,supervised:true}));
  assert.equal(number,'5511988887777');
  assert.equal(channel.listenerCount('message'),0);
});
test('sem inicializador a pergunta continua usando o console local, sem número padrão', async () => {
  let asked = false;
  assert.equal(await askConsole('Número?', {supervised:false,ask:async question => {asked = true; assert.equal(question,'Número?'); return '5511988887777';}}),'5511988887777');
  assert.ok(asked);
});

function consoleStreams(t) {
  const input = new PassThrough(), output = new PassThrough();
  t.after(() => { input.destroy(); output.destroy(); });
  const listeners = () => [input.listenerCount('error'), input.listenerCount('close'), input.listenerCount('end'), output.listenerCount('error')];
  const before = listeners();
  return { input, output, checkCleanup: () => assert.deepEqual(listeners(), before) };
}

test('console local aceita resposta por pipe sem TTY e remove espaços', async t => {
  const streams = consoleStreams(t);
  let prompt = '';
  streams.output.on('data', chunk => { prompt += chunk; });
  const answer = localAsk('Número do dono: ', streams);
  streams.input.write(' 5511988887777 \n');
  assert.equal(await answer, '5511988887777');
  assert.equal(prompt, 'Número do dono: ');
  streams.checkCleanup();
});

test('console local rejeita EOF sem deixar a pergunta pendente', async t => {
  const streams = consoleStreams(t);
  const rejected = assert.rejects(localAsk('Número do dono: ', streams), { code: 'CONSOLE_CLOSED' });
  streams.input.end();
  await rejected;
  streams.checkCleanup();
});

test('console local rejeita fechamento abrupto ou entrada já fechada', async t => {
  const streams = consoleStreams(t);
  const rejected = assert.rejects(localAsk('Número do dono: ', streams), { code: 'CONSOLE_CLOSED' });
  streams.input.destroy();
  await rejected;
  streams.checkCleanup();
  await assert.rejects(localAsk('Número do dono: ', streams), { code: 'CONSOLE_CLOSED' });
  streams.checkCleanup();
});

test('console local rejeita erro de leitura e libera os listeners', async t => {
  const streams = consoleStreams(t);
  const cause = new Error('pipe interrompido');
  const rejected = assert.rejects(localAsk('Número do dono: ', streams), error => error.code === 'CONSOLE_ERROR' && error.cause === cause);
  streams.input.emit('error', cause);
  await rejected;
  streams.checkCleanup();
});
