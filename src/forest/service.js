'use strict';

const { randomInt } = require('node:crypto');
const context = require('../isolation/context');
const model = require('./model');
const { moonPhase } = require('../wolves/moon-phase');
const { periods } = require('../missions/service');

const DAILY_COIN_CAP = 150;
const CHRONICLE_LIMIT = 40;
const USER = /^\d{5,20}@(?:s\.whatsapp\.net|lid)$/;

function error(code, message, extra = {}) { return Object.assign(new Error(message), { code, ...extra }); }
function rawDatabase(db) { return db?.[Symbol.for('lobo.rawDatabase')] || db; }
function cleanName(value) {
  return String(value || '').replace(/[\u0000-\u001f*_`~]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Lobo';
}
function eventIdOf(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\x00-\x1f]/.test(value)) throw error('FOREST_EVENT', 'Ação da floresta sem identificador válido.');
  return value;
}

// Messages water the forest. Only forests that already exist are touched.
function rain(database, chat) {
  return rawDatabase(database).prepare('UPDATE forest_state SET rain=MIN(rain+1,1000) WHERE chat_jid=?').run(context.chatId(chat)).changes > 0;
}

function createForest(api, { now = Date.now, random = () => randomInt(1_000_000) / 1_000_000 } = {}) {
  const db = rawDatabase(api.db);
  const timestamp = () => {
    const at = now();
    if (!Number.isSafeInteger(at) || at < 0) throw error('FOREST_TIME', 'Relógio da floresta inválido.');
    return at;
  };
  function identity(chat, original) {
    if (typeof original !== 'string' || !USER.test(original)) throw error('FOREST_IDENTITY', 'Não consegui identificar seu perfil. Tente novamente em instantes.');
    return db.prepare('SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=? AND user_jid=?').get(chat, original)?.wallet_jid || original;
  }
  function write(chat, events) {
    if (!events.length) return;
    const insert = db.prepare('INSERT INTO forest_chronicle(chat_jid,kind,actor,detail,at) VALUES(?,?,?,?,?)');
    for (const event of events) insert.run(chat, event.kind, event.actor ?? null, event.detail ?? null, event.at);
    db.prepare('DELETE FROM forest_chronicle WHERE chat_jid=? AND id NOT IN (SELECT id FROM forest_chronicle WHERE chat_jid=? ORDER BY id DESC LIMIT ?)').run(chat, chat, CHRONICLE_LIMIT);
  }
  // Must run inside a transaction: catches the forest up to the present hour.
  function load(chat) {
    const at = timestamp();
    const row = db.prepare('SELECT state,rain,updated_at FROM forest_state WHERE chat_jid=?').get(chat);
    if (!row) {
      const state = model.initialState(at), born = [{ kind: 'nascimento', at }];
      db.prepare('INSERT INTO forest_state(chat_jid,state,rain,updated_at,created_at) VALUES(?,?,0,?,?)').run(chat, JSON.stringify(state), at, at);
      write(chat, born);
      return { state, at, rain: 0, events: born, created: true };
    }
    let stored = null;
    try { stored = JSON.parse(row.state); } catch { /* A corrupted snapshot restarts from safe defaults. */ }
    const result = model.advance(stored, row.updated_at, at, row.rain);
    if (result.steps) {
      db.prepare('UPDATE forest_state SET state=?,rain=0,updated_at=? WHERE chat_jid=?').run(JSON.stringify(result.state), result.updatedAt, chat);
      write(chat, result.events);
    }
    return { state: result.state, at, rain: result.steps ? 0 : row.rain, events: result.events, created: false };
  }
  const save = (chat, state) => db.prepare('UPDATE forest_state SET state=? WHERE chat_jid=?').run(JSON.stringify(state), chat);
  const legendActive = (state, at) => Boolean(state.legend && !state.legend.by && state.legend.until > at);

  function snapshot(chat) {
    const id = context.chatId(chat);
    return db.transaction(() => {
      const loaded = load(id), score = model.health(loaded.state);
      return { ...loaded, health: score, status: model.status(score), season: model.SEASONS[loaded.state.season], moon: moonPhase(loaded.at),
        need: model.need(loaded.state), legend: legendActive(loaded.state, loaded.at) ? loaded.state.legend : null };
    })();
  }

  function forecast(chat) {
    const current = snapshot(chat);
    return { ...current, future: model.forecast(current.state, current.at) };
  }

  function trails(chat, original) {
    const id = context.chatId(chat), user = identity(id, original), at = timestamp();
    const remaining = Object.fromEntries(Object.entries(model.ACTIONS).map(([kind, { cooldown }]) => {
      const last = db.prepare('SELECT max(at) AS at FROM forest_actions WHERE chat_jid=? AND user_jid=? AND kind=?').get(id, user, kind).at;
      return [kind, last == null ? 0 : Math.max(0, last + cooldown - at)];
    }));
    const karma = db.prepare('SELECT COALESCE(sum(karma),0) AS karma FROM forest_actions WHERE chat_jid=? AND user_jid=?').get(id, user).karma;
    return { remaining, karma };
  }

  function guard(chat, original, actionId) {
    const user = identity(chat, original), event = eventIdOf(actionId);
    if (db.prepare('SELECT 1 FROM forest_actions WHERE chat_jid=? AND event_id=?').get(chat, event)) throw error('FOREST_DUPLICATE', 'Esta ação já foi processada; nada foi repetido.');
    const profile = api.getUser(user);
    if (!profile) throw error('FOREST_PROFILE', 'Seu perfil ainda não existe neste chat. Envie uma mensagem e tente de novo.');
    if (profile.banned || profile.muted) throw error('FOREST_RESTRICTED', 'Este perfil está impedido de agir na floresta.');
    return { user, event, profile };
  }
  function pay(user, profile, coins, xp, reason) {
    if (!Number.isSafeInteger(profile.gold) || profile.gold < 0 || !Number.isSafeInteger(profile.gold + coins)) throw error('FOREST_BALANCE', 'A carteira excederia o limite permitido.');
    if (coins) {
      api.addGold(user, coins);
      if (api.logGoldTransaction) api.logGoldTransaction('floresta', user, coins, reason);
    }
    if (xp) api.addXP(user, xp);
  }

  function act(chat, original, name, kind, actionId) {
    const id = context.chatId(chat);
    if (!model.ACTIONS[kind]) throw error('FOREST_ACTION', 'Ação da floresta desconhecida.');
    return context.run(id, () => db.transaction(() => {
      const { user, event, profile } = guard(id, original, actionId), at = timestamp();
      const last = db.prepare('SELECT max(at) AS at FROM forest_actions WHERE chat_jid=? AND user_jid=? AND kind=?').get(id, user, kind).at;
      const ready = last == null ? 0 : last + model.ACTIONS[kind].cooldown;
      if (ready > at) throw error('FOREST_COOLDOWN', 'Suas patas ainda descansam.', { remaining: ready - at, kind });
      const loaded = load(id), before = loaded.state;
      const prize = model.reward(kind, before, at, random());
      const applied = model.applyAction(before, kind, at);
      const day = periods(at).day;
      const earned = db.prepare("SELECT COALESCE(sum(coins),0) AS coins FROM forest_actions WHERE chat_jid=? AND user_jid=? AND day_key=? AND kind<>'avistar'").get(id, user, day).coins;
      const coins = Math.max(0, Math.min(prize.coins, DAILY_COIN_CAP - earned));
      const label = cleanName(name);
      db.prepare('INSERT INTO forest_actions(chat_jid,event_id,user_jid,name,kind,coins,xp,karma,day_key,at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, event, user, label, kind, coins, prize.xp, prize.karma, day, at);
      pay(user, profile, coins, prize.xp, 'Floresta Viva: ' + kind);
      save(id, applied.state);
      const events = applied.events.map(item => ({ ...item, actor: label }));
      write(id, events);
      const score = model.health(applied.state);
      return { kind, coins, xp: prize.xp, karma: prize.karma, capped: coins < prize.coins, scarcity: Boolean(prize.scarcity), moonBonus: Boolean(prize.moonBonus),
        before, after: applied.state, health: score, status: model.status(score), events: [...loaded.events, ...events],
        dailyLeft: DAILY_COIN_CAP - earned - coins, cooldown: model.ACTIONS[kind].cooldown };
    })());
  }

  function sight(chat, original, name, actionId) {
    const id = context.chatId(chat);
    return context.run(id, () => db.transaction(() => {
      const { user, event, profile } = guard(id, original, actionId);
      const loaded = load(id), legend = loaded.state.legend;
      if (!legend || legend.until <= loaded.at) throw error('FOREST_NO_LEGEND', 'Nenhum espírito lendário caminha pela floresta agora. Mantenha a saúde alta para atraí-lo.');
      if (legend.by) throw error('FOREST_LEGEND_TAKEN', `O Cervo Branco já foi avistado por ${legend.by}.`);
      if (!db.prepare('INSERT OR IGNORE INTO forest_sightings(chat_jid,legend_id,user_jid,at) VALUES(?,?,?,?)').run(id, legend.id, user, loaded.at).changes)
        throw error('FOREST_LEGEND_TAKEN', 'O Cervo Branco já foi avistado por outro lobo.');
      const label = cleanName(name), prize = model.SIGHTING_REWARD;
      db.prepare('INSERT INTO forest_actions(chat_jid,event_id,user_jid,name,kind,coins,xp,karma,day_key,at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, event, user, label, 'avistar', prize.coins, prize.xp, prize.karma, periods(loaded.at).day, loaded.at);
      pay(user, profile, prize.coins, prize.xp, 'Floresta Viva: Cervo Branco');
      save(id, { ...loaded.state, legend: { ...legend, by: label } });
      const events = [{ kind: 'avistamento', at: loaded.at, actor: label }];
      write(id, events);
      return { ...prize, legend, events: [...loaded.events, ...events] };
    })());
  }

  function chronicle(chat, limit = 10) {
    const id = context.chatId(chat);
    return db.transaction(() => {
      load(id);
      return db.prepare('SELECT kind,actor,detail,at FROM forest_chronicle WHERE chat_jid=? ORDER BY id DESC LIMIT ?').all(id, limit);
    })();
  }

  function guardians(chat, limit = 10) {
    const id = context.chatId(chat);
    return db.prepare(`SELECT user_jid AS user, SUM(karma) AS karma, COUNT(*) AS actions,
      (SELECT name FROM forest_actions b WHERE b.chat_jid=a.chat_jid AND b.user_jid=a.user_jid ORDER BY at DESC LIMIT 1) AS name
      FROM forest_actions a WHERE chat_jid=? GROUP BY user_jid ORDER BY karma DESC, actions DESC LIMIT ?`).all(id, limit);
  }

  return { snapshot, forecast, trails, act, sight, chronicle, guardians };
}

module.exports = { createForest, rain, DAILY_COIN_CAP, CHRONICLE_LIMIT };
