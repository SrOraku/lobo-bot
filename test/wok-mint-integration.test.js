'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { runMigrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const context = require('../src/isolation/context');
const { balance } = require('../src/services/universal-currency');
const { createSettings } = require('../src/security/settings');
const { createSecurity } = require('../src/security/groups/service');
const { createPlugin } = require('../plugins/alcateia-rp');
const { createWokIssueCommand } = require('../src/commands/wok-donation');
const G = '1200001@g.us', H = '1200002@g.us';
const OWNER = '5543920030769@s.whatsapp.net', SECOND = '5511888888888@s.whatsapp.net';
const TARGET = '5511999999999@s.whatsapp.net', BOT = '5511977777777@s.whatsapp.net', LID = '887766@lid';
let loaded;
function modules() { return loaded ||= Promise.all(['store.js', 'game/service.js', 'game/commands.js', 'identity.js', 'messages.js',
  'game/backup.js', 'game/validation.js', 'game/rate-limit.js', 'game/players.js'].map(file => import(pathToFileURL(path.join(__dirname, '../addons/alcateia/src', file)).href))).then(values => Object.assign({}, ...values)); }
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-wok-issue-')), file = path.join(root, 'wallet.sqlite');
  const raw = new Database(file); raw.pragma('journal_mode=WAL'); raw.pragma('foreign_keys=ON'); runMigrations(raw);
  const db = createScopedDatabase(raw), settings = createSettings(db);
  const api = { db, getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    getGroup: () => ({}), isBotAdmin: () => false };
  const config = { get: key => ({ BOT_OWNER: OWNER.split('@')[0], BOT_OWNERS: settings.get('owners', []).join(','), PREFIX: '!' })[key] };
  const owners = () => [OWNER.split('@')[0], ...settings.get('owners', [])];
  context.run(G, () => db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(OWNER, 'Dono', 741));
  const registry = new Map(), logger = { warn() {}, error() {} }; let store;
  const addon = await modules();
  class CapturedStore extends addon.Store { constructor(...args) { super(...args); store = this; } }
  const plugin = createPlugin({ root, loadModules: async () => ({ ...addon, Store: CapturedStore }), loadUpstream: () => ({ db: api, config, registry, logger, register: def => registry.set(def.name, def) }) });
  t.after(async () => { await plugin.onUnload(); await plugin.drain(); raw.close(); fs.rmSync(root, { recursive: true, force: true }); });
  await plugin.onLoad();
  const metadata = { id: G, subject: 'Alcateia', owner: OWNER, participants: [
    { id: OWNER, admin: 'superadmin' }, { id: SECOND, admin: 'admin' }, { id: LID, phoneNumber: TARGET }, { id: BOT, admin: 'admin' },
  ] };
  const sent = [], sock = { user: { id: BOT }, groupMetadata: async id => ({ ...structuredClone(metadata), id }),
    signalRepository: { lidMapping: { getPNForLID: async id => id === LID ? TARGET : null } },
    sendMessage: async (_, payload) => sent.push(payload) };
  const security = createSecurity({ db, owners, botAdmin: () => false });
  const command = createWokIssueCommand('addwok', { log: logger, issue: request => plugin.donateWok(request),
    resolveActor: async (client, ctx) => { const c = await security.permissions.context(client, ctx.jid, ctx.msg.key.participant, ctx.msg.key.participantAlt); return { owner: c.actor.globalOwner === true, phone: c.actor.canonical }; } });
  let sequence = 0;
  const ctx = ({ sender = OWNER, chat = G, amount = 100, event = 'mint-' + ++sequence, target = TARGET } = {}) => ({
    jid: chat, isGroup: true, sender, senderLevel: 3, isOwner: true, args: [String(amount), '@alvo'], PREFIX: '!',
    msg: { key: { remoteJid: chat, participant: sender, id: event }, message: { extendedTextMessage: { text: '!addwok', contextInfo: { mentionedJid: [target] } } } },
  });
  const game = (chat = G) => JSON.parse(raw.prepare('SELECT state FROM universal_game_states WHERE chat_jid=?').get(chat).state);
  return { root, file, raw, db, api, settings, plugin, store, sock, sent, command, ctx, game,
    wallet: (id = TARGET, chat = G) => balance(raw, chat, id),
    request: (extra = {}) => ({ chat: G, actor: OWNER, target: TARGET, targetAliases: [LID], amount: 100, event: 'direct-' + ++sequence, source: 'addwok', ...extra }) };
}
test('owner mint registers a new recipient with the normal wallet, without debiting the owner or requiring start', async t => {
  const f = await fixture(t); assert.equal(f.wallet(), undefined);
  await f.command(f.sock, f.ctx());
  assert.equal(f.wallet(), 600); assert.equal(f.wallet(OWNER), 741); assert.equal(f.wallet(LID), 600);
  assert.equal(f.game().players[TARGET].coins, 600); assert.equal(f.game().players[TARGET].wolves, 20);
  assert.equal(f.raw.prepare("SELECT count(*) n FROM security_audit WHERE action='wok.issue'").get().n, 1);
});
test('owners added and removed through persistent owner settings gain and lose mint permission', async t => {
  const f = await fixture(t);
  await f.command(f.sock, f.ctx({ sender: SECOND })); assert.equal(f.wallet(), undefined);
  f.settings.set('owners', [SECOND.split('@')[0]], OWNER, 'owners.adicionar');
  await f.command(f.sock, f.ctx({ sender: SECOND })); assert.equal(f.wallet(), 600);
  f.settings.set('owners', [], OWNER, 'owners.remover');
  await f.command(f.sock, f.ctx({ sender: SECOND })); assert.equal(f.wallet(), 600);
});
test('a removed owner cannot finish a mint that was waiting in the transaction queue', async t => {
  const f = await fixture(t); f.settings.set('owners', [SECOND.split('@')[0]], OWNER);
  let release; f.store.gameQueue = new Promise(resolve => { release = resolve; });
  const pending = f.plugin.donateWok(f.request({ actor: SECOND }));
  await new Promise(resolve => setImmediate(resolve));
  f.settings.set('owners', [], OWNER); release();
  await assert.rejects(pending, /donos cadastrados/); assert.equal(f.wallet(), undefined); assert.equal(f.game().players[TARGET], undefined);
});
test('deduplicated delivery and concurrent credits cannot mint a second starter balance', async t => {
  const f = await fixture(t), request = f.request();
  await Promise.all([f.plugin.donateWok(request), f.plugin.donateWok(request)]);
  assert.equal(f.wallet(), 600);
  await Promise.all([f.plugin.donateWok(f.request({ amount: 50 })), f.plugin.donateWok(f.request({ amount: 75 }))]);
  assert.equal(f.wallet(), 725); assert.equal(f.wallet(OWNER), 741);
  assert.equal(f.raw.prepare("SELECT count(*) n FROM security_audit WHERE action='wok.issue'").get().n, 3);
});
test('existing PN and LID balances merge once and retain their value before minting', async t => {
  const f = await fixture(t);
  context.run(G, () => { f.db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(TARGET, 'Perfil existente', 900); f.db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(LID, 'LID', 50); });
  await f.plugin.donateWok(f.request({ amount: 25 }));
  assert.equal(f.wallet(), 975); assert.equal(f.wallet(LID), 975);
  assert.equal(context.run(G, () => f.api.getUser(TARGET).name), 'Perfil existente');
});
test('mint and its deduplication remain isolated by chat', async t => {
  const f = await fixture(t);
  await f.plugin.donateWok(f.request({ event: 'same-id' }));
  assert.equal(f.wallet(TARGET, H), undefined);
  await f.plugin.donateWok(f.request({ chat: H, event: 'same-id', amount: 30 }));
  assert.equal(f.wallet(), 600); assert.equal(f.wallet(TARGET, H), 530);
});
test('late SQL failure rolls back recipient creation, receipt and administrative audit together', async t => {
  const f = await fixture(t), request = f.request();
  f.raw.exec("CREATE TRIGGER fail_issue_audit BEFORE INSERT ON security_audit WHEN NEW.action='wok.issue' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(f.plugin.donateWok(request), /fixture failure/);
  assert.equal(f.wallet(), undefined); assert.equal(f.game().players[TARGET], undefined); assert.equal(Object.keys(f.game().donations || {}).length, 0);
  f.raw.exec('DROP TRIGGER fail_issue_audit'); await f.plugin.donateWok(request); assert.equal(f.wallet(), 600);
});
test('a ban in bot commands or the game cannot be bypassed by minting a fresh profile', async t => {
  const f = await fixture(t);
  context.run(G, () => f.db.prepare('INSERT INTO users(jid,name,gold,banned) VALUES(?,?,?,1)').run(TARGET, 'Bloqueado', 800));
  await assert.rejects(f.plugin.donateWok(f.request()), /banido/); assert.equal(f.wallet(), 800); assert.equal(f.game().players[TARGET], undefined);
  context.run(G, () => f.db.prepare('UPDATE users SET banned=0 WHERE jid=?').run(TARGET));
  await f.plugin.donateWok(f.request()); const state = f.game(); state.players[TARGET].banned = true;
  f.raw.prepare('UPDATE universal_game_states SET state=? WHERE chat_jid=?').run(JSON.stringify(state), G);
  await assert.rejects(f.plugin.donateWok(f.request()), /banido/); assert.equal(f.wallet(), 900);
});
test('first RP command initializes actor automatically and a later mint preserves profession and inventory', async t => {
  const f = await fixture(t), command = f.ctx({ sender: TARGET }); command.args = ['perfil']; command.body = '!rp perfil';
  command.msg.message = { conversation: command.body }; command.pushName = 'Jogador'; command.command = 'rp';
  await f.plugin.commands.rp(f.sock, command); assert.ok(f.game().players[TARGET].rp);
  const state = f.game(); state.players[TARGET].rp.inventory.agua = 2; state.players[TARGET].rp.jobId = 'cozinheiro'; state.players[TARGET].hp = 42;
  f.raw.prepare('UPDATE universal_game_states SET state=? WHERE chat_jid=?').run(JSON.stringify(state), G);
  await f.plugin.donateWok(f.request({ amount: 20 }));
  assert.equal(f.game().players[TARGET].rp.inventory.agua, 2); assert.equal(f.game().players[TARGET].rp.jobId, 'cozinheiro'); assert.equal(f.game().players[TARGET].hp, 42);
  assert.equal(f.wallet(), 520);
});
test('minted balance and receipt survive a real SQLite reopen', async t => {
  const f = await fixture(t), request = f.request({ amount: 250 }); await f.plugin.donateWok(request);
  const again = new Database(f.file); t.after(() => again.close());
  assert.equal(balance(again, G, TARGET), 750);
  const state = JSON.parse(again.prepare('SELECT state FROM universal_game_states WHERE chat_jid=?').get(G).state);
  assert.equal(state.players[TARGET].coins, 750); assert.equal(Object.keys(state.donations).length, 1);
});
