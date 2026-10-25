'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { start } = require('../src/updater/supervisor');
test('inicializador encaminha a escolha de número e reinicia só depois de encerrar o processo anterior', async () => {
  const children = [], exits = [];
  const beforeTerm = process.listeners('SIGTERM'), beforeInt = process.listeners('SIGINT');
  const controller = start({ spawn: (_, args, options) => {
    assert.equal(options.env.LOBO_SUPERVISED, '1');
    const child = new EventEmitter(); child.connected = true; child.answers = []; child.send = message => child.answers.push(message); child.signals = []; child.kill = signal => child.signals.push(signal);
    children.push(child); return child;
  }, exit: code => exits.push(code), ask: async question => { assert.equal(question,'Digite o número'); return '5511988887777'; } });
  children[0].emit('message', {type:'lobo:prompt',id:'choice',question:'Digite o número'});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(children[0].answers,[{type:'lobo:prompt-answer',id:'choice',answer:'5511988887777'}]);
  children[0].emit('message', { type: 'lobo:restart' });
  assert.deepEqual(children[0].signals, ['SIGTERM']);
  assert.equal(children.length, 1);
  children[0].emit('exit', 0); assert.equal(children.length, 2);
  controller.stop(); children[1].emit('exit', 0); assert.equal(children.length, 2);
  assert.deepEqual(exits, [0]);
  for (const [signal, previous] of [['SIGTERM', beforeTerm], ['SIGINT', beforeInt]])
    for (const listener of process.listeners(signal)) if (!previous.includes(listener)) process.removeListener(signal, listener);
});
test('setores lista todas as categorias como informação sem controles on/off', async () => {
  const texts = [];
  await require('../src/commands/sectors').sectors({ sendMessage: async (_, c) => texts.push(c.text) }, { jid: 'test', msg: {} });
  for (const id of Object.keys(require('../src/menus/catalog').CATEGORIES)) assert.ok(texts[0].replace(/[*_`]/g, '').includes('menu ' + id));
  assert.ok(texts[0].includes('não possuem botão de desligar'));
});
