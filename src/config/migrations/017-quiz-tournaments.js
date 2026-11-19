'use strict';
module.exports = { version: 17, name: 'quiz_categories_and_tournaments', up: `
  CREATE TABLE quiz_plus_sessions(chat_jid TEXT NOT NULL,user_jid TEXT NOT NULL,state TEXT,available_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(chat_jid,user_jid));
  CREATE TABLE quiz_tournaments(chat_jid TEXT PRIMARY KEY,state TEXT NOT NULL);
  CREATE TABLE quiz_plus_events(chat_jid TEXT NOT NULL,event_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(chat_jid,event_id));
  CREATE TABLE quiz_plus_results(id TEXT NOT NULL,chat_jid TEXT NOT NULL,user_jid TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,difficulty TEXT NOT NULL,mode TEXT NOT NULL,correct INTEGER NOT NULL,total INTEGER NOT NULL,points INTEGER NOT NULL,finished_at INTEGER NOT NULL,week TEXT NOT NULL,PRIMARY KEY(id,user_jid));
  CREATE INDEX quiz_plus_weekly ON quiz_plus_results(chat_jid,week,category,points DESC);
  CREATE INDEX quiz_plus_history ON quiz_plus_results(chat_jid,user_jid,finished_at DESC);
` };
