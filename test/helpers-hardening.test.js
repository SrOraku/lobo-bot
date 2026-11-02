'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../src/utils/helpers');

test('JID helpers normalize device suffixes and preserve complete JIDs', () => {
  assert.equal(helpers.cleanJid('5511999999999:12@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.cleanJid(12), '');
  assert.equal(helpers.getNumber('5511999999999:4@s.whatsapp.net'), '5511999999999');
  assert.equal(helpers.toJid('5511999999999@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.toJid('5511999999999:4@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.toJid(''), '');
});

test('formatTime, progressBar e validateStrategy lidam com entradas inválidas', () => {
  assert.equal(helpers.formatTime(3661), '1h 1m 1s');
  assert.equal(helpers.formatTime(-1), '0s');
  assert.equal(helpers.formatTime('x'), '0s');
  assert.equal(helpers.progressBar(5, 10, 10), '█████░░░░░');
  assert.equal(helpers.progressBar(10, 0, 5), '░░░░░');
  assert.equal(helpers.progressBar(99, 10, 5), '█████');
  assert.equal(helpers.validateStrategy(30, 40, 30).valid, true);
  assert.equal(helpers.validateStrategy(Infinity, 0, 0).valid, false);
  assert.equal(helpers.validateStrategy(NaN, 50, 50).valid, false);
});
