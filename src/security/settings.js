'use strict';
function createSettings(db) {
  const cache = new Map();
  function get(key, fallback) {
    if (!cache.has(key)) {
      const row = db.prepare('SELECT value FROM bot_settings WHERE key=?').get(key);
      cache.set(key,row ? JSON.parse(row.value) : fallback);
    }
    return structuredClone(cache.get(key));
  }
  function set(key,value,actor,action=key) {
    db.transaction(() => {
      db.prepare('INSERT INTO bot_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
      db.prepare('INSERT INTO security_audit(actor,action,details) VALUES (?,?,?)').run(actor,action,JSON.stringify(value));
    })();
    cache.set(key,structuredClone(value));
  }
  return {get,set};
}
let repository;
const current = () => repository ||= createSettings(require('../utils/database').db);
module.exports = {createSettings,get:(...args)=>current().get(...args),set:(...args)=>current().set(...args)};
