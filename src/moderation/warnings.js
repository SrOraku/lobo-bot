'use strict';
function createWarningStore(db) {
  const add = db.transaction((group, user, actor, reason, event) => {
    const inserted = db.prepare('INSERT OR IGNORE INTO group_warning_events(group_jid,user_jid,actor,reason,event_id) VALUES (?,?,?,?,?)')
      .run(group, user, actor, reason, event);
    if (inserted.changes) db.prepare(`INSERT INTO group_warnings(group_jid,user_jid,total) VALUES (?,?,1)
      ON CONFLICT(group_jid,user_jid) DO UPDATE SET total=total+1`).run(group, user);
    return { count: get(group, user), duplicate: !inserted.changes };
  });
  function get(group, user) {
    return db.prepare('SELECT total FROM group_warnings WHERE group_jid=? AND user_jid=?').get(group, user)?.total || 0;
  }
  return {
    add, get,
    reset: db.transaction((group, user, actor) => {
      db.prepare('INSERT INTO group_warning_events(group_jid,user_jid,actor,reason,event_id) VALUES (?,?,?,?,?)')
        .run(group, user, actor, 'RESET', 'reset:' + require('node:crypto').randomUUID());
      db.prepare('DELETE FROM group_warnings WHERE group_jid=? AND user_jid=?').run(group, user);
    }),
  };
}
function getWarningStore() { return createWarningStore(require('../utils/database').db); }
module.exports = { createWarningStore, getWarningStore };
