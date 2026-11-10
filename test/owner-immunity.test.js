'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { protectedOwner, ownerNumbers } = require('../src/utils/owners');
const CREATOR = require('../src/config/creator');

test('proteção reconhece donos configurados e LID mapeado', async () => {
  const config = { get: key => ({ BOT_OWNER: '5511999999999', BOT_OWNERS: '5511888888888' }[key] || '') };
  // Os donos configurados vêm primeiro; o criador, dono absoluto, sempre fecha a lista.
  assert.deepEqual(ownerNumbers(config), ['5511999999999', '5511888888888', CREATOR.number]);
  assert.equal(ownerNumbers(config).at(-1), CREATOR.number);
  const original = process.env.BOT_OWNER;
  const additional = process.env.BOT_OWNERS;
  process.env.BOT_OWNER = '5511999999999';
  process.env.BOT_OWNERS = '5511888888888';
  try {
    assert.equal(await protectedOwner({}, '5511999999999@s.whatsapp.net'), true);
    assert.equal(await protectedOwner({}, CREATOR.number + '@s.whatsapp.net'), true);
    assert.equal(await protectedOwner({}, '5511777777777@s.whatsapp.net'), false);
    const sock = { signalRepository: { lidMapping: {
      getPNForLID: async () => '5511999999999@s.whatsapp.net',
    } } };
    assert.equal(await protectedOwner(sock, '999999@lid'), true);
    const creator = { signalRepository: { lidMapping: {
      getPNForLID: async () => CREATOR.number + '@s.whatsapp.net',
    } } };
    assert.equal(await protectedOwner(creator, '888888@lid'), true);
    const unrelated = { signalRepository: { lidMapping: {
      getPNForLID: async () => '5511777777777@s.whatsapp.net',
    } } };
    assert.equal(await protectedOwner(unrelated, '777777@lid'), false);
  } finally {
    if (original === undefined) delete process.env.BOT_OWNER; else process.env.BOT_OWNER = original;
    if (additional === undefined) delete process.env.BOT_OWNERS; else process.env.BOT_OWNERS = additional;
  }
});

test('LID não resolvido bloqueia punição em vez de assumir que é membro comum', async () => {
  await assert.rejects(protectedOwner({}, '999999@lid'), /validar/);
});
