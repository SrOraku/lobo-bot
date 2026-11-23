'use strict';
module.exports = {
  version: 22,
  name: 'living_forest',
  up: `
    CREATE TABLE forest_state(
      chat_jid TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      rain INTEGER NOT NULL DEFAULT 0 CHECK(rain BETWEEN 0 AND 1000),
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE forest_actions(
      chat_jid TEXT NOT NULL,
      event_id TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('cacar','plantar','patrulhar','avistar')),
      coins INTEGER NOT NULL CHECK(coins BETWEEN 0 AND 1000),
      xp INTEGER NOT NULL CHECK(xp BETWEEN 0 AND 1000),
      karma INTEGER NOT NULL CHECK(karma BETWEEN -100 AND 100),
      day_key TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY(chat_jid,event_id)
    );
    CREATE INDEX forest_actions_cooldown ON forest_actions(chat_jid,user_jid,kind,at);
    CREATE INDEX forest_actions_day ON forest_actions(chat_jid,user_jid,day_key);
    CREATE TABLE forest_sightings(
      chat_jid TEXT NOT NULL,
      legend_id TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY(chat_jid,legend_id)
    );
    CREATE TABLE forest_chronicle(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid TEXT NOT NULL,
      kind TEXT NOT NULL,
      actor TEXT,
      detail TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX forest_chronicle_chat ON forest_chronicle(chat_jid,id);
  `,
};
