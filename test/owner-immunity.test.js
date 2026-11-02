'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { protectedOwner, ownerNumbers } = require('../src/utils/owners');

test('proteção reconhece donos configurados e LID mapeado', async () => {
  const config = { get: key => ({ BOT_OWNER: '5511999999999', BOT_OWNERS: '5511888888888' }[key] || '') };
  assert.deepEqual(ownerNumbers(config), ['5511999999999', '5511888888888']);
  // O valor oficial do mantenedor não recebe imunidade implicitamente.
  const original = process.env.BOT_OWNER;
  const additional = process.env.BOT_OWNERS;
  process.env.BOT_OWNER = '5511999999999';
  process.env.BOT_OWNERS = '5511888888888';
  try {
    assert.equal(await protectedOwner({}, '5511999999999@s.whatsapp.net'), true);
    assert.equal(await protectedOwner({}, '5543920030769@s.whatsapp.net'), false);
    const sock = { signalRepository: { lidMapping: {
      getPNForLID: async () => '5511999999999@s.whatsapp.net',
    } } };
    assert.equal(await protectedOwner(sock, '999999@lid'), true);
    const unrelated = { signalRepository: { lidMapping: {
      getPNForLID: async () => '5543920030769@s.whatsapp.net',
    } } };
    assert.equal(await protectedOwner(unrelated, '888888@lid'), false);
  } finally {
    if (original === undefined) delete process.env.BOT_OWNER; else process.env.BOT_OWNER = original;
    if (additional === undefined) delete process.env.BOT_OWNERS; else process.env.BOT_OWNERS = additional;
  }
});

test('LID não resolvido bloqueia punição em vez de assumir que é membro comum', async () => {
  await assert.rejects(protectedOwner({}, '999999@lid'), /validar/);
});
