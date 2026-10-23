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
test('backup registra link sem copiar destino externo às pastas protegidas', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lobo-backup-link-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'secret'), 'fixture');
  await fs.symlink(path.join(root, 'secret'), path.join(root, 'sessions'));
  const report=await backupData(root, path.join(root, 'backup'));
  assert.equal(report.complete,false);assert.equal(report.links[0].status,'unprotected-not-followed');
  await assert.rejects(fs.stat(path.join(root,'backup/sessions')),/ENOENT/);
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
test('internal session directory link is backed up and cycle is recorded without recursion',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lobo-internal-link-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'data/auth'),{recursive:true});await fs.writeFile(path.join(root,'data/auth/creds.json'),'fixture');
 await fs.symlink('data/auth',path.join(root,'sessions'));
 await fs.symlink('..',path.join(root,'data/auth/loop'));
 const report=await backupData(root,path.join(root,'backup'));
 assert.equal(await fs.readFile(path.join(root,'backup/sessions/creds.json'),'utf8'),'fixture');
 assert.ok(report.links.some(link=>link.status==='internal-copied'));assert.ok(report.links.some(link=>link.status==='cycle-not-followed'));
 assert.equal((await fs.lstat(path.join(root,'sessions'))).isSymbolicLink(),true);
});
test('external and broken links never copy external contents or change originals',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lobo-external-link-')),outside=await fs.mkdtemp(path.join(os.tmpdir(),'lobo-outside-'));t.after(async()=>{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});});
 await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(outside,'secret'),'external fixture');
 await fs.symlink(outside,path.join(root,'data/external'));await fs.symlink('missing',path.join(root,'data/broken'));
 const report=await backupData(root,path.join(root,'backup'));assert.equal(report.complete,false);
 assert.ok(report.links.some(link=>link.status==='external-not-followed'));assert.ok(report.links.some(link=>link.status==='broken-not-followed'));
 await assert.rejects(fs.stat(path.join(root,'backup/data/external/secret')),/ENOENT/);
 assert.equal(await fs.readFile(path.join(outside,'secret'),'utf8'),'external fixture');
});
