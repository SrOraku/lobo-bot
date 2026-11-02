'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { protectedOwner } = require('../src/utils/owners');
test('proteção reconhece apenas donos configurados e LID mapeado', async () => {
  assert.equal(await protectedOwner({}, '5543920030769@s.whatsapp.net'), false);
  const sock = { signalRepository: { lidMapping: {
    getPNForLID: async () => '5511999999999@s.whatsapp.net',
  } } };
  assert.equal(await protectedOwner(sock, '999999@lid'), false);
  assert.equal(await protectedOwner({}, '5511988888888@s.whatsapp.net'), false);
});
test('LID não resolvido bloqueia punição em vez de assumir que é membro comum', async () => {
  await assert.rejects(protectedOwner({}, '999999@lid'), /validar/);
});
