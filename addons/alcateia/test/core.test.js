import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BOT_NAME, loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { IdentityResolver, normalizeJid, phoneJid } from '../src/identity.js';
import { ChatQueue, Deduplicator, contextOf, parseCommand, textOf } from '../src/messages.js';

const OWNER = '5543920030769@s.whatsapp.net';
const BOT = '5511999999999@s.whatsapp.net';
const GROUP = '120363000000000000@g.us';

function socket({ user = { id: BOT }, mappings = {} } = {}) {
  return {
    user,
    signalRepository: { lidMapping: { async getPNForLID(id) { return mappings[id] ?? null; } } },
  };
}

test('configuration keeps owner and connected account numbers independent', () => {
  const config = loadConfig({ PAIRING_NUMBER: '+55 (11) 99999-9999' });
  assert.equal(config.botName, BOT_NAME);
  assert.equal(config.ownerJid, OWNER);
  assert.equal(config.pairingNumber, '5511999999999');
  assert.notEqual(config.ownerNumber, config.pairingNumber);
  assert.throws(() => loadConfig({ OWNER_NUMBER: '123' }), /OWNER_NUMBER/);
  assert.throws(() => loadConfig({ PREFIX: '! ' }), /PREFIX/);
});

test('device JIDs and old contact domain normalize, LID never becomes a phone number', () => {
  assert.equal(normalizeJid('5543920030769:12@s.whatsapp.net'), OWNER);
  assert.equal(normalizeJid('5543920030769@c.us'), OWNER);
  assert.equal(normalizeJid('882233:4@lid'), '882233@lid');
  assert.equal(phoneJid('5543920030769@lid'), null);
  assert.equal(normalizeJid(GROUP), null);
  assert.equal(normalizeJid('malformed@s.whatsapp.net'), null);
  assert.equal(normalizeJid(undefined), null);
});

test('LID matching owner digits without trusted mapping has no owner privilege', async () => {
  const resolver = new IdentityResolver(socket(), OWNER, {
    participants: [{ id: '5543920030769@lid', admin: null }],
  });
  const impersonator = await resolver.member('5543920030769@lid');
  assert.equal(impersonator.phoneNumber, null);
  assert.equal(impersonator.isOwner, false);
  assert.equal(impersonator.isAdmin, false);
  assert.equal(await resolver.same('5543920030769@lid', OWNER), false);
});

test('owner LID resolves through trusted participant phone metadata', async () => {
  const resolver = new IdentityResolver(socket(), OWNER, {
    participants: [{ id: '882233@lid', phoneNumber: OWNER, admin: null }],
  });
  const owner = await resolver.member('882233:9@lid');
  assert.equal(owner.isOwner, true);
  assert.equal(owner.phoneNumber, OWNER);
  assert.equal(owner.isAdmin, false);
  assert.equal(owner.inGroup, true);
  assert.equal(await resolver.same('882233@lid', OWNER), true);
});

test('owner LID resolves through trusted Signal mapping when metadata lacks phone number', async () => {
  const resolver = new IdentityResolver(socket({ mappings: { '882233@lid': OWNER } }), OWNER, {
    participants: [{ id: '882233@lid', admin: 'admin' }],
  });
  const owner = await resolver.member(OWNER);
  assert.equal(owner.isOwner, true);
  assert.equal(owner.isAdmin, true);
  assert.equal(owner.jid, '882233@lid');
  assert.equal(owner.inGroup, true);
});

test('failed identity mapping does not elevate unresolved sender or reject processing', async () => {
  const sock = socket();
  sock.signalRepository.lidMapping.getPNForLID = async () => { throw new Error('offline'); };
  const resolver = new IdentityResolver(sock, OWNER);
  const sender = await resolver.member('998877@lid');
  assert.equal(sender.isOwner, false);
  assert.equal(sender.phoneNumber, null);
  assert.equal(sender.inGroup, false);
});

test('connected bot account is protected without receiving owner privilege', async () => {
  const resolver = new IdentityResolver(socket({ user: { id: BOT, lid: '998877@lid' } }), OWNER, {
    participants: [{ id: '998877@lid', admin: 'admin' }],
  });
  const connected = await resolver.member('998877@lid');
  assert.equal(connected.isBot, true);
  assert.equal(connected.isAdmin, true);
  assert.equal(connected.isOwner, false);
  assert.equal(connected.phoneNumber, BOT);
});

