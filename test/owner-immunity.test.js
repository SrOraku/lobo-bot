'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { protectedOwner } = require('../src/utils/owners');
test('proteção reconhece telefone oficial e LID mapeado sem confiar no nome', async () => {
  assert.equal(await protectedOwner({}, '5543920030769@s.whatsapp.net'), true);
  const sock = { signalRepository: { lidMapping: {
    getPNForLID: async () => '5543920030769@s.whatsapp.net',
  } } };
  assert.equal(await protectedOwner(sock, '999999@lid'), true);
  assert.equal(await protectedOwner({}, '5511988888888@s.whatsapp.net'), false);
});
test('LID não resolvido bloqueia punição em vez de assumir que é membro comum', async () => {
  await assert.rejects(protectedOwner({}, '999999@lid'), /validar/);
});
