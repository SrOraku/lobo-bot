'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createPlugin } = require('../plugins/alcateia-rp');

const OWNER = '5543996375955@s.whatsapp.net';
const MEMBER = '5511777777777@s.whatsapp.net';
const BOT = '5511999999999@s.whatsapp.net';
const GROUP = '120363000000000000@g.us';
const OTHER_GROUP = '120363000000000009@g.us';
const MINUTE = 60_000, HOUR = 60 * MINUTE;
// Sexta-feira, 15/01/2027, 05:00 em Brasília: antes do primeiro ataque do dia (09h).
const NOW = Date.parse('2027-01-15T08:00:00Z');
const NEXT_MONDAY = Date.parse('2027-01-18T03:00:00Z');
let modulePromise;

function realModules() {
  if (!modulePromise) modulePromise = Promise.all([
    'store.js', 'game/service.js', 'game/commands.js', 'identity.js', 'messages.js', 'game/backup.js',
    'game/validation.js', 'game/rate-limit.js', 'game/players.js', 'game/war.js', 'game/war-messages.js',
  ].map(file => import(pathToFileURL(path.join(__dirname, '../addons/alcateia/src', file)).href)))
    .then(modules => Object.assign({}, ...modules));
  return modulePromise;
}

async function fixture(t, { prefix = '!' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-war-plugin-'));
  const modules = await realModules();
  const sent = [], logs = [];
  const clock = { now: NOW };
  let sequence = 0, allowed = true;
  const config = { get: key => ({ BOT_OWNER: OWNER.split('@')[0], PREFIX: prefix, BOT_NAME: '🐺 Lobo' }[key]) };
  const registry = new Map();
  const upstream = { registry, register: def => registry.set(def.name, def), config,
    db: { getUser: () => undefined, getGroup: () => ({}), isBotAdmin: () => false },
    logger: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) } };
  const sock = {
    user: { id: BOT }, signalRepository: { lidMapping: { async getPNForLID() { return null; } } },
    async groupMetadata(id) { return { id, subject: 'Matilha', owner: OWNER, participants: [{ id: BOT, admin: 'admin' }, { id: OWNER, admin: 'admin' }, { id: MEMBER, admin: null }] }; },
    async sendMessage(chatId, content, options) { sent.push({ chatId, content, options }); return { key: { id: `reply-${sent.length}` } }; },
  };
  const plugin = createPlugin({ root, now: () => clock.now, random: () => 0.5, warInterval: 0,
    warAllowed: () => allowed, loadModules: async () => modules, loadUpstream: () => upstream });
  t.after(async () => { await plugin.onUnload(); await plugin.drain(); fs.rmSync(root, { recursive: true, force: true }); });
  // Cada comando chega 2 s depois do anterior, como mensagens reais.
  async function say(sender, text, { chat = GROUP, wait = 2000 } = {}) {
    clock.now += wait;
    const [command, ...args] = text.split(/\s+/);
    const before = sent.length;
    await plugin.commands[command](sock, { jid: chat, sender, pushName: sender === OWNER ? 'Dono' : 'Luna', isGroup: true, PREFIX: prefix, command, args,
      body: prefix + text, msg: { key: { remoteJid: chat, participant: sender, id: `msg-${++sequence}`, fromMe: false }, pushName: sender === OWNER ? 'Dono' : 'Luna', message: { conversation: prefix + text } } });
    return sent.slice(before).map(entry => entry.content.text).join('\n');
  }
  const database = () => JSON.parse(fs.readFileSync(path.join(root, 'storage/alcateia/database.json'), 'utf8'));
  const player = (jid, chat = GROUP) => database().games[chat].players[jid];
  return { plugin, sock, sent, logs, clock, say, database, player, block: value => { allowed = !value; } };
}

// Luna entra no jogo, recebe WoK do dono, funda a alcateia e conquista o Vale da Lua.
async function conquer(f) {
  await f.say(MEMBER, 'alcateia perfil');
  await f.say(OWNER, 'admin addmoedas 5511777777777 1000');
  assert.match(await f.say(MEMBER, 'clan criar Lua'), /Lua/);
  let reply = '';
  for (let attack = 0; attack < 4; attack++) reply = await f.say(MEMBER, 'guerra atacar 1', { wait: 21 * MINUTE });
  assert.match(reply, /TERRITÓRIO CONQUISTADO/);
  assert.equal(f.database().games[GROUP].war.territories.vale.owner, 'lua');
}

