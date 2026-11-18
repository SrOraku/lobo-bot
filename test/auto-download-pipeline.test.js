'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAutoDownload } = require('../src/handlers/autoDownload');
const rules = require('../src/activations/message-rules');

const LINK = 'https://www.instagram.com/reel/ABC/';
const CHAT = '123@g.us';
const SENDER = '5511999999999@s.whatsapp.net';

function fixture(prefix = '$$') {
  const state = { user: {}, antiLink: false, active: true, enabled: true, configured: true };
  const steps = [], downloads = [], commands = [], sent = [], errors = [];
  const sock = { sendMessage: async (jid, payload, options) => sent.push({ jid, payload, options }) };
  const automatic = createAutoDownload({
    prefix: () => prefix,
    enabled: () => state.enabled,
    active: () => state.active,
    configured: () => state.configured,
    dispatch: async (connection, ctx, definition) => {
      steps.push('download');
      downloads.push({ ctx, definition });
      // This is the transport boundary: the actual message pipeline and actual
      // automatic detector choose what would be sent to the provider.
      await connection.sendMessage(ctx.jid, { image: Buffer.from('downloaded image') }, { quoted: ctx.msg });
      return { ok: true, mediaCount: 1 };
    },
  });
  const mocks = {
    dotenv: { config() {} },
    '../utils/helpers': {
      cleanJid: value => value, getNumber: value => value.split('@')[0], PREFIX: prefix,
      BOT_NAME: 'Lobo', logger: { error: (...args) => errors.push(args) },
    },
    '../utils/database': {
      upsertUser() {}, getUser: () => state.user, upsertActivity() {}, upsertGroup() {},
      getGroup: () => ({ name: 'Grupo de teste' }),
    },
    '../core/eventBus': { bus: { emit() {} }, EVENTS: {} },
    '../core/commandRegistry': { execute: async (name, connection, ctx) => commands.push({ name, ctx }) },
    './protection': { handleProtection: async (connection, msg, ctx) => {
      steps.push('protection');
      // Keep the real filter decision while isolating permissions/WhatsApp
      // administration from this download integration test.
      const blocked = rules.matchingFeatures(rules.inspect(msg.message), ctx.body,
        feature => state.antiLink && feature === 'antilink');
      if (!blocked.length) return false;
      await connection.sendMessage(ctx.jid, { delete: msg.key });
      return true;
    } },
    './autoDownload': { handleAutoDownload: automatic.handle },
    './autoReply': { handleAutoReply: async () => steps.push('reply') },
    './xp': { handleXP: async () => steps.push('xp') },
    '../activations/message-rules': rules,
    '../automation/anti-pv': { createAntiPV: () => ({ handle: async () => false }) },
    '../services/universal-currency': { linkMessageWallet: async () => {} },
    '../games/gartic': { gartic: () => ({ guess: async () => null }) },
    '../progression/service': { progression: () => ({ touch() {}, refresh: () => [] }) },
    '../isolation/context': { run: (chat, callback) => callback() },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/handlers/message.js'), 'utf8'), {
    module, require: name => {
      if (!Object.hasOwn(mocks, name)) throw Error('Unexpected dependency: ' + name);
      return mocks[name];
    },
  });
  const message = (body, id = 'message', key = {}) => ({
    key: { id, remoteJid: CHAT, participant: SENDER, ...key },
    pushName: 'Jogador', message: body,
  });
  const run = msg => module.exports.handleMessage(sock, msg);
  return { state, steps, downloads, commands, sent, errors, automatic, sock, message, run };
}

