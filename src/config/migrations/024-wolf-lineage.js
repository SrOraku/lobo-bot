'use strict';
module.exports = {
  version: 24,
  name: 'wolf_lineage',
  up: `
    CREATE TABLE lineage_wolves(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid TEXT NOT NULL,
      owner_jid TEXT NOT NULL,
      name TEXT NOT NULL,
      genome TEXT NOT NULL,
      mark TEXT CHECK(mark IS NULL OR mark IN ('lunar','hetero','estrela')),
      generation INTEGER NOT NULL CHECK(generation BETWEEN 1 AND 10000),
      parent_a INTEGER REFERENCES lineage_wolves(id),
      parent_b INTEGER REFERENCES lineage_wolves(id),
      born_at INTEGER NOT NULL,
      fed_at INTEGER NOT NULL,
      played_at INTEGER NOT NULL,
      bond INTEGER NOT NULL CHECK(bond BETWEEN 0 AND 100),
      bred_at INTEGER,
      status TEXT NOT NULL CHECK(status IN ('toca','livre')),
      active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1))
    );
    CREATE INDEX lineage_wolves_owner ON lineage_wolves(chat_jid,owner_jid,status);
    CREATE INDEX lineage_wolves_parents ON lineage_wolves(chat_jid,parent_a,parent_b);
    CREATE UNIQUE INDEX lineage_wolves_active ON lineage_wolves(chat_jid,owner_jid) WHERE active=1;
    CREATE TABLE lineage_events(
      chat_jid TEXT NOT NULL,
      event_id TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      kind TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY(chat_jid,event_id)
    );
    CREATE INDEX lineage_events_user ON lineage_events(chat_jid,user_jid,kind,at);
    CREATE TABLE lineage_proposals(
      chat_jid TEXT NOT NULL,
      from_jid TEXT NOT NULL,
      to_jid TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY(chat_jid,from_jid)
    );
  `,
};
