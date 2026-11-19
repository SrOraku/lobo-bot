'use strict';

const { MISSIONS, EVENT_KINDS, LIMITS } = require('./catalog');
const context = require('../isolation/context');
const DAY = 86_400_000;
const PHONE = /^\d{8,15}@s\.whatsapp\.net$/;
const IDENTITY_MESSAGE = 'Não consegui confirmar seu número para as missões. Aguarde a sincronização PN/LID ou tente no privado do bot.';

function error(code, message) { return Object.assign(new Error(message), { code }); }
function rawDatabase(db) { return db?.[Symbol.for('lobo.rawDatabase')] || db; }
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) throw error('MISSION_TIME', 'Data da missão inválida.');
  return value;
}
function periods(at) {
  timestamp(at);
  const pieces = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at)).map(item => [item.type, item.value]));
  const day = `${pieces.year}-${pieces.month}-${pieces.day}`;
  const localDay = new Date(day + 'T00:00:00Z');
  const monday = new Date(localDay.getTime() - ((localDay.getUTCDay() + 6) % 7) * DAY);
  return { day, week: monday.toISOString().slice(0, 10) };
}
function canonical(db, chat, original) {
  context.chatId(chat);
  if (typeof original !== 'string' || !/^\d{8,20}@(s\.whatsapp\.net|lid)$/.test(original)) return null;
  const alias = db.prepare('SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=? AND user_jid=?').get(chat, original)?.wallet_jid;
  const id = alias || original;
  return PHONE.test(id) ? id : null;
}
function eventId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\x00-\x1f]/.test(value)) throw error('MISSION_EVENT', 'Ação da missão sem identificador válido.');
  return value;
}
function schemaAvailable(db) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mission_events'").get());
}

// Synchronous by design: callers place this inside their successful game
// transaction, so a failed game/action can never leave progress behind.
function recordGameEvent(database, input) {
  const db = rawDatabase(database);
  if (!schemaAvailable(db)) return { recorded: false, reason: 'SCHEMA_UNAVAILABLE' };
  const { chat, user: original, kind, metadata = {} } = input;
  if (!EVENT_KINDS.includes(kind)) throw error('MISSION_KIND', 'Tipo de acontecimento não reconhecido.');
  const user = canonical(db, chat, original);
  if (!user) return { recorded: false, reason: 'IDENTITY_UNCONFIRMED' };
  const event = eventId(input.event), at = timestamp(input.at ?? Date.now()), period = periods(at);
  const safeMetadata = {};
  if (typeof metadata.game === 'string' && /^[a-z0-9_-]{1,40}$/.test(metadata.game)) safeMetadata.game = metadata.game;
  if (typeof metadata.won === 'boolean') safeMetadata.won = metadata.won;
  if (Number.isSafeInteger(metadata.points) && metadata.points >= 0 && metadata.points <= 100_000) safeMetadata.points = metadata.points;
  const result = db.prepare('INSERT OR IGNORE INTO mission_events(chat_jid,user_jid,event_id,kind,occurred_at,day_key,week_key,metadata) VALUES(?,?,?,?,?,?,?,?)')
    .run(chat, user, event, kind, at, period.day, period.week, JSON.stringify(safeMetadata));
  return { recorded: Boolean(result.changes), duplicate: !result.changes };
}

