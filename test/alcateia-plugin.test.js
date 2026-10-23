'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createPlugin, createAdapter } = require('../plugins/alcateia-rp');

const OWNER = '5543920030769@s.whatsapp.net';
const SECOND_OWNER = '5543996375955@s.whatsapp.net';
const MEMBER = '5511777777777@s.whatsapp.net';
const MEMBER_LID = '700000@lid';
const OWNER_LID = '900000@lid';
const BOT = '5511999999999@s.whatsapp.net';
const GROUP = '120363000000000000@g.us';
const NOW = 1_800_000_000_000;
let modulePromise;

function realModules() {
  if (!modulePromise) modulePromise = Promise.all([
    'store.js', 'game/service.js', 'game/commands.js', 'identity.js', 'messages.js',
    'game/backup.js', 'game/validation.js', 'game/rate-limit.js',
  ].map(file => import(pathToFileURL(path.join(__dirname, '../addons/alcateia/src', file)).href)))
    .then(modules => Object.assign({}, ...modules));
  return modulePromise;
}

async function fixture(t, { prefix = '!', users = new Map(), group = {}, mappings = {}, moduleOverrides = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-plugin-'));
  const modules = { ...await realModules(), ...moduleOverrides };
  const sent = [];
  const logs = [];
  const legacyCalls = [];
  let tick = NOW;
  let currentChat = GROUP;
  let sequence = 0;
  let loads = 0;
  const config = { get(key) { return { BOT_OWNER: OWNER.split('@')[0], PREFIX: prefix, BOT_NAME: '🐺 Lobo' }[key]; } };
  const db = { getUser: jid => users.get(jid), getGroup: () => group, isBotAdmin: () => false };
  const registry = new Map();
  function register(def) {
    registry.set(def.name, def);
    for (const alias of def.aliases || []) registry.set(alias, def);
  }
  const legacyMenu = async (sock, ctx) => { legacyCalls.push(ctx.command); await sock.sendMessage(ctx.jid, { text: 'LEGACY_MENU' }); };
  register({ name: 'menu', aliases: ['ajuda', 'help'], category: 'geral', minLevel: 0, groupOnly: false, handler: legacyMenu });
  for (const [name, aliases] of [['perfil', ['profile']], ['loja', ['shop']], ['comprar', ['buy']], ['gold', []], ['atacar', []], ['ban', []]]) {
    register({ name, aliases, handler: async () => { legacyCalls.push(name); } });
  }
  const originals = new Map(registry);
  const metadata = { id: GROUP, subject: 'Alcateia', owner: OWNER,
    participants: [
      { id: BOT, admin: 'admin' }, { id: OWNER_LID, phoneNumber: OWNER, admin: null },
      { id: MEMBER_LID, phoneNumber: MEMBER, admin: null }, { id: SECOND_OWNER, admin: null },
    ] };
  const sock = {
    user: { id: BOT },
    signalRepository: { lidMapping: { async getPNForLID(jid) { return mappings[jid] || null; } } },
    async groupMetadata() { return structuredClone(metadata); },
    async sendMessage(chatId, content, options) { sent.push({ chatId, content, options }); return { key: { id: `reply-${sent.length}` } }; },
  };
  const logger = { warn(...args) { logs.push(args); }, error(...args) { logs.push(args); } };
  const upstream = { registry, register, db, config, logger };
  const plugin = createPlugin({ root, now: () => tick,
    loadModules: async () => { loads++; return modules; }, loadUpstream: () => upstream });
  t.after(async () => { await plugin.onUnload(); await plugin.drain(); fs.rmSync(root, { recursive: true, force: true }); });

  function ctx(command = 'start', args = [], { sender = MEMBER_LID, alternative,
    chatId = GROUP, id = `msg-${++sequence}`, fromMe = false } = {}) {
    currentChat = chatId;
    const body = `${prefix}${command}${args.length ? ` ${args.join(' ')}` : ''}`;
    return { jid: chatId, sender, senderNumber: sender.split('@')[0], pushName: 'Lobo de teste',
      isGroup: chatId.endsWith('@g.us'), PREFIX: prefix, command, args, body,
      msg: { key: { remoteJid: chatId, participant: sender, participantAlt: alternative, id, fromMe },
        pushName: 'Lobo de teste', message: { conversation: body } } };
  }
  const adapter = createAdapter({ modules, db, config, logger, startedAt: NOW });
  function data() {
    const file = path.join(root, 'storage/alcateia/database.json');
    if(!fs.existsSync(file))return null;
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    return {...data,game:data.games?.[currentChat] || data.game};
  }
  return { root, modules, sent, logs, legacyCalls, config, db, users, group, metadata, sock,
    registry, register, originals, plugin, adapter, ctx, data, loads: () => loads,
    tick: (delta = 1000) => { tick += delta; }, text: () => sent.map(item => item.content.text || '').join('\n') };
}

test('requiring the plugin does not load legacy SQLite, Baileys or start a socket', () => {
  const imported = require('../plugins/alcateia-rp');
  assert.equal(imported.name, 'alcateia-rp');
  assert.equal(typeof imported.onLoad, 'function');
  const loaded = Object.keys(require.cache);
  assert.equal(loaded.some(file => /[\\/]src[\\/]utils[\\/]database\.js$/.test(file)), false);
  assert.equal(loaded.some(file => /[\\/]node_modules[\\/](?:better-sqlite3|@whiskeysockets)[\\/]/.test(file)), false);
});

test('adapter trusts server PN/LID mapping and ignores forged senderNumber or user level', async t => {
  const f = await fixture(t);
  const raw = f.ctx('admin', ['status']);
  raw.senderNumber = OWNER.split('@')[0];
  raw.senderLevel = 3;
  raw.sender = OWNER;
  const adapted = await f.adapter(f.sock, raw, { command: 'admin', args: ['status'], argText: 'status' });
  assert.equal(adapted.senderPhone, MEMBER);
  assert.equal(adapted.isOwner, false);
  assert.equal(adapted.isAdmin, false);
  await f.plugin.commands.admin(f.sock, raw);
  assert.match(f.text(), /exclusivo dos donos/i);
  assert.equal(Object.keys(f.data().game.players).length, 0);
});

test('an unresolved LID matching owner digits cannot register or administer games', async t => {
  const f = await fixture(t);
  const raw = f.ctx('admin', ['status'], { sender: `${OWNER.split('@')[0]}@lid` });
  await f.plugin.commands.admin(f.sock, raw);
  assert.match(f.text(), /Não consegui confirmar seu número/);
  assert.equal(f.data(), null);
});

test('trusted participantAlt authorizes either game owner without legacy owner elevation', async t => {
  const f = await fixture(t);
  f.metadata.participants.push({ id: '888000@lid', admin: null });
  const raw = f.ctx('admin', ['status'], { sender: '888000@lid', alternative: SECOND_OWNER });
  const adapted = await f.adapter(f.sock, raw, { command: 'admin', args: ['status'], argText: 'status' });
  assert.equal(adapted.senderPhone, SECOND_OWNER);
  assert.equal(adapted.isOwner, false);
  assert.equal(adapted.isAdmin, false);
  await f.plugin.commands.admin(f.sock, raw);
  assert.match(f.text(), /STATUS DA ALCATEIA/);
});

test('private LID sender uses remoteJidAlt and never context sender digits', async t => {
  const f = await fixture(t);
  const raw = f.ctx('admin', ['status'], { chatId: '888000@lid' });
  raw.msg.key.remoteJidAlt = SECOND_OWNER;
  await f.plugin.commands.admin(f.sock, raw);
  assert.match(f.text(), /STATUS DA ALCATEIA/);
});

test('legacy global bans and command mutes apply to either trusted PN or LID', async t => {
  for (const [jid, flags] of [[MEMBER, { banned: 1 }], [MEMBER_LID, { muted: 1 }]]) {
    const f = await fixture(t, { users: new Map([[jid, flags]]) });
    await f.plugin.commands.start(f.sock, f.ctx());
    assert.equal(f.sent.length, 0);
    assert.equal(f.data(), null);
  }
});

test('private PN commands respect trusted reverse-LID bans and mutes before registering or changing game data', async t => {
  for (const flags of [{ banned: 1 }, { muted: 1 }]) {
    const f = await fixture(t, { users: new Map([[MEMBER_LID, flags]]) });
    const queried = [];
    f.sock.signalRepository.lidMapping.getLIDForPN = async jid => {
      queried.push(jid);
      return MEMBER_LID;
    };
    const blocked = f.ctx('start', [], { chatId: MEMBER });
    assert.equal(await f.adapter(f.sock, blocked, { command: 'start', args: [], argText: '' }), null);
    await f.plugin.commands.start(f.sock, blocked);
    assert.ok(queried.every(jid => jid === MEMBER));
    assert.equal(f.sent.length, 0);
    assert.equal(f.data(), null);
    assert.deepEqual(f.users.get(MEMBER_LID), flags);

    f.users.delete(MEMBER_LID);
    f.tick();
    await f.plugin.commands.start(f.sock, f.ctx('start', [], { chatId: MEMBER }));
    assert.equal(f.data().game.players[MEMBER].coins, 100);
    const before = f.data();
    const repliesBefore = f.sent.length;
    f.users.set(MEMBER_LID, flags);
    f.tick();
    await f.plugin.commands.perfilalcateia(f.sock, f.ctx('perfilalcateia', [], { chatId: MEMBER }));
    assert.equal(f.sent.length, repliesBefore);
    assert.deepEqual(f.data(), before);
  }
});

test('a failed reverse identity lookup closes access with retry feedback and never grants a registration bonus', async t => {
  const f = await fixture(t);
  let unavailable = true;
  f.sock.signalRepository.lidMapping.getLIDForPN = async () => {
    if (unavailable) throw new Error('temporary identity lookup failure');
    return MEMBER_LID;
  };
  const raw = f.ctx('start', [], { chatId: MEMBER });
  assert.equal(await f.adapter(f.sock, raw, { command: 'start', args: [], argText: '' }), null);
  assert.match(f.sent.at(-1).content.text, /verificar suas permissões.*Tente novamente/);
  await f.plugin.commands.start(f.sock, raw);
  assert.equal(f.data(), null);
  assert.equal(f.logs.length, 2);
  assert.doesNotMatch(f.text(), /Registro concluído/);

  unavailable = false;
  f.tick();
  await f.plugin.commands.start(f.sock, f.ctx('start', [], { chatId: MEMBER }));
  assert.equal(f.data().game.players[MEMBER].coins, 100);
  f.tick();
  await f.plugin.commands.start(f.sock, f.ctx('start', [], { chatId: MEMBER }));
  assert.equal(f.data().game.players[MEMBER].coins, 100);
  assert.match(f.sent.at(-1).content.text, /já faz parte da alcateia/);
});

test('group metadata failure is closed and optional disabled/admin-only settings remain effective', async t => {
  const failed = await fixture(t);
  failed.sock.groupMetadata = async () => { throw new Error('offline'); };
  await failed.plugin.commands.start(failed.sock, failed.ctx());
  assert.equal(failed.data(), null);
  assert.match(failed.text(), /Não consegui verificar/);
  const paused = await fixture(t, { group: { enabled: 0 } });
  await paused.plugin.commands.start(paused.sock, paused.ctx());
  assert.equal(paused.data(), null);
  const adminOnly = await fixture(t, { group: { adminOnly: true } });
  await adminOnly.plugin.commands.start(adminOnly.sock, adminOnly.ctx());
  assert.equal(adminOnly.data(), null);
  assert.match(adminOnly.text(), /apenas para administradores/);
});

test('registration writes only the isolated addon database and does not copy or add legacy Gold', async t => {
  const f = await fixture(t, { users: new Map([[MEMBER, { gold: 900, banned: 0, muted: 0 }]]) });
  await f.plugin.commands.start(f.sock, f.ctx());
  assert.equal(f.data().game.players[MEMBER].coins, 100);
  assert.equal(f.users.get(MEMBER).gold, 900);
  assert.deepEqual(fs.readdirSync(f.root), ['storage']);
  assert.equal(fs.existsSync(path.join(f.root, 'sessions')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'data/lobo.db')), false);
});

