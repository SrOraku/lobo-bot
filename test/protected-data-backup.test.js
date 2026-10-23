'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { backupData } = require('../src/updater/data-backup');
test('backup preserva credenciais, JSON e transações SQLite em WAL', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-data-backup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const directory of ['data', 'sessions/bot', 'storage/alcateia'])
    await fs.mkdir(path.join(root, directory), { recursive: true });
  await fs.writeFile(path.join(root, 'sessions/bot/creds.json'), '{"test":true}');
  await fs.writeFile(path.join(root, 'storage/alcateia/database.json'), '{"coins":987}');
  const db = new Database(path.join(root, 'data/lobo.db'));
  t.after(() => db.close());
  db.pragma('journal_mode=WAL');
  db.exec('CREATE TABLE balances(coins INTEGER); INSERT INTO balances VALUES (987)');
  const destination = path.join(root, 'backup');
  await backupData(root, destination);
  const snapshot = new Database(path.join(destination, 'data/lobo.db'), { readonly: true });
  try { assert.equal(snapshot.prepare('SELECT coins FROM balances').get().coins, 987); }
  finally { snapshot.close(); }
  for (const name of ['sessions/bot/creds.json', 'storage/alcateia/database.json'])
    assert.equal(await fs.readFile(path.join(destination, name), 'utf8'), await fs.readFile(path.join(root, name), 'utf8'));
  assert.equal((await fs.stat(destination)).mode & 0o777, 0o700);
});
test('backup recusa links em sessão e interrompe sem alterar a origem', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-backup-link-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'secret'), 'fixture');
  await fs.symlink(path.join(root, 'secret'), path.join(root, 'sessions'));
  await assert.rejects(backupData(root, path.join(root, 'backup')), /link/);
  assert.equal(await fs.readFile(path.join(root, 'secret'), 'utf8'), 'fixture');
});


test('backup repete SQLITE_BUSY sem alterar o banco original e fecha a conexão', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-busy-backup-'));
  t.after(() => fs.rm(root, { recursive:true, force:true }));
  await fs.mkdir(path.join(root,'data'));
  await fs.writeFile(path.join(root,'data/lobo.db'), 'SQLite format 3\0');
  let tries = 0, closed = false, waits = 0;
  await backupData(root,path.join(root,'backup'), {
    openDatabase: () => ({
      backup: async target => { if (++tries < 3) throw Object.assign(Error('busy'), {code:'SQLITE_BUSY'}); await fs.writeFile(target,'snapshot'); },
      close: () => { closed = true; },
    }), wait: async () => { waits++; },
  });
  assert.equal(tries,3); assert.equal(waits,2); assert.ok(closed);
  assert.equal(await fs.readFile(path.join(root,'data/lobo.db'),'utf8'),'SQLite format 3\0');
});
