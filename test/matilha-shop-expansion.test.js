'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createEconomy, isPremium } = require('../src/services/economy');
const { SHOP_ITEMS, getShopItem, shopPage } = require('../src/economy/shop-catalog');

const JID = '5511999912345@s.whatsapp.net', CHAT = '120600000003@g.us';
const HOUR = 3_600_000, DAY = 24 * HOUR;

function fixture(t, gold = 100_000) {
  const db = new Database(':memory:');
  runMigrations(db);
  t.after(() => db.close());
  let clock = 1_800_000_000_000;
  db.prepare('INSERT INTO users(jid,gold) VALUES (?,?)').run(JID, gold);
  const api = {
    db,
    getUser: jid => db.prepare('SELECT * FROM users WHERE jid=?').get(jid),
    setPremium: (jid, active, until) => db.prepare('UPDATE users SET premium=?,premium_until=? WHERE jid=?').run(active, until, jid),
    getStrategy: jid => db.prepare('SELECT * FROM wolf_strategy WHERE jid=?').get(jid),
    upsertStrategy: (jid, attack, defense, counter) => db.prepare('INSERT INTO wolf_strategy(jid,attack,defense,counter) VALUES (?,?,?,?) ON CONFLICT(jid) DO UPDATE SET attack=excluded.attack,defense=excluded.defense,counter=excluded.counter').run(jid, attack, defense, counter),
    updateWolvesAlive: (jid, value) => db.prepare('UPDATE wolf_strategy SET wolves_alive=? WHERE jid=?').run(value, jid),
    logGoldTransaction: (from, to, amount, reason) => db.prepare('INSERT INTO gold_transactions(from_jid,to_jid,amount,reason) VALUES (?,?,?,?)').run(from, to, amount, reason),
  };
  const service = () => createEconomy(api, { now: () => clock, scope: () => CHAT });
  return { db, api, service, advance: duration => { clock += duration; }, now: () => clock,
    buy: (id, event = 'buy-' + id) => service().buy(JID, getShopItem(id), event) };
}

test('catálogo amplia a loja sem trocar IDs, preços e efeitos dos seis itens originais', () => {
  assert.equal(SHOP_ITEMS.length, 16);
  assert.deepEqual(SHOP_ITEMS.slice(0, 6).map(item => [item.id, item.price, item.type]), [
    [1, 2000, 'premium'], [2, 200, 'heal'], [3, 100, 'strategy'],
    [4, 500, 'effect'], [5, 300, 'effect'], [6, 5000, 'title'],
  ]);
  assert.equal(getShopItem(1).duration, 7 * DAY);
  assert.equal(getShopItem(4).duration, DAY);
  assert.equal(getShopItem(4).multiplier, 3);
  assert.equal(getShopItem(5).duration, 3 * HOUR);
  assert.equal(getShopItem(6).titleId, 'alfa-lua');
  assert.equal(new Set(SHOP_ITEMS.map(item => item.id)).size, SHOP_ITEMS.length);
  assert.ok(SHOP_ITEMS.every(Object.isFrozen));
});

test('cada novo item realmente concede Premium, efeito ou título e registra o preço do catálogo', t => {
  const f = fixture(t);
  for (const item of SHOP_ITEMS.filter(item => item.id >= 7)) {
    const before = f.api.getUser(JID).gold;
    const result = f.buy(item.id);
    assert.equal(f.api.getUser(JID).gold, before - item.price, item.name);
    assert.equal(typeof result.message, 'string');
    if (item.type === 'premium') assert.ok(isPremium(f.api.getUser(JID), f.now()));
    if (item.type === 'effect') assert.ok(f.service().activeEffect(JID, item.effect));
    if (item.type === 'title') assert.ok(f.service().titles(JID).some(title => title.title_id === item.titleId && title.equipped));
  }
  assert.equal(f.db.prepare('SELECT count(*) n FROM gold_transactions').get().n, 10);
});

test('vigílias acumulam duração sem reduzir XP e sobrevivem à recriação do serviço', t => {
  const f = fixture(t);
  const start = f.now();
  f.buy(9);
  f.advance(HOUR);
  f.buy(10);
  const effect = f.service().activeEffect(JID, 'xp');
  assert.equal(effect.multiplier, 3);
  assert.equal(effect.expires_at, start + 8 * HOUR);
  f.advance(7 * HOUR + 1);
  assert.equal(f.service().activeEffect(JID, 'xp'), undefined);
});