test('quota and deduplication protect the addon across aliases, namespaces and reconnect loads', async t => {
  const f = await fixture(t);
  await f.plugin.onLoad(f.sock);
  const first = f.ctx();
  await f.plugin.commands.start(f.sock, first);
  await f.plugin.commands.start(f.sock, first);
  assert.equal(f.sent.length, 1);
  await f.plugin.commands.perfilalcateia(f.sock, f.ctx('perfilalcateia'));
  assert.match(f.text(), /ANTI-SPAM/);
  f.tick();
  await f.plugin.commands.alcateia(f.sock, f.ctx('alcateia', ['perfil']));
  assert.match(f.text(), /PERFIL DA ALCATEIA/);
  await f.plugin.onLoad(f.sock);
  assert.equal(f.loads(), 1);
  assert.equal(f.data().game.players[MEMBER].coins, 100);
});

test('legacy commands, aliases and menu registration retain identity across loads', async t => {
  const f = await fixture(t);
  await f.plugin.onLoad(f.sock);
  for (const command of ['perfil', 'profile', 'loja', 'shop', 'comprar', 'buy', 'gold', 'atacar', 'ban']) {
    assert.equal(f.registry.get(command), f.originals.get(command));
    assert.equal(f.plugin.commands[command], undefined);
  }
  const wrapped = f.registry.get('menu');
  assert.equal(f.registry.get('ajuda'), wrapped);
  assert.equal(f.registry.get('help'), wrapped);
  assert.equal(wrapped.minLevel, 0);
  assert.equal(wrapped.groupOnly, false);
  await f.plugin.onLoad(f.sock);
  assert.equal(f.registry.get('menu'), wrapped);
  await wrapped.handler(f.sock, f.ctx('menu'));
  assert.equal(f.sent[0].content.text, 'LEGACY_MENU');
  assert.equal(f.sent.length, 1, 'plugin não deve despejar jogos no menu principal');
  assert.deepEqual(f.legacyCalls, ['menu']);
});

