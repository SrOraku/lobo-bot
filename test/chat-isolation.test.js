'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { runMigrations, migrations } = require('../src/config/migrations');
const { createScopedDatabase } = require('../src/isolation/sqlite');
const scopes = require('../src/isolation/context');
const A = '120001@g.us',
  B = '120002@g.us',
  C = '120003@g.us',
  U = '5511999999999@s.whatsapp.net';
function seed(db) {
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT)');
  for (const m of migrations.filter((m) => m.version < 6)) {
    db.exec(m.up);
    db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(m.version, m.name);
  }
  db.prepare('INSERT INTO users(jid,name,gold,xp,level,premium) VALUES (?,?,5000,200,3,1)').run(
    U,
    'Lobo',
  );
  db.prepare('INSERT INTO wolf_strategy(jid,attack) VALUES (?,40)').run(U);
  runMigrations(db);
}
function fixture(t) {
  const db = new Database(':memory:');
  seed(db);
  t.after(() => db.close());
  return { db, sql: createScopedDatabase(db) };
}
test('copia Gold/XP/lobos/premium uma vez e isola grupos, privado e cópia futura', async (t) => {
  const { db, sql } = fixture(t),
    get = sql.prepare('SELECT * FROM users WHERE jid=?'),
    add = sql.prepare('UPDATE users SET gold=gold+?,xp=xp+? WHERE jid=?');
  await Promise.all([
    scopes.run(A, async () => {
      assert.equal(get.get(U).gold, 5000);
      await Promise.resolve();
      add.run(100, 40, U);
    }),
    scopes.run(B, async () => {
      assert.equal(get.get(U).gold, 5000);
      await Promise.resolve();
      add.run(20, 5, U);
    }),
  ]);
  scopes.run(A, () => {
    assert.equal(get.get(U).gold, 5100);
    assert.equal(get.get(U).xp, 240);
    assert.equal(get.get(U).premium, 1);
    assert.equal(sql.prepare('SELECT attack FROM wolf_strategy WHERE jid=?').get(U).attack, 40);
  });
  scopes.run(B, () => {
    assert.equal(get.get(U).gold, 5020);
    assert.equal(get.get(U).xp, 205);
  });
  db.prepare('UPDATE users SET gold=1').run();
  scopes.run(C, () => assert.equal(get.get(U).gold, 5000));
  scopes.run(U, () => {
    assert.equal(get.get(U).gold, 5000);
    add.run(500, 0, U);
  });
  scopes.run(A, () => assert.equal(get.get(U).gold, 5100));
});
test('ban, mute, compras, ranking e SQL direto ficam no chat; cargos globais permanecem globais', (t) => {
  const { sql } = fixture(t);
  scopes.run(A, () => {
    sql.prepare('UPDATE users SET banned=1,muted=1,gold=10,premium=0 WHERE jid=?').run(U);
    sql
      .prepare('INSERT INTO users(jid,name,gold) VALUES (?,?,9999)')
      .run('5511888888888@s.whatsapp.net', 'Outro');
    sql.prepare('INSERT INTO admins(jid) VALUES (?)').run(U);
  });
  scopes.run(B, () => {
    const row = sql.prepare('SELECT * FROM users WHERE jid=?').get(U);
    assert.equal(row.banned, 0);
    assert.equal(row.muted, 0);
    assert.equal(row.premium, 1);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
    assert.ok(sql.prepare('SELECT jid FROM admins WHERE jid=?').get(U));
  });
});
test('isolamento persiste no mesmo SQLite ao reiniciar', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-isolation-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'data.db');
  let db = new Database(file);
  seed(db);
  let sql = createScopedDatabase(db);
  scopes.run(A, () => sql.prepare('UPDATE users SET gold=123 WHERE jid=?').run(U));
  db.close();
  db = new Database(file);
  t.after(() => db.close());
  runMigrations(db);
  sql = createScopedDatabase(db);
  scopes.run(A, () =>
    assert.equal(sql.prepare('SELECT gold FROM users WHERE jid=?').get(U).gold, 123),
  );
  scopes.run(B, () =>
    assert.equal(sql.prepare('SELECT gold FROM users WHERE jid=?').get(U).gold, 5000),
  );
});
test('contexto não vaza após erro e normaliza domínio antigo/dispositivo', async () => {
  await assert.rejects(
    scopes.run(A, async () => {
      await Promise.resolve();
      throw Error('falha');
    }),
  );
  assert.equal(scopes.current(), null);
  assert.equal(
    scopes.run('5511999999999:1@c.us', () => scopes.current()),
    U,
  );
  assert.notEqual(
    scopes.run(A, () => scopes.cacheKey('daily')),
    scopes.run(B, () => scopes.cacheKey('daily')),
  );
  assert.throws(() => scopes.run('../grupo', () => {}));
});
test('RP/Alcateia copiam moedas, família, clã, ranking e cooldown sem misturar transações', async (t) => {
  const { Store } = await import(
    pathToFileURL(path.join(__dirname, '../addons/alcateia/src/store.js')).href
  );
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-json-isolation-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  const legacy = new Store(file);
  await legacy.transactionGame((g) => {
    g.players[U] = { coins: 1000, wins: 4, lastTraining: 123 };
    g.clans.Lua = { members: [U], coins: 300 };
    g.rp.families.Lobo = { members: [U] };
    g.rateLimits[U] = [100];
  });
  // Simula dados da versão anterior, antes da criação do modelo imutável.
  delete legacy.data.gameSeed;
  delete legacy.data.games;
  legacy.save();
  const store = new Store(file);
  await Promise.all([
    store.scoped(A).transactionGame(async (g) => {
      await Promise.resolve();
      g.players[U].coins += 10;
      g.players[U].wins++;
      g.players[U].lastTraining = 456;
      g.clans.Lua.coins++;
      g.rp.families.Lobo.name = 'A';
      g.rateLimits[U].push(200);
    }),
    store.scoped(B).transactionGame((g) => {
      g.players[U].coins -= 20;
    }),
  ]);
  assert.equal(store.data.games[A].players[U].coins, 1010);
  assert.equal(store.data.games[B].players[U].coins, 980);
  assert.equal(store.data.games[B].players[U].lastTraining, 123);
  assert.equal(store.data.games[B].rp.families.Lobo.name, undefined);
  assert.deepEqual(store.data.games[B].rateLimits[U], [100]);
  await store.scoped(C).transactionGame((g) => assert.equal(g.players[U].coins, 1000));
  const restored = new Store(file);
  assert.equal(restored.data.games[A].players[U].wins, 5);
  assert.equal(restored.data.games[B].players[U].wins, 4);
});
test('backup inclui dados de todos os grupos e a cópia inicial', async (t) => {
  const { Store } = await import(
    pathToFileURL(path.join(__dirname, '../addons/alcateia/src/store.js')).href
  );
  const { BackupManager } = await import(
    pathToFileURL(path.join(__dirname, '../addons/alcateia/src/game/backup.js')).href
  );
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-backup-scoped-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'state.json'));
  await store.scoped(A).transactionGame((g) => {
    g.players[U] = { coins: 10 };
  });
  const manager = new BackupManager({ store, directory: path.join(directory, 'backups') });
  const result = await manager.create();
  const files = await fs.readdir(path.join(directory, 'backups'));
  const snapshot = JSON.parse(await fs.readFile(path.join(directory, 'backups', files[0]), 'utf8'));
  assert.equal(snapshot.data.games[A].players[U].coins, 10);
  assert.ok(snapshot.data.gameSeed);
});

