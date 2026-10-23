'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Links externos são registrados sem seguir seus destinos. SQLite usa snapshot consistente.
async function backupData(root, destination, {
  openDatabase = file => new (require('better-sqlite3'))(file, { readonly: true, fileMustExist: true }),
  wait = delay => require('node:timers/promises').setTimeout(delay),
} = {}) {
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  const realRoot=await fs.realpath(root), active=new Set();
  const report={createdAt:new Date().toISOString(),complete:true,links:[]};
  const protectedNames=['.env','sessions','auth','data','storage'];
  async function copy(relative, source = path.join(root, relative)) {
    let stat;
    try { stat = await fs.lstat(source); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) {
      const link={path:relative,target:await fs.readlink(source),status:'external-not-followed'};
      report.links.push(link);
      let physical;
      try {physical=await fs.realpath(source);}
      catch(error){if(!['ENOENT','ELOOP'].includes(error.code))throw error;link.status=error.code==='ELOOP'?'cycle-not-followed':'broken-not-followed';report.complete=false;return;}
      const inside=path.relative(realRoot,physical);
      if(!inside||inside==='..'||inside.startsWith('..'+path.sep)||path.isAbsolute(inside)) {report.complete=false;return;}
      if(!protectedNames.includes(inside.split(path.sep)[0])) {link.status='unprotected-not-followed';report.complete=false;return;}
      if(active.has(physical)){link.status='cycle-not-followed';report.complete=false;return;}
      link.status='internal-copied';
      return copy(relative,physical);
    }
    const target = path.join(destination, relative);
    if (stat.isDirectory()) {
      const physical=await fs.realpath(source);
      if(active.has(physical))return;
      active.add(physical);
      try {
        await fs.mkdir(target, { recursive: true, mode: 0o700 });
        for (const name of await fs.readdir(source)) await copy(path.join(relative, name),path.join(source,name));
      } finally {active.delete(physical);}
    } else if (stat.isFile()) {
      if (/\.(db|sqlite|sqlite3)$/i.test(relative)) {
        const handle = await fs.open(source, 'r');
        const header = Buffer.alloc(16);
        try { await handle.read(header, 0, 16, 0); } finally { await handle.close(); }
        if (header.toString() === 'SQLite format 3\0') {
          const db = openDatabase(source);
          try {
            for (let attempt = 0; ; attempt++) {
              try { await db.backup(target); break; }
              catch (error) {
                if (!['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(error.code) || attempt >= 2) throw error;
                await fs.rm(target, { force: true });
                await wait(300 * (attempt + 1));
              }
            }
          } finally { db.close(); }
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
  for (const name of protectedNames) await copy(name);
  await fs.writeFile(path.join(destination,'backup-links.json'),JSON.stringify(report,null,2),{mode:0o600});
  return report;
}
module.exports = { backupData };