test('category menus delegate to the central renderer without addon overrides', async t => {
  const f = await fixture(t);
  await f.plugin.onLoad(f.sock);
  await f.registry.get('menu').handler(f.sock, f.ctx('menu', ['gold']));
  assert.deepEqual(f.sent.map(item => item.content.text), ['LEGACY_MENU']);
  f.tick();
  await f.registry.get('menu').handler(f.sock, f.ctx('menu', ['alcateia']));
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1].content.text, 'LEGACY_MENU');
  assert.deepEqual(f.legacyCalls, ['menu', 'menu']);
});

test('reconnect preserves the fresh registry without nesting menus or duplicating backup timers', async t => {
  const modules = await realModules();
  const managers = [];
  class TrackedBackupManager extends modules.BackupManager {
    constructor(options) { super(options); managers.push(this); }
  }
  const f = await fixture(t, { moduleOverrides: { BackupManager: TrackedBackupManager } });
  await f.plugin.onLoad(f.sock);
  const timer = managers[0].timer;
  f.register(f.originals.get('menu'));
  await f.plugin.onLoad({ ...f.sock });
  assert.equal(managers.length, 1);
  assert.equal(managers[0].timer, timer);
  assert.equal(f.loads(), 1);
  await f.registry.get('menu').handler(f.sock, f.ctx('menu'));
  assert.equal(f.sent.filter(item => item.content.text === 'LEGACY_MENU').length, 1);
  assert.equal(f.sent.filter(item => /MENU DA ALCATEIA/.test(item.content.text)).length, 0);
  await f.plugin.onUnload();
  assert.equal(managers[0].timer, null);
});