test('real automatic detector receives text and wrapped captions from the message pipeline', async () => {
  const bodies = [
    { conversation: 'Confira ' + LINK },
    { extendedTextMessage: { text: LINK, matchedText: LINK } },
    { imageMessage: { caption: LINK } },
    { videoMessage: { caption: LINK } },
    { ephemeralMessage: { message: { imageMessage: { caption: LINK } } } },
    { ephemeralMessage: { message: { viewOnceMessageV2: { message: { videoMessage: { caption: LINK } } } } } },
  ];
  for (const body of bodies) {
    const f = fixture(), msg = f.message(body);
    await f.run(msg);
    assert.equal(f.downloads.length, 1, JSON.stringify(body));
    const { ctx, definition } = f.downloads[0];
    assert.equal(definition.name, 'instagram');
    assert.deepEqual(ctx.args, [LINK]);
    assert.equal(ctx.command, 'instagram');
    assert.equal(ctx.autoDownload, true);
    assert.equal(ctx.sender, SENDER);
    assert.equal(ctx.jid, CHAT);
    assert.equal(ctx.msg, msg);
    assert.deepEqual(f.steps, ['protection', 'xp', 'download']);
    const media = f.sent.find(item => item.payload.image);
    assert.equal(media.options.quoted, msg);
    assert.equal(media.payload.image.toString(), 'downloaded image');
    assert.deepEqual(f.sent.filter(item => item.payload.react).map(item => item.payload.react.text), ['⏳', '✅']);
    assert.ok(f.sent.indexOf(media) > f.sent.findIndex(item => item.payload.react?.text === '⏳'));
    assert.ok(f.sent.indexOf(media) < f.sent.findIndex(item => item.payload.react?.text === '✅'));
    assert.deepEqual(f.errors, []);
  }
});

test('custom-prefix commands in plain or wrapped captions never become automatic downloads', async () => {
  for (const body of [
    { conversation: '$$instagram ' + LINK },
    { ephemeralMessage: { message: { imageMessage: { caption: '$$instagram ' + LINK } } } },
  ]) {
    const f = fixture();
    await f.run(f.message(body));
    assert.equal(f.downloads.length, 0);
    assert.equal(f.commands.length, 1);
    assert.equal(f.commands[0].name, 'instagram');
    assert.equal(f.commands[0].ctx.args.join(' '), LINK);
    assert.equal(f.automatic.entries.size, 0);
    assert.deepEqual(f.errors, []);
  }
});

test('AntiLink consumes a wrapped link before provider dispatch or automatic deduplication', async () => {
  const f = fixture();
  const msg = f.message({ ephemeralMessage: { message: { videoMessage: { caption: LINK } } } });
  f.state.antiLink = true;
  await f.run(msg);
  assert.equal(f.downloads.length, 0);
  assert.deepEqual(f.steps, ['protection']);
  assert.equal(f.sent[0].payload.delete, msg.key);
  assert.equal(f.automatic.entries.size, 0);

  // A subsequent explicit retry after the admin disables AntiLink has not been
  // poisoned by deduplication of the previously blocked message.
  f.state.antiLink = false;
  await f.run(msg);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.downloads[0].ctx.args[0], LINK);
  assert.deepEqual(f.errors, []);
});

test('muted, banned and private messages never dispatch a provider download', async () => {
  for (const options of [{ user: { muted: 1 } }, { user: { banned: 1 } }, { private: true }]) {
    const f = fixture();
    if (options.user) f.state.user = options.user;
    await f.run(f.message({ imageMessage: { caption: LINK } }, 'restricted',
      options.private ? { remoteJid: SENDER } : {}));
    assert.equal(f.downloads.length, 0);
    assert.equal(f.automatic.entries.size, 0);
    assert.deepEqual(f.errors, []);
  }
});

test('paused, disabled or unconfigured automatic service stays idle through the pipeline', async () => {
  for (const flag of ['active', 'enabled', 'configured']) {
    const f = fixture(); f.state[flag] = false;
    await f.run(f.message({ conversation: LINK }));
    assert.equal(f.downloads.length, 0, flag);
    assert.equal(f.automatic.entries.size, 0, flag);
    assert.deepEqual(f.errors, []);
  }
});

test('bot-originated media cannot loop back into automatic downloads', async () => {
  const f = fixture(), msg = f.message({ imageMessage: { caption: LINK } }, 'own', { fromMe: true });
  // The message handler has an additional owner-authenticated fromMe gate.
  // Exercise the download guard directly to avoid replacing that identity gate.
  const handled = await f.automatic.handle(f.sock, msg, {
    jid: CHAT, sender: SENDER, isGroup: true, body: LINK, user: {},
  });
  assert.equal(handled, false);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.automatic.entries.size, 0);
});
