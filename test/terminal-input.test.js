'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { askConsole } = require('../src/utils/terminal-input');
const { choosePairingNumber } = require('../src/utils/pairing-number');
test('escolha de número usa o console do inicializador e ignora respostas de outro pedido', async () => {
  const channel = new EventEmitter(); channel.connected = true;
  channel.send = message => {
    assert.equal(message.type, 'lobo:prompt'); assert.match(message.question, /Digite o número/);
    channel.emit('message', {type:'lobo:prompt-answer',id:'outro',answer:'5543920030769'});
    channel.emit('message', {type:'lobo:prompt-answer',id:message.id,answer:'+55 11 98888-7777'});
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
