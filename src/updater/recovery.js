'use strict';
// This module is deliberately dependency-free: it runs before loading the runtime.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
function write(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(tmp, 'wx', mode);
  try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function target(root, name) {
  if (typeof name !== 'string' || path.isAbsolute(name) || name.split(/[\\/]/).some(p => !p || p === '..' || p === '.')) throw Error('RECOVERY_INVALID_PATH');
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('RECOVERY_SYMLINK');
  }
  return current;
}
function restore(root) {
  const journal = path.join(root, 'updates/apply-journal.json');
  if (!fs.existsSync(journal)) return false;
  const record = JSON.parse(fs.readFileSync(journal, 'utf8'));
  if (!/^backup-[\w-]+$/.test(record.backup) || !Array.isArray(record.saved)) throw Error('RECOVERY_INVALID_JOURNAL');
  const pending = path.join(root, 'updates/pending-release.json');
  if (fs.existsSync(pending) && JSON.parse(fs.readFileSync(pending, 'utf8')).backup !== record.backup) throw Error('RECOVERY_PENDING_MISMATCH');
  const backup = target(root, 'updates/' + record.backup);
  const { managedPath } = require('./source');
  // Validate every backup before changing any live file.
  const entries = record.saved.map(entry => {
    if (!managedPath(entry.name)) throw Error('RECOVERY_PROTECTED_PATH');
    const destination = target(root, entry.name);
    const data = entry.present ? fs.readFileSync(target(backup, entry.name)) : null;
    if (data && createHash('sha256').update(data).digest('hex') !== entry.sha256) throw Error('RECOVERY_HASH_MISMATCH');
    return { ...entry, destination, data };
  });
  for (const entry of entries) {
    if (entry.present) write(entry.destination, entry.data, entry.mode);
    else fs.rmSync(entry.destination, { force: true });
  }
  const modules = target(root, 'node_modules');
  const oldModules = target(backup, 'node_modules');
  if (fs.existsSync(oldModules)) {
    fs.rmSync(modules, { recursive: true, force: true });
    fs.renameSync(oldModules, modules);
  } else if (record.hadModules === false && !record.reuseDependencies) {
    fs.rmSync(modules, { recursive: true, force: true });
  }
  const state = path.join(root, 'updates/state.json');
  if (record.previous) write(state, JSON.stringify(record.previous));
  else fs.rmSync(state, { force: true });
  fs.rmSync(pending, { force: true });
  fs.unlinkSync(journal);
  return true;
}
function recover(root, { lease } = {}) {
  const journal = target(root, 'updates/apply-journal.json');
  const lock = target(root, 'updates/update.lock');
  if (!lease && !fs.existsSync(journal) && !fs.existsSync(lock)) return false;
  // Even a journal must never be restored while another updater is applying it.
  const owned = lease || require('./lock').acquireLock(root, { action: 'recovery' });
  try { owned.assertOwned(); return restore(root); }
  finally { if (!lease) owned.release(); }
}
module.exports = { recover, write, target };
