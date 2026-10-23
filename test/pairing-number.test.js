'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { choosePairingNumber } = require('../src/utils/pairing-number');

test('pareamento pede o número e não usa configuração antiga ou dono', async () => {
  const before = process.env.PAIRING_NUMBER;
  process.env.PAIRING_NUMBER = '5543920030769';
  let calls = 0;
  try {
    assert.equal(await choosePairingNumber(async () => { calls++; return '+55 (11) 98765-4321'; }), '5511987654321');
    assert.equal(calls, 1);
  } finally {
    if (before === undefined) delete process.env.PAIRING_NUMBER;
    else process.env.PAIRING_NUMBER = before;
  }
});

test('não gera alvo vazio ou inválido e solicita novamente', async () => {
  const replies = ['', '', 'numero5511987654321', '', '5511987654321'];
  assert.equal(await choosePairingNumber(async () => replies.shift()), '5511987654321');
  assert.equal(replies.length, 0);
});
