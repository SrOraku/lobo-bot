'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const context = require('../src/isolation/context');
const { attachUniversalStore, balance } = require('../src/services/universal-currency');
const { createEconomy } = require('../src/services/economy');
const { createPlugin } = require('../plugins/alcateia-rp');

const CHAT = '120600000090@g.us';
const OTHER_CHAT = '120600000091@g.us';
const PLAYER = '5511999912345@s.whatsapp.net';
const OTHER = '5511888812345@s.whatsapp.net';
const BOT = '5511666612345@s.whatsapp.net';
const NOW = 1_800_000_000_000;

let modulesPromise;
function modules() {
  if (!modulesPromise) modulesPromise = Promise.all([
    'store.js', 'game/service.js', 'game/commands.js', 'identity.js', 'messages.js',
    'game/backup.js', 'game/validation.js', 'game/rate-limit.js', 'game/players.js', 'rp/state.js',
  ].map(file => import('../addons/alcateia/src/' + file))).then(items => Object.assign({}, ...items));
  return modulesPromise;
}

function apiFor(raw) {
  const db = createScopedDatabase(raw);
  return {
    db,
    getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    logGoldTransaction: (from, to, amount, reason) => db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES(?,?,?,?)').run(from, to, amount, reason),
  };
}

async function walletFixture(t, { gold = 10_000, hp = 100 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-shop-journey-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const real = await modules();
  const sqliteFile = path.join(root, 'wallet.sqlite');
  const raw = new Database(sqliteFile);
  t.after(() => raw.close());
  runMigrations(raw);
  const api = apiFor(raw);
  context.run(CHAT, () => api.db.prepare('INSERT INTO users(jid,name,gold) VALUES(?,?,?)').run(PLAYER, 'Viajante', gold));
  const game = real.defaultGame();
  game.players[PLAYER] = real.createPlayer({ jid: PLAYER, name: 'Viajante' }, NOW);
  Object.assign(game.players[PLAYER], { coins: 0, hp });
  const rp = real.ensureRP(game.players[PLAYER], NOW);
  Object.assign(rp, { experience: 50, energy: 40, health: 70 });
  game.players[OTHER] = real.createPlayer({ jid: OTHER, name: 'Sentinela' }, NOW);
  const file = path.join(root, 'game.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, groups: {}, game }));
  const store = attachUniversalStore(new real.Store(file), api);
  const service = new real.GameService({ store: store.scoped(CHAT), rng: () => 0.9 });
  let tick = NOW;
  const execute = (input, extra = {}) => {
    const [command, ...args] = input.split(/\s+/);
    const now = tick; tick += 1_000;
    return context.run(CHAT, () => service.execute({ command, args, argText: args.join(' '),
      actor: { jid: PLAYER, name: 'Viajante' }, chatId: CHAT, now, ...extra }));
  };
  const read = () => store.scoped(CHAT).transactionGame(state => state.players[PLAYER]);
  return { root, real, sqliteFile, raw, api, file, store, service, execute, read,
    economy: createEconomy(api, { now: () => NOW }), tick: () => tick };
}

test('one wallet funds Matilha, RP equipment and a home; work and rest survive a SQLite reopen', async t => {
  const f = await walletFixture(t);
  context.run(CHAT, () => f.economy.buy(PLAYER, { id: 9 }, 'core-xp-journey'));
  assert.throws(() => context.run(CHAT, () => f.economy.buy(PLAYER, { id: 9 }, 'core-xp-journey')), /processada/);
  assert.equal(balance(f.raw, CHAT, PLAYER), 9_910);
  for (const input of ['rpcomprar notebook', 'rpcomprar apartamento', 'rpcomprar bicicleta']) {
    const result = await f.execute(input);
    assert.equal(result.type, 'rp-purchase', result.message);
  }
  assert.equal((await f.execute('usar notebook')).result.equipped, true);
  assert.equal((await f.execute('profissao programador')).type, 'rp-job');
  const work = await f.execute('trabalhar');
  assert.equal(work.type, 'rp-work', work.message);
  assert.equal(work.reward.amount, 88);
  assert.equal(work.reward.equipmentBonus, 8);
  assert.equal(work.reward.energyCost, 9);
  assert.equal(work.reward.xp, 12);
  const rest = await f.execute('descansar');
  assert.equal(rest.type, 'rp-rest', rest.message);
  assert.deepEqual(rest.result.effects, { energy: 20, health: 5 });
  const saved = await f.read();
  assert.equal(saved.coins, 7_098);
  assert.equal(balance(f.raw, CHAT, PLAYER), saved.coins);
  assert.equal(context.run(CHAT, () => f.api.getUser(PLAYER).gold), saved.coins);
  assert.equal(saved.rp.inventory.notebook, 1);
  assert.equal(saved.rp.equipment, 'notebook');
  assert.equal(saved.rp.experience, 62);
  assert.equal((await f.execute('descansar')).code, 'COOLDOWN');
  assert.equal((await f.execute('trabalhar')).code, 'COOLDOWN');
  assert.deepEqual(await f.read(), saved);

  const reopened = new Database(f.sqliteFile);
  t.after(() => reopened.close());
  const fresh = attachUniversalStore(new f.real.Store(f.file), apiFor(reopened));
  const restored = await fresh.scoped(CHAT).transactionGame(state => state.players[PLAYER]);
  assert.deepEqual(restored, saved);
  assert.equal(balance(reopened, CHAT, PLAYER), 7_098);
  const other = await fresh.scoped(OTHER_CHAT).transactionGame(state => state.players[PLAYER]);
  assert.equal(other.coins, 0);
  assert.equal(other.rp.equipment, null);
  assert.equal(other.rp.home, null);
});

test('Alcateia recovery lets a zero-HP player battle without resetting the combat cooldown', async t => {
  const f = await walletFixture(t, { hp: 0 });
  const before = balance(f.raw, CHAT, PLAYER);
  const healed = await f.execute('comprar 5');
  assert.equal(healed.type, 'purchase', healed.message);
  assert.equal(healed.healthRecovered, 25);
  assert.equal(healed.player.hp, 25);
  assert.equal(balance(f.raw, CHAT, PLAYER), before - 40);
  const battle = await f.execute('ataque @sentinela', { target: { jid: OTHER, name: 'Sentinela' } });
  assert.equal(battle.type, 'battle', battle.message);
  const battled = await f.read();
  const full = await f.execute('comprar 7');
  assert.equal(full.type, 'purchase', full.message);
  assert.equal(full.player.hp, 100);
  assert.equal(full.player.lastBattle, battled.lastBattle);
  const repeated = await f.execute('ataque @sentinela', { target: { jid: OTHER, name: 'Sentinela' } });
  assert.equal(repeated.type, 'error');
  assert.equal(repeated.code, 'COOLDOWN');
  const current = await f.read();
  assert.equal(current.lastBattle, battled.lastBattle);
  assert.equal(current.coins, balance(f.raw, CHAT, PLAYER));
});

test('simultaneous new RP purchases share the wallet and reject an unaffordable second item atomically', async t => {
  const f = await walletFixture(t, { gold: 1_600 });
  const results = await Promise.all([f.execute('rpcomprar notebook'), f.execute('rpcomprar kitclinico')]);
  assert.deepEqual(results.map(result => result.type), ['rp-purchase', 'error']);
  assert.equal(results[1].code, 'BALANCE');
  const player = await f.read();
  assert.deepEqual(player.rp.inventory, { notebook: 1 });
  assert.equal(player.coins, 500);
  assert.equal(balance(f.raw, CHAT, PLAYER), 500);
  f.raw.exec("CREATE TRIGGER fail_shop_state BEFORE UPDATE ON universal_game_states BEGIN SELECT RAISE(ABORT,'fixture state failure'); END;");
  await assert.rejects(f.execute('rpcomprar cha'), /fixture state failure/);
  assert.equal(balance(f.raw, CHAT, PLAYER), 500);
  assert.equal(context.run(CHAT, () => f.api.getUser(PLAYER).gold), 500);
});

test('the actual plugin exposes category pages and rest with a custom prefix while preserving legacy shops', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-shop-plugin-'));
  const real = await modules();
  const file = path.join(root, 'storage/alcateia/database.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const game = real.defaultGame();
  const player = real.createPlayer({ jid: PLAYER, name: 'Viajante' }, NOW);
  const rp = real.ensureRP(player, NOW);
  Object.assign(rp, { energy: 20, health: 60, home: { itemId: 'apartamento', name: 'Apartamento', level: 1, acquiredAt: NOW } });
  game.players[PLAYER] = player;
  fs.writeFileSync(file, JSON.stringify({ version: 1, groups: {}, game }));
  const original = async () => assert.fail('o plugin não deve substituir a loja clássica');
  const registry = new Map([['loja', { handler: original }], ['comprar', { handler: original }]]);
  const sent = [], metadata = { id: CHAT, subject: 'Refúgio', participants: [{ id: PLAYER }, { id: BOT, admin: 'admin' }] };
  const sock = { user: { id: BOT }, groupMetadata: async () => structuredClone(metadata),
    sendMessage: async (_, content) => { sent.push(content.text); return { key: { id: 'reply-' + sent.length } }; } };
  let tick = NOW, sequence = 0;
  const plugin = createPlugin({ root, now: () => tick, loadModules: async () => real,
    loadUpstream: () => ({ registry, db: { getUser: () => ({}), getGroup: () => ({}), isBotAdmin: () => false },
      config: { get: key => ({ PREFIX: '!!', BOT_OWNER: OTHER.split('@')[0], BOT_NAME: 'Lobo' }[key] || '') },
      logger: { warn() {}, error() {} } }) });
  t.after(async () => { await plugin.onUnload(); await plugin.drain(); fs.rmSync(root, { recursive: true, force: true }); });
  await plugin.onLoad();
  assert.equal(registry.get('loja').handler, original);
  assert.equal(registry.get('comprar').handler, original);
  assert.equal(plugin.commands.loja, undefined);
  assert.equal(typeof plugin.commands.lojaalcateia, 'function');
  assert.equal(typeof plugin.commands.descansar, 'function');
  const run = async (command, args) => {
    tick += 1_000;
    const body = '!!' + command + (args.length ? ' ' + args.join(' ') : '');
    const ctx = { jid: CHAT, sender: PLAYER, pushName: 'Viajante', command, args, body, PREFIX: '!!',
      msg: { key: { id: 'shop-plugin-' + ++sequence, remoteJid: CHAT, participant: PLAYER }, message: { conversation: body } } };
    await plugin.commands[command](sock, ctx);
    return String(sent.at(-1)).replace(/[*`_]/g, '');
  };
  const equipment = await run('rploja', ['equipamentos']);
  assert.match(equipment, /notebook/);
  assert.match(equipment, /!!rpcomprar/);
  assert.match(equipment, /!!usar/);
  const page = await run('rploja', ['todos', '2']);
  assert.match(page, /Página 2\//);
  assert.match(page, /!!rploja 3/);
  const lunar = await run('lojaalcateia', ['2']);
  assert.match(lunar, /!!compraralcateia/);
  assert.match(lunar, /Expedição de Treino/);
  const rest = await run('descansar', []);
  assert.match(rest, /DESCANSO NO LAR/);
  assert.match(rest, /energia/);
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8')).games[CHAT].players[PLAYER];
  assert.equal(persisted.rp.energy, 40);
  assert.equal(persisted.rp.health, 65);
  assert.equal(persisted.coins, player.coins);
});
