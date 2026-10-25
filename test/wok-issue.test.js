'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWokIssueCommand } = require('../src/commands/wok-donation');
const { applyDonation } = require('../src/security/wok-donation');

const OWNER = '5543920030769@s.whatsapp.net';
const TARGET = '5511999999999@s.whatsapp.net';
const OTHER = '5511888888888@s.whatsapp.net';
const LID = '778899@lid';
const GROUP = '120000@g.us';
function fixture({ command = 'addwok', actor = { owner: true, phone: OWNER },
  target = { jid: LID, phoneNumber: TARGET, aliases: [LID, TARGET, LID], inGroup: true, name: 'Lobo alvo' },
  result = { amount: 1000, after: 1500 }, error } = {}) {
  const sent = [], calls = [], logs = [], resolved = [];
  const ctx = { jid: GROUP, isGroup: true, sender: OWNER, PREFIX: '!!', args: ['1000', '@5511999999999'],
    msg: { key: { remoteJid: GROUP, participant: OWNER, id: 'message-1' },
      message: { extendedTextMessage: { contextInfo: { mentionedJid: [TARGET] } } } },
  };
  const sock = { sendMessage: async (chat, content) => { sent.push({ chat, ...content }); return {}; } };
  const handler = createWokIssueCommand(command, {
    resolveActor: async () => actor,
    resolveTarget: async (_sock, _ctx, mention) => { resolved.push(mention); return target; },
    issue: async request => { calls.push(request); if (error) throw error; return result; },
    log: { error: data => logs.push(data) },
  });
  return { handler, ctx, sock, sent, calls, logs, resolved };
}

for (const command of ['addwok', 'doarwok']) {
  for (const order of ['amount-first', 'mention-first']) {
    test(`${command} accepts ${order} arguments and delegates one mint without sender debit`, async () => {
      const f = fixture({ command });
      if (order === 'mention-first') f.ctx.args.reverse();
      await f.handler(f.sock, f.ctx);
      assert.equal(f.calls.length, 1);
      assert.deepEqual(f.calls[0], { chat: GROUP, actor: OWNER, target: TARGET,
        targetAliases: [LID, TARGET], targetName: 'Lobo alvo', amount: 1000,
        event: 'message-1', source: command });
      assert.equal(Object.hasOwn(f.calls[0], 'debit'), false);
      assert.match(f.sent.at(-1).text, /Emissão concluída/);
      assert.match(f.sent.at(-1).text, /saldo do dono não é descontado/);
      assert.deepEqual(f.sent.at(-1).mentions, [LID]);
    });
  }
}

test('registered owner proof is required even when the WhatsApp context claims owner roles', async () => {
  const f = fixture({ actor: { owner: false, phone: OTHER } });
  Object.assign(f.ctx, { owner: true, isOwner: true, senderLevel: 99 });
  await f.handler(f.sock, f.ctx);
  assert.equal(f.calls.length, 0); assert.equal(f.resolved.length, 0);
  assert.match(f.sent.at(-1).text, /Somente donos cadastrados/);
});

test('owner flag without a verified phone cannot mint coins', async () => {
  const f = fixture({ actor: { owner: true, phone: null } });
  await f.handler(f.sock, f.ctx);
  assert.equal(f.calls.length, 0); assert.match(f.sent.at(-1).text, /Somente donos cadastrados/);
});

for (const amount of ['1', '1000000']) test(`command accepts inclusive safe amount ${amount}`, async () => {
  const f = fixture(); f.ctx.args[0] = amount;
  await f.handler(f.sock, f.ctx); assert.equal(f.calls[0].amount, Number(amount));
});

for (const amount of ['0', '-1', '1.5', '1e3', '1000001', '9007199254740992', 'NaN', 'Infinity']) {
  test(`command rejects invalid amount ${amount} before resolving or mutating a recipient`, async () => {
    const f = fixture(); f.ctx.args[0] = amount;
    await f.handler(f.sock, f.ctx);
    assert.equal(f.calls.length, 0); assert.equal(f.resolved.length, 0);
    assert.match(f.sent.at(-1).text, /1 a 1000000/);
    assert.match(f.sent.at(-1).text, /!!addwok/);
  });
}

for (const mentions of [[], [TARGET, OTHER]]) test(`command requires exactly one mention (${mentions.length} supplied)`, async () => {
  const f = fixture(); f.ctx.msg.message.extendedTextMessage.contextInfo.mentionedJid = mentions;
  await f.handler(f.sock, f.ctx); assert.equal(f.calls.length, 0); assert.equal(f.resolved.length, 0);
});

test('extra numeric arguments cannot be silently ignored', async () => {
  const f = fixture(); f.ctx.args.push('2000'); await f.handler(f.sock, f.ctx);
  assert.equal(f.calls.length, 0);
});

for (const [name, target] of [
  ['unresolved identity', { jid: LID, phoneNumber: null, inGroup: true }],
  ['absent group participant', { jid: TARGET, phoneNumber: TARGET, inGroup: false }],
  ['missing target', null],
]) test(`command rejects ${name}`, async () => {
  const f = fixture({ target }); await f.handler(f.sock, f.ctx);
  assert.equal(f.calls.length, 0); assert.match(f.sent.at(-1).text, /número confirmado/);
});

test('forged chat context never moves issuance into a different group', async () => {
  const f = fixture(); f.ctx.jid = '120001@g.us'; await f.handler(f.sock, f.ctx);
  assert.equal(f.calls.length, 0); assert.equal(f.resolved.length, 0);
  assert.match(f.sent.at(-1).text, /confirmar o chat/);
});

