'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../src/utils/helpers');

test('cleanJid aceita apenas strings e remove dispositivo sem alterar JID válido', () => {
  assert.equal(helpers.cleanJid('5511999999999:12@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.cleanJid('5511999999999@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.cleanJid(''), '');
  assert.equal(helpers.cleanJid(null), '');
  assert.equal(helpers.cleanJid(123), '');
});

test('toJid preserva JIDs completos e normaliza números', () => {
  assert.equal(helpers.toJid('5511999999999'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.toJid('5511999999999@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.toJid('5511999999999:4@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
  assert.equal(helpers.toJid(''), '');
});

test('formatTime trata valores inválidos e mantém duração correta', () => {
  assert.equal(helpers.formatTime(3661), '1h 1m 1s');
  assert.equal(helpers.formatTime(61), '1m 1s');
  assert.equal(helpers.formatTime(0), '0s');
  assert.equal(helpers.formatTime(-5), '0s');
  assert.equal(helpers.formatTime('inválido'), '0s');
});

test('progressBar limita valores e evita divisão por zero', () => {
  assert.equal(helpers.progressBar(5, 10, 10), '█████░░░░░');
  assert.equal(helpers.progressBar(20, 10, 5), '█████');
  assert.equal(helpers.progressBar(-2, 10, 5), '░░░░░');
  assert.equal(helpers.progressBar(1, 0, 5), '░░░░░');
});

test('validateStrategy só aceita números finitos que somam exatamente 100', () => {
  assert.equal(helpers.validateStrategy(30, 40, 30).valid, true);
  assert.equal(helpers.validateStrategy('30', '40', '30').valid, true);
  assert.equal(helpers.validateStrategy(NaN, 50, 50).valid, false);
  assert.equal(helpers.validateStrategy(Infinity, 0, 0).valid, false);
  assert.equal(helpers.validateStrategy(30, 30, 30).valid, false);
});
