'use strict';
// No application dependencies: recovery must work before npm or the runtime.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

function failure(code, message) { return Object.assign(new Error(message), { code }); }
function fingerprint(pid) {
  try {
    const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/)[19];
    return { boot, start };
  } catch { return null; } // Platforms without procfs still use PID liveness.
}
function processState(record) {
  if (!Number.isSafeInteger(record?.pid) || record.pid <= 0) return 'unknown';
  try { process.kill(record.pid, 0); }
  catch (error) { return error.code === 'ESRCH' ? 'dead' : 'unknown'; }
  const current = fingerprint(record.pid);
  if (record.identity && current && (record.identity.boot !== current.boot || record.identity.start !== current.start)) return 'dead';
  return 'alive';
}
function stat(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function readLock(file) {
  const info = stat(file);
  if (!info) return null;
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw failure('LOCK_UNSAFE', 'A trava de atualização não pode ser um atalho.');
  const owner = info.isDirectory() ? path.join(file, 'owner.json') : file;
  const ownerInfo = stat(owner);
  if (!ownerInfo && !stat(file)) return null;
  if (!ownerInfo?.isFile() || ownerInfo.isSymbolicLink() || ownerInfo.size > 8192) throw failure('LOCK_INVALID', 'Trava incompleta ou inválida; confira updates/update.lock.');
  let bytes, record;
  try { bytes = fs.readFileSync(owner); record = JSON.parse(bytes); }
  catch (error) { if (error.code === 'ENOENT') return null; throw failure('LOCK_INVALID', 'Trava de atualização corrompida; confira updates/update.lock.'); }
  if (!Number.isSafeInteger(record?.pid) || record.pid <= 0 || (record.identity && (typeof record.identity.boot !== 'string' || typeof record.identity.start !== 'string'))) throw failure('LOCK_INVALID', 'A trava não identifica corretamente o processo responsável.');
  const key = createHash('sha256').update(`${info.dev}:${info.ino}:`).update(bytes).digest('hex');
  return { record, key, directory: info.isDirectory() };
}
function directory(root) {
  const location = path.resolve(root, 'updates');
  // Check every existing path component before writing a lock or following it.
  let cursor = path.parse(location).root;
  for (const part of location.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (stat(cursor)?.isSymbolicLink()) throw failure('LOCK_UNSAFE', 'A pasta de atualização não pode usar atalhos.');
  }
  fs.mkdirSync(location, { recursive: true, mode: 0o700 });
  return location;
}
function acquireLock(root, { action = 'update', probe = processState } = {}) {
  const location = directory(root), file = path.join(location, 'update.lock');
  const record = { pid: process.pid, at: Date.now(), action, token: randomUUID(), identity: fingerprint(process.pid) };
  const prepared = fs.mkdtempSync(path.join(location, '.lock-ready-'));
  let recovered = false, acquired = false;
  try {
    const fd = fs.openSync(path.join(prepared, 'owner.json'), 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    for (let attempts = 0; attempts < 8; attempts++) {
      const previous = readLock(file);
      if (!previous) {
        try { fs.renameSync(prepared, file); acquired = true; break; }
        catch (error) { if (!['EEXIST', 'ENOTEMPTY', 'ENOTDIR', 'EISDIR'].includes(error.code)) throw error; }
        continue;
      }
      if (probe(previous.record) !== 'dead') throw failure('BUSY', 'Outra atualização está ativa ou não foi possível confirmar que terminou.');
      // Deterministic tombstones prevent a competing reclaimer from moving a
      // replacement lease: a nonempty directory cannot replace the old archive.
      // Legacy file locks become file tombstones; new leases are directories.
      const archive = path.join(location, `retired-lock-${previous.key}`);
      if (stat(archive)) throw failure('BUSY', 'Outra instância está recuperando a atualização interrompida.');
      try { fs.renameSync(file, archive); recovered = true; }
      catch (error) {
        if (!['ENOENT', 'EEXIST', 'ENOTEMPTY', 'ENOTDIR', 'EISDIR'].includes(error.code)) throw error;
        throw failure('BUSY', 'A trava mudou durante a recuperação; tente novamente.');
      }
    }
    if (!acquired) throw failure('BUSY', 'Não foi possível obter a trava de atualização.');
  } finally { if (!acquired) fs.rmSync(prepared, { recursive: true, force: true }); }
  let released = false;
  const assertOwned = () => {
    if (released || readLock(file)?.record.token !== record.token) throw failure('LOCK_LOST', 'A posse da trava de atualização mudou.');
  };
  return { record, recovered, assertOwned,
    release() {
      if (released) return;
      assertOwned();
      const retired = path.join(location, `.lock-released-${record.token}`);
      fs.renameSync(file, retired);
      released = true;
      fs.rmSync(retired, { recursive: true, force: true });
    },
  };
}
module.exports = { acquireLock, processState };