function createMissions(api, { now = Date.now } = {}) {
  const db = rawDatabase(api.db);
  function requireIdentity(chat, original) {
    const user = canonical(db, chat, original);
    if (!user) throw error('MISSION_IDENTITY', IDENTITY_MESSAGE);
    return user;
  }
  function list(chat, original, filter) {
    const user = requireIdentity(chat, original), at = timestamp(now()), period = periods(at);
    if (filter && !['daily', 'weekly'].includes(filter)) throw error('MISSION_PERIOD', 'Escolha missões diárias ou semanais.');
    return MISSIONS.filter(item => !filter || item.period === filter).map(item => {
      const key = item.period === 'daily' ? period.day : period.week;
      const column = item.period === 'daily' ? 'day_key' : 'week_key';
      const progress = db.prepare(`SELECT count(*) AS count FROM mission_events WHERE chat_jid=? AND user_jid=? AND kind=? AND ${column}=?`).get(chat, user, item.kind, key).count;
      const claim = db.prepare('SELECT claimed_at FROM mission_claims WHERE chat_jid=? AND user_jid=? AND mission_id=? AND period_key=?').get(chat, user, item.id, key);
      return { ...item, periodKey: key, progress: Math.min(item.target, progress), complete: progress >= item.target, claimed: Boolean(claim), claimedAt: claim?.claimed_at || null };
    });
  }
  function claim(chat, original, id, actionId) {
    return context.run(chat, () => db.transaction(() => {
      const user = requireIdentity(chat, original), event = eventId(actionId), at = timestamp(now());
      const mission = list(chat, user).find(item => item.id === id);
      if (!mission) throw error('MISSION_NOT_FOUND', 'Missão inexistente. Consulte !missoes.');
      if (mission.claimed) return { duplicate: true, mission, coins: 0, xp: 0 };
      if (!mission.complete) throw error('MISSION_INCOMPLETE', 'Você ainda não concluiu os objetivos desta missão.');
      if (db.prepare('SELECT 1 FROM mission_claims WHERE chat_jid=? AND event_id=?').get(chat, event)) throw error('MISSION_DUPLICATE_ACTION', 'Esta ação de resgate já foi processada.');
      const current = api.getUser(user);
      if (!current) throw error('MISSION_PROFILE', 'Seu perfil não foi encontrado neste chat. Use um comando do jogo antes de resgatar.');
      if (current.banned || current.muted) throw error('MISSION_RESTRICTED', 'Este perfil está impedido de resgatar recompensas.');
      if (!Number.isSafeInteger(current.gold) || !Number.isSafeInteger(current.gold + mission.coins) || current.gold < 0) throw error('MISSION_BALANCE', 'A carteira excederia o limite permitido.');
      if (!Number.isSafeInteger(current.xp || 0) || !Number.isSafeInteger((current.xp || 0) + mission.xp)) throw error('MISSION_XP', 'O XP excederia o limite permitido.');
      const paid = db.prepare('SELECT COALESCE(sum(coin_reward),0) AS coins,COALESCE(sum(xp_reward),0) AS xp FROM mission_claims WHERE chat_jid=? AND user_jid=? AND period_key=? AND mission_id LIKE ?').get(chat, user, mission.periodKey, mission.period === 'daily' ? 'd-%' : 's-%');
      const coinLimit = mission.period === 'daily' ? LIMITS.dailyCoins : LIMITS.weeklyCoins;
      const xpLimit = mission.period === 'daily' ? LIMITS.dailyXP : LIMITS.weeklyXP;
      if (paid.coins + mission.coins > coinLimit || paid.xp + mission.xp > xpLimit) throw error('MISSION_LIMIT', 'O limite de recompensas deste período já foi atingido.');
      db.prepare('INSERT INTO mission_claims(chat_jid,user_jid,mission_id,period_key,event_id,coin_reward,xp_reward,claimed_at) VALUES(?,?,?,?,?,?,?,?)').run(chat, user, id, mission.periodKey, event, mission.coins, mission.xp, at);
      api.addGold(user, mission.coins);
      const xp = api.addXP(user, mission.xp);
      if (xp === null) throw error('MISSION_PROFILE', 'Não foi possível atualizar o perfil da missão.');
      if (api.logGoldTransaction) api.logGoldTransaction('missions', user, mission.coins, `Missão ${mission.id} (${mission.periodKey})`);
      return { duplicate: false, mission, coins: mission.coins, xp: mission.xp };
    })());
  }
  return { list, claim, record: input => recordGameEvent(db, input), periods };
}

module.exports = { createMissions, recordGameEvent, periods, canonical, MISSIONS, LIMITS };