test('cache de daily/escudo e antiflood não atravessam os grupos', async () => {
  const interval = global.setInterval;
  global.setInterval = (...args) => interval(...args).unref();
  const { checkRateLimit } = require('../src/middlewares/rateLimit');
  global.setInterval = interval;
  const cache = require('../src/utils/cache');
  await scopes.run(A, () => cache.set('daily_same-player', 123));
  assert.equal(await scopes.run(A, () => cache.get('daily_same-player')), 123);
  assert.equal(await scopes.run(B, () => cache.get('daily_same-player')), null);
  const user = 'isolation-cooldown-player';
  assert.ok(scopes.run(A, () => checkRateLimit(user)).allowed);
  assert.ok(!scopes.run(A, () => checkRateLimit(user)).allowed);
  assert.ok(scopes.run(B, () => checkRateLimit(user)).allowed);
});
test('falha de gravação do JSON não publica dados incompletos em outro grupo', async (t) => {
  const { Store } = await import(
    pathToFileURL(path.join(__dirname, '../addons/alcateia/src/store.js')).href
  );
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-scope-failure-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'state.json'));
  await store.scoped(A).transactionGame((g) => {
    g.players[U] = { coins: 55 };
  });
  const save = store.save;
  store.save = () => {
    throw Error('disco indisponível');
  };
  await assert.rejects(
    store.scoped(B).transactionGame((g) => {
      g.players[U] = { coins: 99 };
    }),
  );
  assert.equal(store.data.games[A].players[U].coins, 55);
  assert.equal(store.data.games[B], undefined);
  store.save = save;
  await store.scoped(B).transactionGame((g) => {
    g.players[U] = { coins: 12 };
  });
  assert.equal(store.data.games[A].players[U].coins, 55);
});