test('admin and group creator flags come from group metadata', async () => {
  const creatorPN = '5511888888888@s.whatsapp.net';
  const resolver = new IdentityResolver(socket(), OWNER, {
    owner: '777777@lid', ownerPn: creatorPN,
    participants: [
      { id: '777777@lid', admin: 'superadmin' },
      { id: '666666@lid', phoneNumber: '5511777777777@s.whatsapp.net', admin: 'admin' },
      { id: '555555@lid', admin: null, notify: 'Dono' },
    ],
  });
  const creator = await resolver.member(creatorPN);
  const admin = await resolver.member('666666@lid');
  const ordinary = await resolver.member('555555@lid');
  assert.equal(creator.isGroupOwner, true);
  assert.equal(creator.isAdmin, true);
  assert.equal(admin.isAdmin, true);
  assert.equal(admin.isGroupOwner, false);
  assert.equal(ordinary.isAdmin, false);
  assert.equal(ordinary.isOwner, false);
});

test('store survives restart with independent per-group moderation counters', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data', 'database.json');
  const store = new Store(file);
  const group = store.group(GROUP);
  assert.equal(group.enabled, true);
  assert.equal(group.antilink, false);
  assert.equal(group.antiflood, false);
  group.warnings[OWNER] = 2;
  group.rules = 'Respeite todos.';
  group.antilink = true;
  const other = store.group('120363000000000001@g.us');
  assert.notEqual(group.warnings, other.warnings);
  assert.equal(other.warnings[OWNER], undefined);
  store.save();
  const restored = new Store(file);
  assert.equal(restored.group(GROUP).warnings[OWNER], 2);
  assert.equal(restored.group(GROUP).rules, 'Respeite todos.');
  assert.equal(restored.group(GROUP).antilink, true);
  assert.equal(restored.groups().length, 2);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.throws(() => restored.group(OWNER), /grupo/);
});

test('invalid database is rejected without being overwritten', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-invalid-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'database.json');
  const malformed = '{"version":1,"groups":';
  fs.writeFileSync(file, malformed);
  assert.throws(() => new Store(file), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), malformed);
  fs.writeFileSync(file, '{"version":2,"groups":{}}');
  assert.throws(() => new Store(file), /Banco de dados inválido/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"version":2,"groups":{}}');
});

test('command parser respects multi-character prefix and preserves argument text', () => {
  assert.deepEqual(parseCommand('!!NoMe Meu grupo 🐺', '!!'), {
    command: 'nome', args: ['Meu', 'grupo', '🐺'], argText: 'Meu grupo 🐺',
  });
  assert.equal(parseCommand('!nome outro', '!!'), null);
  assert.equal(parseCommand('mensagem !!menu', '!!'), null);
  assert.equal(parseCommand('!!   ', '!!'), null);
});

test('text and quote extraction handle wrapped media without treating text as sender identity', () => {
  const msg = {
    message: {
      ephemeralMessage: { message: {
        imageMessage: { caption: '!apagar', contextInfo: { stanzaId: 'quoted-1', participant: OWNER } },
      } },
    },
  };
  assert.equal(textOf(msg), '!apagar');
  assert.equal(contextOf(msg).stanzaId, 'quoted-1');
  assert.equal(contextOf(msg).participant, OWNER);
});

test('dedup suppresses redelivery but accepts same ID in a different chat and after expiry', () => {
  const dedup = new Deduplicator({ ttl: 1_000, max: 2 });
  assert.equal(dedup.accept(`${GROUP}:id-1`, 100), true);
  assert.equal(dedup.accept(`${GROUP}:id-1`, 200), false);
  assert.equal(dedup.accept('other-group:id-1', 200), true);
  assert.equal(dedup.accept(`${GROUP}:id-1`, 1_101), true);
  assert.equal(dedup.accept('third-group:id-2', 1_102), true);
  assert.equal(dedup.seen.size, 2);
});

test('chat queue serializes warnings in a group while allowing another group to proceed', async () => {
  const queue = new ChatQueue();
  const events = [];
  let releaseFirst;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const first = queue.run(GROUP, async () => {
    events.push('first-start');
    markStarted();
    await firstGate;
    events.push('first-end');
  });
  const second = queue.run(GROUP, async () => { events.push('second'); });
  await started;
  await queue.run('other-group', async () => { events.push('other'); });
  assert.deepEqual(events, ['first-start', 'other']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first-start', 'other', 'first-end', 'second']);
  assert.equal(queue.queues.size, 0);
});

test('chat queue recovers from a command failure before processing the next message', async () => {
  const queue = new ChatQueue();
  const failed = queue.run(GROUP, async () => { throw new Error('WhatsApp indisponível'); });
  const recovered = queue.run(GROUP, async () => 'próxima mensagem');
  await assert.rejects(failed, /indisponível/);
  assert.equal(await recovered, 'próxima mensagem');
  assert.equal(queue.queues.size, 0);
});
