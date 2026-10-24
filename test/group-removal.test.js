'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const isolation = require('../src/isolation/context');
const { createSecurity } = require('../src/security/groups/service');
const { createRemovalCommand, createUnbanCommand } = require('../src/commands/group-removal');
const G = '12000001@g.us', H = '12000002@g.us';
const OWNER = '5543920030769@s.whatsapp.net', ADMIN = '5511991111111@s.whatsapp.net';
const MEMBER = '5511992222222@s.whatsapp.net', BOT = '5511993333333@s.whatsapp.net', LID = '778899@lid';
function fixture(t, { lid = false, status = '200', stay = false, response, botAdmin = true } = {}) {
  const raw = new Database(':memory:'); runMigrations(raw); t.after(() => raw.close());
  const db = createScopedDatabase(raw);
  const database = { db,
    getUser: id => db.prepare('SELECT * FROM users WHERE jid=?').get(id),
    upsertUser: (id, name) => db.prepare('INSERT INTO users(jid,name) VALUES(?,?) ON CONFLICT(jid) DO UPDATE SET name=excluded.name').run(id, name),
    setBanned: (id, state) => db.prepare('UPDATE users SET banned=? WHERE jid=?').run(state, id),
  };
  const meta = { id: G, owner: OWNER, participants: [
    { id: OWNER, admin: 'superadmin' }, { id: ADMIN, admin: 'admin' },
    { id: lid ? LID : MEMBER, phoneNumber: MEMBER, admin: null },
    { id: BOT, admin: botAdmin ? 'admin' : null },
  ] };
  const calls = [], sent = [], logs = [];
  const sock = { user: { id: BOT },
    groupMetadata: async group => ({ ...structuredClone(meta), id: group }),
    signalRepository: { lidMapping: { getPNForLID: async id => id === LID ? MEMBER : null } },
    groupParticipantsUpdate: async (group, ids, action) => {
      calls.push({ group, ids, action });
      if (status === '200' && !stay && !response) meta.participants = meta.participants.filter(p => !ids.includes(p.id));
      return response ? response(ids) : ids.map(jid => ({ jid, status }));
    },
    sendMessage: async (group, content) => { sent.push({ group, ...content }); return { key: { id: 'reply' } }; },
  };
  const service = createSecurity({ db, owners: () => [OWNER.split('@')[0]], botAdmin: () => false, wait: async () => {} });
  const ctx = (sender = ADMIN, target = MEMBER, group = G) => ({ jid: group, isGroup: true, sender, command: 'ban', args: [], msg: {
    key: { remoteJid: group, participant: sender, id: 'command' },
    message: { extendedTextMessage: { text: '!ban @alvo', contextInfo: { mentionedJid: target ? [target] : [] } } },
  } });
  const deps = { service, database, prefix: '!', log: { error: data => logs.push(data) } };
  return { raw, db, database, service, meta, sock, ctx, calls, sent, logs, deps,
    ban: createRemovalCommand('ban', deps), kick: createRemovalCommand('kick', deps), unban: createUnbanCommand(deps),
    user: (id, group = G) => isolation.run(group, () => database.getUser(id)),
  };
}
test('ban removes the real participant then persists a previously unseen user and confirms success', async t => {
  const f = fixture(t); assert.equal(f.user(MEMBER), undefined);
  await f.ban(f.sock, f.ctx());
  assert.deepEqual(f.calls, [{ group: G, ids: [MEMBER], action: 'remove' }]);
  assert.equal(f.meta.participants.some(p => p.id === MEMBER), false);
  assert.equal(f.user(MEMBER).banned, 1);
  assert.match(f.sent.at(-1).text, /BANIMENTO CONCLUÍDO/);
  assert.equal(f.service.store.audits(G)[0].action, 'BOT_BAN');
});
test('ban resolves phone mention to the actual LID and persists both verified aliases', async t => {
  const f = fixture(t, { lid: true }); await f.ban(f.sock, f.ctx());
  assert.deepEqual(f.calls[0].ids, [LID]);
  assert.equal(f.user(MEMBER).banned, 1); assert.equal(f.user(LID).banned, 1);
  await f.unban(f.sock, f.ctx(ADMIN, LID));
  assert.equal(f.user(MEMBER).banned, 0); assert.equal(f.user(LID).banned, 0);
  assert.equal(f.calls.length, 1); assert.match(f.sent.at(-1).text, /não readiciona/);
});
for (const [name, response] of [
  ['403', ids => ids.map(jid => ({ jid, status: '403' }))],
  ['404', ids => ids.map(jid => ({ jid, status: '404' }))],
  ['empty', () => []], ['undefined', () => undefined],
  ['missing status', ids => ids.map(jid => ({ jid }))],
  ['wrong target', () => [{ jid: OWNER, status: '200' }]],
]) test(`ban does not persist or claim success for ${name} response`, async t => {
  const f = fixture(t, { response }); await f.ban(f.sock, f.ctx());
  assert.equal(f.user(MEMBER)?.banned || 0, 0);
  assert.doesNotMatch(f.sent.at(-1).text, /BANIMENTO CONCLUÍDO/);
  assert.match(f.sent.at(-1).text, /NÃO CONFIRMADA/);
  assert.ok(f.service.store.audits(G).every(row => row.result !== 'COMMAND_APPLIED' && row.action !== 'BOT_BAN'));
});
test('server acknowledgement without actual membership removal never produces a false success', async t => {
  const f = fixture(t, { stay: true }); await f.ban(f.sock, f.ctx());
  assert.equal(f.user(MEMBER)?.banned || 0, 0);
  assert.match(f.sent.at(-1).text, /saída do participante ainda não foi confirmada/);
});
test('invalid metadata after acknowledgement cannot prove a removal', async t => {
  const f = fixture(t); const original = f.sock.groupMetadata;
  f.sock.groupMetadata = async group => f.calls.length ? { id: group, participants: [] } : original(group);
  await f.ban(f.sock, f.ctx()); assert.equal(f.user(MEMBER), undefined);
  assert.doesNotMatch(f.sent.at(-1).text, /BANIMENTO CONCLUÍDO/);
});
for (const [name, sender, target, options] of [
  ['non-admin sender', MEMBER, ADMIN, {}], ['global owner', ADMIN, OWNER, {}],
  ['bot itself', OWNER, BOT, {}], ['bot without admin', ADMIN, MEMBER, { botAdmin: false }],
  ['absent target', ADMIN, '5511888888888@s.whatsapp.net', {}],
]) test(`ban refuses ${name} before contacting participant API`, async t => {
  const f = fixture(t, options); await f.ban(f.sock, f.ctx(sender, target));
  assert.equal(f.calls.length, 0); assert.doesNotMatch(f.sent.at(-1).text, /BANIMENTO CONCLUÍDO/);
});
test('ban accepts reply targeting through a wrapped message', async t => {
  const f = fixture(t), ctx = f.ctx();
  ctx.msg.message = { ephemeralMessage: { message: { extendedTextMessage: { text: '!ban', contextInfo: { participant: MEMBER, quotedMessage: { conversation: 'alvo' } } } } } };
  await f.ban(f.sock, ctx); assert.deepEqual(f.calls[0].ids, [MEMBER]);
});
test('kick shares verified removal but never blocks commands', async t => {
  const f = fixture(t); await f.kick(f.sock, f.ctx());
  assert.equal(f.user(MEMBER), undefined); assert.match(f.sent.at(-1).text, /REMOÇÃO CONCLUÍDA/);
});
test('ban preserves profile and wallet and stays isolated from other groups', async t => {
  const f = fixture(t);
  for (const group of [G, H]) isolation.run(group, () => {
    f.database.upsertUser(MEMBER, 'Nome existente');
    f.db.prepare('UPDATE users SET gold=123,xp=456 WHERE jid=?').run(MEMBER);
  });
  await f.ban(f.sock, f.ctx());
  assert.equal(f.user(MEMBER).name, 'Nome existente'); assert.equal(f.user(MEMBER).gold, 123); assert.equal(f.user(MEMBER).xp, 456);
  assert.equal(f.user(MEMBER).banned, 1); assert.equal(f.user(MEMBER, H).banned, 0);
});
test('DB failure after removal reports partial result and rolls back internal ban', async t => {
  const f = fixture(t, { lid: true }); isolation.run(G, () => {
    f.database.upsertUser(MEMBER, 'Nome');
    f.db.exec("CREATE TRIGGER fail_saved_ban BEFORE UPDATE OF banned ON users BEGIN SELECT RAISE(ABORT,'fixture'); END");
  });
  await f.ban(f.sock, f.ctx());
  assert.equal(f.meta.participants.some(p => p.id === LID), false);
  assert.equal(f.user(MEMBER).banned, 0); assert.equal(f.user(LID), undefined);
  assert.match(f.sent.at(-1).text, /REMOÇÃO CONCLUÍDA COM RESSALVA/); assert.match(f.sent.at(-1).text, /não pôde ser salvo/);
});
test('failed confirmation message cannot undo an acknowledged removal or persisted ban', async t => {
  const f = fixture(t); f.sock.sendMessage = async () => { throw Error('transport failed'); };
  await assert.rejects(f.ban(f.sock, f.ctx()), /transport failed/);
  assert.equal(f.user(MEMBER).banned, 1); assert.equal(f.calls.length, 1);
});