test('duplicate receipt is presented as already processed with the original post-operation balance', async () => {
  const f = fixture({ result: { amount: 1000, after: 1500, duplicate: true } });
  await f.handler(f.sock, f.ctx);
  assert.match(f.sent.at(-1).text, /Emissão já processada/);
  assert.ok(f.sent.at(-1).text.includes('*Carteira após essa operação:* `1500`'));
});

test('known issuance validation is readable without claiming success', async () => {
  const f = fixture({ error: Object.assign(Error('Saldo excede o limite permitido.'), { code: 'WOK_ISSUE_INVALID' }) });
  await f.handler(f.sock, f.ctx);
  assert.match(f.sent.at(-1).text, /Saldo excede o limite/);
  assert.doesNotMatch(f.sent.at(-1).text, /Emissão concluída/); assert.equal(f.logs.length, 0);
});

test('unexpected service failure does not leak private message or raw SQL details', async () => {
  const f = fixture({ error: Object.assign(Error('private-path?token=SECRET SQLITE internals'), { code: 'SQLITE_IOERR' }) });
  await f.handler(f.sock, f.ctx);
  assert.match(f.sent.at(-1).text, /Não foi possível concluir a emissão/);
  assert.ok(!JSON.stringify([f.sent, f.logs]).includes('SECRET'));
  assert.equal(f.logs[0].code, 'SQLITE_IOERR'); assert.equal(f.calls.length, 1);
});

test('reply failure after a committed issuance is propagated without retrying or relabeling the operation', async () => {
  const f = fixture(); f.sock.sendMessage = async () => { throw Error('reply delivery failed'); };
  await assert.rejects(f.handler(f.sock, f.ctx), /reply delivery failed/);
  assert.equal(f.calls.length, 1); assert.equal(f.logs.length, 0);
});

function game() { return { players: { [OWNER]: { coins: 750, banned: false }, [TARGET]: { coins: 100, banned: false } }, donations: {} }; }
const request = { actor: OWNER, target: TARGET, amount: 50, event: 'grant-1', source: 'addwok', now: 123456 };
const owners = [OWNER.split('@')[0]];

test('real issuance creates coins only for target and saves the complete audit receipt', () => {
  const state = game(); const result = applyDonation(state, request, owners);
  assert.equal(state.players[OWNER].coins, 750); assert.equal(state.players[TARGET].coins, 150);
  assert.deepEqual(result, { actor: OWNER, target: TARGET, amount: 50, before: 100, after: 150, at: 123456, source: 'addwok' });
  assert.deepEqual(state.donations[OWNER + ':grant-1'], result);
});

test('prepareTarget runs only after all authorization and argument checks', () => {
  const invalid = [
    [{ ...request, actor: OTHER }, owners], [{ ...request, actor: OWNER.replace('@s.whatsapp.net', '@lid') }, owners],
    [{ ...request, target: LID }, owners], [{ ...request, amount: 0 }, owners],
    [{ ...request, amount: 1000001 }, owners], [{ ...request, amount: 1.5 }, owners],
    [{ ...request, event: '' }, owners], [{ ...request, event: 'a'.repeat(201) }, owners],
    [request, []],
  ];
  for (const [input, configured] of invalid) {
    const state = game(), before = structuredClone(state);
    assert.throws(() => applyDonation(state, input, configured, { prepareTarget: () => assert.fail('must not prepare invalid target') }), { code: 'WOK_ISSUE_INVALID' });
    assert.deepEqual(state, before);
  }
});

test('recipient preparation can preserve an existing universal balance before minting', () => {
  const state = { players: {}, donations: {} }; let prepared = 0;
  const result = applyDonation(state, request, owners, { prepareTarget: (draft, target, now) => {
    prepared++; assert.equal(draft, state); assert.equal(target, TARGET); assert.equal(now, request.now);
    return draft.players[target] = { coins: 900, banned: false };
  } });
  assert.equal(prepared, 1); assert.equal(result.before, 900); assert.equal(result.after, 950);
});

test('an exact duplicate is idempotent and never invokes recipient preparation again', () => {
  const state = game(); applyDonation(state, request, owners);
  const result = applyDonation(state, request, owners, { prepareTarget: () => assert.fail('duplicate preparation') });
  assert.equal(result.duplicate, true); assert.equal(state.players[TARGET].coins, 150); assert.equal(state.players[OWNER].coins, 750);
});

test('reuse of a message ID for a different target or amount is rejected before preparation', () => {
  const state = game(); applyDonation(state, request, owners); const before = structuredClone(state);
  for (const input of [{ ...request, target: OTHER }, { ...request, amount: 51 }])
    assert.throws(() => applyDonation(state, input, owners, { prepareTarget: () => assert.fail('conflicting preparation') }), { code: 'WOK_ISSUE_INVALID' });
  assert.deepEqual(state, before); assert.equal(state.players[OTHER], undefined);
});

for (const [name, target] of [
  ['absent player', undefined], ['banned player', { coins: 100, banned: true }],
  ['negative balance', { coins: -1, banned: false }], ['unsafe balance', { coins: Number.MAX_SAFE_INTEGER, banned: false }],
  ['non-numeric balance', { coins: NaN, banned: false }],
]) test(`real issuance rejects ${name} without touching balances or audit`, () => {
  const state = game(); if (target) state.players[TARGET] = target; else delete state.players[TARGET];
  const before = structuredClone(state);
  assert.throws(() => applyDonation(state, request, owners), { code: 'WOK_ISSUE_INVALID' });
  assert.deepEqual(state, before);
});

test('legacy donation source and balance semantics remain compatible', () => {
  const state = game(); const legacy = { ...request }; delete legacy.source;
  assert.equal(applyDonation(state, legacy, owners).source, 'doarwok');
  assert.equal(state.players[OWNER].coins, 750); assert.equal(state.players[TARGET].coins, 150);
});
