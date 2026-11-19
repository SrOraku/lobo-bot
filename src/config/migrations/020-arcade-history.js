'use strict';
module.exports = { version: 20, name: 'arcade_history_records_coop', up: `
  CREATE TABLE phase1_arcade_results(
    chat_jid TEXT NOT NULL,event_id TEXT NOT NULL,user_jid TEXT NOT NULL,name TEXT NOT NULL,
    game TEXT NOT NULL,points INTEGER NOT NULL CHECK(points BETWEEN 0 AND 10000),
    won INTEGER NOT NULL CHECK(won IN (0,1)),moves INTEGER NOT NULL DEFAULT 0,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,details TEXT NOT NULL DEFAULT '{}',at INTEGER NOT NULL,
    PRIMARY KEY(chat_jid,event_id,user_jid)
  );
  CREATE INDEX phase1_arcade_history_user ON phase1_arcade_results(chat_jid,user_jid,at DESC);
  CREATE INDEX phase1_arcade_history_game ON phase1_arcade_results(chat_jid,game,at DESC);
  CREATE TABLE phase1_arcade_coop(
    chat_jid TEXT NOT NULL,game TEXT NOT NULL,state TEXT,available_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(chat_jid,game)
  );
` };
