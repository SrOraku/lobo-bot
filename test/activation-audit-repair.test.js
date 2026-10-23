'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/config/migrations');
const { createPolicyStore } = require('../src/activations/store');

test('boot recupera auditoria ausente sem repetir migração de configurações', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  runMigrations(db);
  const jid = '1200001@g.us';
  db.prepare('INSERT INTO users(jid,gold,xp) VALUES (?,?,?)').run('5511999999999', 4321, 900);
  db.prepare('INSERT INTO groups(jid,antilink) VALUES (?,?)').run(jid, 0);
  const policy = JSON.stringify({ bot: true, features: { antilink: true, bemvindo: false } });
  db.prepare('INSERT INTO group_activations(group_jid,policy,updated_by) VALUES (?,?,?)')
    .run(jid, policy, 'owner');
  db.exec('DROP TABLE activation_audit');
  // Mesmo com todas as migrações marcadas, o boot verifica a tabela real.
  assert.equal(runMigrations(db), 0);
  assert.equal(db.prepare('SELECT policy FROM group_activations WHERE group_jid=?').get(jid).policy, policy);
  assert.deepEqual(db.prepare('SELECT gold,xp FROM users').get(), { gold: 4321, xp: 900 });
  const store = createPolicyStore(db);
  store.update(jid, 'owner', (p) => { p.features.antilink = false; return p; });
  const rows = db.prepare('SELECT feature,actor FROM activation_audit').all();
  assert.deepEqual(rows, [{ feature: 'features.antilink', actor: 'owner' }]);
  runMigrations(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM activation_audit').get().n, 1);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_activation_audit_group'").get());
});

test('atualização de banco v6 com auditoria ausente aplica reparo v7', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  runMigrations(db);
  db.exec('DROP TABLE activation_audit; DELETE FROM schema_migrations WHERE version=7');
  assert.equal(runMigrations(db), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM activation_audit').get().n, 0);
});
