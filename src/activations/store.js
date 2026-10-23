'use strict';
const { defaults } = require('./policy');
function createPolicyStore(db) {
  const select = db.prepare('SELECT policy FROM group_activations WHERE group_jid=?');
  const write = db.prepare(
    "INSERT INTO group_activations(group_jid,policy,updated_by) VALUES (?,?,?) ON CONFLICT(group_jid) DO UPDATE SET policy=excluded.policy,updated_by=excluded.updated_by,updated_at=datetime('now')",
  );
  function get(jid) {
    const row = select.get(jid);
    return row ? JSON.parse(row.policy) : defaults();
  }
  return {
    get,
    update: db.transaction((jid, actor, fn) => {
      const next = fn(get(jid));
      write.run(jid, JSON.stringify(next), actor);
      return next;
    }),
  };
}
let instance;
function getStore() {
  return instance || (instance = createPolicyStore(require('../utils/database').db));
}
module.exports = { createPolicyStore, getStore };