test('!guerra é um comando do plugin e aparece no catálogo da alcateia', async t => {
  const f = await fixture(t);
  await f.plugin.onLoad(f.sock);
  assert.equal(typeof f.plugin.commands.guerra, 'function');
  const { ADDON, buildCatalog } = require('../src/menus/catalog');
  assert.equal(ADDON.guerra[0], 'alcateia');
  const entry = buildCatalog([], f.plugin.commands).find(command => command.name === 'guerra');
  assert.equal(entry.category, 'alcateia'); assert.ok(entry.details.includes('atacar N')); assert.ok(entry.details.includes('placar'));
  const map = await f.say(MEMBER, 'guerra');
  assert.match(map, /GUERRA DE ALCATEIAS/); assert.match(map, /Alcateia Sombria/);
});

test('o relógio faz a Alcateia Sombria atacar e avisa o grupo uma vez por ataque', async t => {
  const f = await fixture(t, { prefix: '/' });
  assert.equal(await f.plugin.warTick(), 0, 'sem conexão nada é enviado');
  await f.plugin.onLoad(f.sock);
  await conquer(f);
  f.sent.length = 0;
  assert.equal(await f.plugin.warTick(), 0, 'antes das 09h não há ataque');
  f.clock.now = Date.parse('2027-01-15T12:01:00Z'); // 09:01 em Brasília
  assert.equal(await f.plugin.warTick(), 1);
  assert.equal(f.sent.length, 1);
  const notice = f.sent[0];
  assert.equal(notice.chatId, GROUP); assert.equal(notice.options, undefined, 'aviso espontâneo não responde a ninguém');
  const text = notice.content.text.replace(/[*`_]/g, '');
  assert.match(text, /AVISO DE GUERRA/); assert.match(text, /A Alcateia Sombria atacou 🌕 Vale da Lua \(Lua\): defesa 35 → 26\./);
  assert.match(text, /\/guerra defender N/, 'usa o prefixo configurado');
  assert.equal(f.database().games[GROUP].war.territories.vale.defense, 26);
  assert.equal(await f.plugin.warTick(), 0, 'o mesmo ataque não é anunciado de novo');
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.logs, []);
});

test('grupo pausado não recebe aviso; ao liberar, o ataque pendente acontece', async t => {
  const f = await fixture(t);
  await f.plugin.onLoad(f.sock);
  await conquer(f);
  f.sent.length = 0;
  f.block(true);
  f.clock.now = Date.parse('2027-01-15T12:01:00Z');
  assert.equal(await f.plugin.warTick(), 0);
  assert.equal(f.sent.length, 0);
  assert.equal(f.database().games[GROUP].war.territories.vale.defense, 35, 'com o bot pausado a guerra não anda');
  f.block(false);
  assert.equal(await f.plugin.warTick(), 1);
  assert.equal(f.database().games[GROUP].war.territories.vale.defense, 26);
  // Avisos desligados pelo admin: a guerra continua, sem mensagem.
  assert.match(await f.say(OWNER, 'guerra avisos off'), /Avisos desligados/);
  f.sent.length = 0;
  f.clock.now = Date.parse('2027-01-15T15:01:00Z');
  assert.equal(await f.plugin.warTick(), 0);
  assert.equal(f.sent.length, 0);
  assert.equal(f.database().games[GROUP].war.territories.vale.defense, 17);
  assert.match(await f.say(MEMBER, 'guerra avisos on'), /Somente administradores/);
});

test('na virada da semana o relógio paga o prêmio e anuncia o resultado', async t => {
  const f = await fixture(t);
  await f.plugin.onLoad(f.sock);
  await conquer(f);
  const before = f.player(MEMBER).coins;
  f.sent.length = 0;
  f.clock.now = NEXT_MONDAY + 5 * MINUTE;
  assert.equal(await f.plugin.warTick(), 1);
  const text = f.sent.map(entry => entry.content.text).join('\n').replace(/[*`_]/g, '');
  assert.match(text, /A semana de guerra terminou/); assert.match(text, /🥇 Lua/); assert.match(text, /300 WoK coin para 1 membro/);
  assert.equal(f.player(MEMBER).coins, before + 300);
  const war = f.database().games[GROUP].war;
  assert.deepEqual(war.scores, {}); assert.equal(war.territories.vale.owner, null); assert.equal(war.history.length, 1);
  assert.equal(await f.plugin.warTick(), 0);
  assert.equal(f.player(MEMBER).coins, before + 300, 'o prêmio é pago uma única vez');
});

