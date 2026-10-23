'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Executado antes da troca de código. Links não são seguidos; falhas abortam a atualização.
async function backupData(root, destination) {
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  async function copy(relative) {
    const source = path.join(root, relative);
    let stat;
    try { stat = await fs.lstat(source); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) throw Error('Backup recusou link em dados protegidos.');
    const target = path.join(destination, relative);
    if (stat.isDirectory()) {
      await fs.mkdir(target, { recursive: true, mode: 0o700 });
      for (const name of await fs.readdir(source)) await copy(path.join(relative, name));
    } else if (stat.isFile()) {
      if (/\.(db|sqlite|sqlite3)$/i.test(relative)) {
        const handle = await fs.open(source, 'r');
        const header = Buffer.alloc(16);
        try { await handle.read(header, 0, 16, 0); } finally { await handle.close(); }
        if (header.toString() === 'SQLite format 3\0') {
          const Database = require('better-sqlite3');
          const db = new Database(source, { readonly: true, fileMustExist: true });
          try { await db.backup(target); } finally { db.close(); }
          await fs.chmod(target, 0o600);
          return;
        }
      }
      // WAL/SHM não são copiados: a API de backup já inclui transações confirmadas.
      if (/-wal$|-shm$/.test(relative)) return;
      await fs.copyFile(source, target);
      await fs.chmod(target, 0o600);
    }
  }
  for (const name of ['.env', 'sessions', 'auth', 'data', 'storage']) await copy(name);
}
module.exports = { backupData };
