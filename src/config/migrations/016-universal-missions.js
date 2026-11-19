'use strict';

module.exports = {
  version: 16,
  name: 'universal_daily_weekly_missions',
  up: `
    CREATE TABLE mission_events(
      chat_jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      event_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      week_key TEXT NOT NULL,
      metadata TEXT NOT NULL,
      PRIMARY KEY(chat_jid,user_jid,event_id,kind)
    );
    CREATE INDEX mission_events_period ON mission_events(chat_jid,user_jid,kind,day_key,week_key);
    CREATE INDEX mission_events_week ON mission_events(chat_jid,user_jid,kind,week_key);
    CREATE TABLE mission_claims(
      chat_jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      period_key TEXT NOT NULL,
      event_id TEXT NOT NULL,
      coin_reward INTEGER NOT NULL CHECK(coin_reward BETWEEN 0 AND 1000),
      xp_reward INTEGER NOT NULL CHECK(xp_reward BETWEEN 0 AND 1000),
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY(chat_jid,user_jid,mission_id,period_key),
      UNIQUE(chat_jid,event_id)
    );
  `,
};