test('compra de boost menor preserva efeito mais forte ativo sem cobrar ou registrar a mensagem', t => {
  const f = fixture(t);
  f.db.prepare('INSERT INTO user_effects VALUES (?,?,?,?,?,?)').run(CHAT, JID, 'xp', 4, f.now(), f.now() + HOUR);
  const before = f.api.getUser(JID).gold;
  assert.throws(() => f.buy(9, 'weaker'), /mais forte/);
  assert.equal(f.api.getUser(JID).gold, before);
  assert.equal(f.service().activeEffect(JID, 'xp').multiplier, 4);
  assert.equal(f.db.prepare("SELECT count(*) n FROM economy_operations WHERE event_id='weaker'").get().n, 0);
  f.advance(HOUR + 1);
  f.buy(9, 'weaker');
  assert.equal(f.service().activeEffect(JID, 'xp').multiplier, 3);
});

test('novos escudos usam a proteção existente e títulos podem ser reequipados após reinício', t => {
  const f = fixture(t);
  const start = f.now();
  f.buy(11); f.buy(12);
  assert.equal(f.service().activeEffect(JID, 'shield').expires_at, start + 13 * HOUR);
  f.buy(13); f.buy(14);
  assert.deepEqual(f.service().titles(JID).filter(title => title.equipped).map(title => title.title_id), ['explorador-noturno']);
  f.service().equip(JID, 'guardiao-floresta');
  assert.deepEqual(f.service().titles(JID).filter(title => title.equipped).map(title => title.title_id), ['guardiao-floresta']);
  const before = f.api.getUser(JID).gold;
  assert.throws(() => f.buy(14, 'title-duplicate'), /já possui/);
  assert.equal(f.api.getUser(JID).gold, before);
  assert.deepEqual(f.service().titles(JID).filter(title => title.equipped).map(title => title.title_id), ['guardiao-floresta']);
});

test('passes Premium ampliam o prazo e preservam concessões permanentes existentes', t => {
  const f = fixture(t);
  f.buy(7); f.buy(8);
  assert.equal(Date.parse(f.api.getUser(JID).premium_until), f.now() + 31 * DAY);
  f.api.setPremium(JID, 1, null);
  const before = f.api.getUser(JID).gold;
  assert.throws(() => f.buy(8, 'permanent'), /permanente/);
  assert.equal(f.api.getUser(JID).gold, before);
  assert.equal(f.api.getUser(JID).premium_until, null);
  assert.ok(isPremium(f.api.getUser(JID), f.now()));
});

test('serviço resolve preço e efeito pelo catálogo, sem aceitar oferta adulterada', t => {
  const f = fixture(t);
  f.service().buy(JID, { id: 16, price: 1, type: 'premium', duration: 100 * DAY }, 'forged-price');
  assert.equal(f.api.getUser(JID).gold, 92_000);
  assert.equal(f.api.getUser(JID).premium, 0);
  assert.equal(f.service().titles(JID)[0].title_id, 'lenda-eclipse');
  for (const id of [0, 99, true, '7', NaN, Infinity, 1.5]) assert.throws(() => f.service().buy(JID, { id, price: 1 }, 'invalid-' + id), /inválido/);
  assert.equal(f.api.getUser(JID).gold, 92_000);
});

test('limites de duração, saldo insuficiente e mensagens duplicadas revertem compras por inteiro', t => {
  const f = fixture(t);
  f.buy(11, 'same-message');
  const before = f.api.getUser(JID).gold;
  assert.throws(() => f.buy(12, 'same-message'), /processada/);
  assert.equal(f.api.getUser(JID).gold, before);
  f.db.prepare("UPDATE user_effects SET expires_at=? WHERE type='shield'").run(f.now() + 90 * DAY);
  assert.throws(() => f.buy(12, 'horizon'), /90 dias/);
  assert.equal(f.api.getUser(JID).gold, before);
  assert.equal(f.db.prepare("SELECT count(*) n FROM economy_operations WHERE event_id='horizon'").get().n, 0);
  f.api.setPremium(JID, 1, new Date(f.now() + 365 * DAY).toISOString());
  assert.throws(() => f.buy(7, 'premium-horizon'), /365 dias/);
  assert.equal(f.api.getUser(JID).gold, before);
  f.db.prepare('UPDATE users SET gold=10 WHERE jid=?').run(JID);
  assert.throws(() => f.buy(16, 'poor'), /Saldo insuficiente/);
  assert.equal(f.api.getUser(JID).gold, 10);
  assert.equal(f.service().titles(JID).length, 0);
});