test('mentions retain trusted canonical targets without making their identity the actor', async t => {
  const f = await fixture(t);
  const raw = f.ctx('ataque', [`@${OWNER.split('@')[0]}`]);
  raw.msg.message = { extendedTextMessage: { text: raw.body,
    contextInfo: { mentionedJid: [OWNER_LID], participant: OWNER } } };
  const adapted = await f.adapter(f.sock, raw, { command: 'ataque', args: raw.args, argText: raw.args.join(' ') });
  const target = await adapted.resolveMember(OWNER_LID);
  assert.equal(adapted.senderPhone, MEMBER);
  assert.equal(adapted.isOwner, false);
  assert.equal(target.phoneNumber, OWNER);
  assert.equal(target.isOwner, true);
});

test('a newly registered upstream name wins without removing namespace access', async t => {
  const f = await fixture(t);
  const original = { name: 'familia', handler: async () => {} };
  f.register(original);
  await f.plugin.onLoad(f.sock);
  assert.equal(f.registry.get('familia'), original);
  assert.equal(f.plugin.commands.familia, undefined);
  assert.equal(typeof f.plugin.commands.alcateia, 'function');
  await f.plugin.commands.alcateia(f.sock, f.ctx('alcateia', ['start']));
  assert.equal(f.data().game.players[MEMBER].coins, 100);
});

