'use strict';
module.exports = {
  version: 19,
  name: 'gartic_categories_and_seasons',
  up: `CREATE TABLE phase1_gartic_results(
    chat_jid TEXT NOT NULL,round_id TEXT NOT NULL,user_jid TEXT NOT NULL,name TEXT NOT NULL,
    category TEXT NOT NULL,season TEXT NOT NULL,points INTEGER NOT NULL CHECK(points=30),won_at INTEGER NOT NULL,
    PRIMARY KEY(chat_jid,round_id));
    CREATE INDEX phase1_gartic_season_ranking ON phase1_gartic_results(chat_jid,season,category,user_jid);
    CREATE TABLE phase1_gartic_actions(chat_jid TEXT NOT NULL,event_id TEXT NOT NULL,user_jid TEXT NOT NULL,action TEXT NOT NULL,round_id TEXT,at INTEGER NOT NULL,PRIMARY KEY(chat_jid,event_id));`,
};