test('falha tardia no histórico reverte pagamento, item e idempotência nas novas modalidades', t => {
  for (const id of [8, 12, 16]) {
    const f = fixture(t);
    f.api.logGoldTransaction = () => { throw Error('histórico indisponível'); };
    assert.throws(() => f.buy(id, 'failed-purchase'), /histórico indisponível/);
    assert.equal(f.api.getUser(JID).gold, 100_000);
    assert.equal(f.api.getUser(JID).premium, 0);
    assert.equal(f.service().titles(JID).length, 0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM user_effects').get().n, 0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM economy_operations').get().n, 0);
  }
});

test('novos efeitos e títulos continuam isolados entre chats', t => {
  const f = fixture(t);
  const other = createEconomy(f.api, { now: f.now, scope: () => '120600000004@g.us' });
  f.buy(9); f.buy(13);
  assert.equal(other.activeEffect(JID, 'xp'), undefined);
  assert.deepEqual(other.titles(JID), []);
  other.buy(JID, getShopItem(14), 'other-title');
  assert.deepEqual(other.titles(JID).map(item => item.title_id), ['explorador-noturno']);
  assert.deepEqual(f.service().titles(JID).map(item => item.title_id), ['guardiao-floresta']);
});

test('compras originais de cura e estratégia continuam funcionais', t => {
  const f = fixture(t);
  f.api.upsertStrategy(JID, 34, 33, 33);
  f.api.updateWolvesAlive(JID, 5);
  f.buy(2);
  assert.equal(f.api.getStrategy(JID).wolves_alive, 100);
  f.buy(3);
  const strategy = f.api.getStrategy(JID);
  assert.equal(strategy.attack + strategy.defense + strategy.counter, 100);
  assert.equal(f.api.getUser(JID).gold, 99_700);
});

test('paginação e categorias tornam todos os IDs compráveis encontráveis', () => {
  const all = [1, 2, 3].flatMap(page => shopPage([String(page)]).items.map(item => item.id));
  assert.deepEqual(all, SHOP_ITEMS.map(item => item.id));
  assert.deepEqual(shopPage([]).items.map(item => item.id), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shopPage(['títulos']).items.map(item => item.id), [6, 13, 14, 15, 16]);
  assert.deepEqual(shopPage(['premium']).items.map(item => item.id), [1, 7, 8]);
  for (const args of [['0'], ['4'], ['xp', '2'], ['bogus'], ['1', '2'], ['xp', 'x']]) assert.throws(() => shopPage(args));
});

test('menu usa o prefixo da instalação e indica lojas RP e Alcateia sem remover os itens antigos', async () => {
  const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
  const file = path.join(__dirname, '../src/commands/gold.js'), loaded = new Module(file, module), native = Module.createRequire(file);
  const mocks = {
    '../utils/database': {}, '../utils/helpers': { formatNumber: String },
    '../ui/text': { card: (title, lines) => [title, ...lines].join('\n'), mono: String, command: String },
    '../config': { get: () => '#' },
  };
  loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : native(name);
  loaded._compile(fs.readFileSync(file, 'utf8'), file);
  const sent = [], sock = { sendMessage: async (_, content) => sent.push(content.text) };
  await loaded.exports.loja(sock, { jid: CHAT, msg: {}, args: [] });
  for (const text of ['#comprar [ID]', '#loja 2', '#loja titulos', '#lojaalcateia', '#rploja equipamentos']) assert.ok(sent.at(-1).includes(text), text);
  assert.ok(sent.at(-1).includes('#atacar'));
  assert.ok(sent.at(-1).includes('#ataque'));
  assert.ok(!sent.at(-1).includes('!atacar'));
  for (const item of SHOP_ITEMS.slice(0, 6)) assert.ok(sent.at(-1).includes(item.name), item.name);
  await loaded.exports.loja(sock, { jid: CHAT, msg: {}, args: ['titulos'] });
  assert.ok(sent.at(-1).includes('Lenda do Eclipse'));
  await loaded.exports.loja(sock, { jid: CHAT, msg: {}, args: ['99'] });
  assert.ok(sent.at(-1).includes('Página inválida'));
});
