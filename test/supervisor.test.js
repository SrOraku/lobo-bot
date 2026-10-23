'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { start } = require('../src/updater/supervisor');
test('inicializador reinicia só depois de encerrar o processo anterior', () => {
  const children = [], exits = [];
  const beforeTerm = process.listeners('SIGTERM'), beforeInt = process.listeners('SIGINT');
  const controller = start({ spawn: (_, args, options) => {
    assert.equal(options.env.LOBO_SUPERVISED, '1');
    const child = new EventEmitter(); child.signals = []; child.kill = signal => child.signals.push(signal);
    children.push(child); return child;
  }, exit: code => exits.push(code) });
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
  for (const id of Object.keys(require('../src/menus/catalog').CATEGORIES)) assert.ok(texts[0].includes('menu ' + id));
  assert.ok(texts[0].includes('não possuem botão de desligar'));
});