test('custom prefixes and namespace validation messages use usable collision-free commands', async t => {
  const f = await fixture(t, { prefix: '!!' });
  await f.plugin.commands.alcateia(f.sock, f.ctx('alcateia'));
  assert.equal(f.text(), 'LEGACY_MENU', 'atalho delega ao menu central sem acrescentar RP');
  assert.deepEqual(f.legacyCalls, ['menu']);
  f.tick();
  await f.plugin.commands.start(f.sock, f.ctx());
  f.tick();
  await f.plugin.commands.compraralcateia(f.sock, f.ctx('compraralcateia', []));
  assert.match(f.sent.at(-1).content.text, /!!compraralcateia/);
  assert.doesNotMatch(f.text(), /!!!/);
});

test('overlapping and regex-special prefixes are rewritten once with exact usable command text', async t => {
  for (const prefix of ['!!', '*?', '.']) {
    const f = await fixture(t, { prefix });
    const raw = f.ctx('start', [], { chatId: MEMBER });
    const adapted = await f.adapter(f.sock, raw, { command: 'start', args: [], argText: '' });
    assert.ok(adapted);
    await adapted.reply(`${prefix}start • ${prefix}perfil • !comprar 1 • xperfil`);
    assert.equal(f.sent.at(-1).content.text, `${prefix}start • ${prefix}perfilalcateia • ${prefix}compraralcateia 1 • xperfil`);
    assert.equal(f.data(), null);
  }
});

test('all addon data persists after a new plugin instance without another registration reward', async t => {
  const f = await fixture(t);
  await f.plugin.commands.start(f.sock, f.ctx());
  f.tick();
  const reloaded = createPlugin({ root: f.root, now: () => NOW + 2000,
    loadModules: async () => f.modules, loadUpstream: () => ({ registry: f.registry, register: f.register,
      db: f.db, config: f.config, logger: { warn() {} } }) });
  t.after(() => reloaded.onUnload());
  await reloaded.commands.start(f.sock, f.ctx('start', [], { id: 'after-restart' }));
  assert.match(f.sent.at(-1).content.text, /já faz parte da alcateia/);
  assert.equal(f.data().game.players[MEMBER].coins, 100);
});
