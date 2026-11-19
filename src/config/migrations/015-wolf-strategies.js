'use strict';

module.exports = {
  version: 15,
  name: 'saved_wolf_strategies',
  up: `
    CREATE TABLE saved_wolf_strategies (
      chat_jid TEXT NOT NULL, user_jid TEXT NOT NULL, name_key TEXT NOT NULL,
      name TEXT NOT NULL, attack INTEGER NOT NULL CHECK(attack BETWEEN 0 AND 100),
      defense INTEGER NOT NULL CHECK(defense BETWEEN 0 AND 100),
      counter INTEGER NOT NULL CHECK(counter BETWEEN 0 AND 100),
      created_at INTEGER NOT NULL,
      CHECK(attack+defense+counter=100),
      PRIMARY KEY(chat_jid,user_jid,name_key)
    );
    CREATE TABLE wolf_strategy_operations (
      chat_jid TEXT NOT NULL, event_id TEXT NOT NULL, user_jid TEXT NOT NULL,
      action TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(chat_jid,event_id)
    );
    CREATE INDEX saved_wolf_strategy_owner ON saved_wolf_strategies(chat_jid,user_jid,created_at);
  `,
};
