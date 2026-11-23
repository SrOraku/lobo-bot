'use strict';
module.exports = {
  version: 22,
  name: 'alcateia_action_receipts',
  up: `CREATE TABLE alcateia_action_receipts (
    chat_jid TEXT NOT NULL, actor_jid TEXT NOT NULL, event_id TEXT NOT NULL,
    command TEXT NOT NULL, occurred_at INTEGER NOT NULL,
    PRIMARY KEY (chat_jid, actor_jid, event_id)
  ) WITHOUT ROWID;`,
};
