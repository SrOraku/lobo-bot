'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrations, runMigrations } = require('../src/config/migrations');

test('expansion migrations preserve populated legacy tables and remain idempotent after reopening', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-phase1-preserve-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'lobo.db');
  let db = new Database(filename);
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT,applied_at TEXT DEFAULT(datetime(\'now\')))');
  for (const migration of migrations.filter(item => item.version <= 14)) {
    db.exec(migration.up);
    db.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(migration.version, migration.name);
  }
  const user = '5511999999999@s.whatsapp.net', chat = '123@g.us';
  db.prepare('INSERT INTO users(jid,name,gold,xp,level) VALUES(?,?,?,?,?)').run(user, 'Perfil antigo', 777, 135, 2);
  db.prepare('INSERT INTO wolf_strategy(jid,attack,defense,counter,wolves_alive) VALUES(?,?,?,?,?)').run(user, 45, 30, 25, 67);
  db.prepare('INSERT INTO groups(jid,name) VALUES(?,?)').run(chat, 'Grupo preservado');
  db.prepare('INSERT INTO universal_wallets VALUES(?,?,?)').run(chat, user, 777);
  db.prepare('INSERT INTO universal_wallet_aliases VALUES(?,?,?)').run(chat, user, user);
  db.prepare('INSERT INTO universal_game_states VALUES(?,?)').run(chat, JSON.stringify({ players: { [user]: { coins: 777, hp: 40, level: 3, clan: 'Lua', rp: { inventory: { cafe: 2 }, family: 'Familia' } } }, clans: { Lua: { members: [user] } }, war: { week: '2026-11-16' } }));
  db.prepare('INSERT INTO arcade_sessions VALUES(?,?,?,?,?,?)').run(chat, user, 'aventura', '{"node":"inicio","moves":0}', 100, 0);
  db.prepare('INSERT INTO user_titles VALUES(?,?,?,?,?,?)').run(chat, user, 'alfa', 'Título antigo', 10, 1);
  const tables = ['users', 'wolf_strategy', 'groups', 'universal_wallets', 'universal_wallet_aliases', 'universal_game_states', 'arcade_sessions', 'user_titles'];
  const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare('SELECT * FROM ' + table).all()]));
  const before = snapshot();
  const added = runMigrations(db);
  assert.equal(added, migrations.filter(item => item.version > 14).length);
  assert.deepEqual(snapshot(), before);
  db.close(); db = new Database(filename); t.after(() => db.close());
  assert.equal(runMigrations(db), 0);
  assert.deepEqual(snapshot(), before);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});