test('o relógio ignora grupos que nunca abriram a guerra e para ao descarregar o plugin', async t => {
  const f = await fixture(t);
  await f.plugin.onLoad(f.sock);
  await f.say(MEMBER, 'alcateia perfil', { chat: OTHER_GROUP });
  f.clock.now += 3 * 24 * HOUR;
  f.sent.length = 0;
  assert.equal(await f.plugin.warTick(), 0);
  assert.equal(f.database().games[OTHER_GROUP].war, undefined, 'nenhum estado de guerra é criado por conta própria');
  await conquer(f);
  await f.plugin.onUnload();
  f.sent.length = 0;
  f.clock.now = Date.parse('2027-01-25T12:01:00Z');
  assert.equal(await f.plugin.warTick(), 0);
  assert.equal(f.sent.length, 0);
});

// Em produção o jogo roda sobre a carteira unificada em SQLite. Este teste usa
// o banco, as migrações e o armazenamento unificado de verdade.
test('com a carteira unificada, a guerra debita o clã e paga o prêmio no saldo WoK real', async t => {
  const Database = require('better-sqlite3');
  const { runMigrations } = require('../src/config/migrations');
  const { createScopedDatabase } = require('../src/isolation/sqlite');
  const context = require('../src/isolation/context');
  const { attachUniversalStore, balance } = require('../src/services/universal-currency');
  const modules = await realModules();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-war-universal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = new Database(path.join(root, 'db.sqlite')); raw.pragma('foreign_keys=ON'); t.after(() => raw.close());
  runMigrations(raw);
  const db = createScopedDatabase(raw), api = { db, getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid) };
  const CHAT = '123@g.us', OTHER = '456@g.us';
  context.run(CHAT, () => db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(MEMBER, 'Luna', 1000));
  const file = path.join(root, 'game.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, groups: {}, game: modules.defaultGame() }));
  const store = attachUniversalStore(new modules.Store(file), api);
  let now = NOW;
  const service = new modules.GameService({ store: store.scoped(CHAT), now: () => now, rng: () => 0.5 });
  const run = (text, wait = 2000) => {
    now += wait;
    const [command, ...args] = text.split(/\s+/);
    return service.execute({ command, args, argText: args.join(' '), actor: { jid: MEMBER, name: 'Luna' }, chatId: CHAT, now });
  };

  assert.equal((await run('clan criar Lua')).type, 'clan');
  assert.equal(balance(raw, CHAT, MEMBER), 700, 'criar a alcateia custa 300 WoK da carteira real');
  let last;
  for (let attack = 0; attack < 4; attack++) last = await run('guerra atacar 1', 21 * MINUTE);
  assert.equal(last.captured, true);
  assert.equal(balance(raw, CHAT, MEMBER), 700, 'atacar não custa WoK');
  // É assim que o relógio do plugin encontra os grupos em guerra.
  const snapshot = store.snapshot().games;
  assert.equal(snapshot[CHAT].war.territories.vale.owner, 'lua');
  assert.equal(snapshot[OTHER], undefined);

  now = NEXT_MONDAY + 5 * MINUTE;
  const events = await store.scoped(CHAT).transactionGame(draft => { modules.advanceWar(draft, now, () => 0.5); return modules.drainWarOutbox(draft); });
  assert.deepEqual(events.map(event => event.type), ['week-result']);
  assert.equal(events[0].summary.podium[0].prize, 300);
  assert.equal(balance(raw, CHAT, MEMBER), 1000, 'o prêmio de 300 WoK entra na carteira unificada');
  assert.equal(context.run(CHAT, () => api.getUser(MEMBER).gold), 1000, 'e aparece no saldo usado pelo resto do bot');
  // O mesmo jogador em outro grupo não recebe nada.
  assert.equal(balance(raw, OTHER, MEMBER), undefined);
  await store.scoped(CHAT).transactionGame(draft => { modules.advanceWar(draft, now + HOUR, () => 0.5); });
  assert.equal(balance(raw, CHAT, MEMBER), 1000, 'sem pagamento em dobro');
});
