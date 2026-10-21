import { DEV_SIGNATURE, header } from './constants.js';

const SECOND = 1_000;
const HOUR = 3_600_000;
const HOURLY_LIMIT = 50;

export const ANTI_SPAM_MESSAGE = `${header('ANTI-SPAM')}\n🐺 Calma, lobo.\n⏳ Aguarde antes de usar outro comando.\n${DEV_SIGNATURE}`;

// Call this inside the same game transaction used by the command. Quotas are
// global to the trusted player JID and survive restarts with the game state.
export function consumeCommand(game, jid, now = Date.now()) {
  if (!game.rateLimits) game.rateLimits = {};
  for (const [key, entry] of Object.entries(game.rateLimits)) {
    const timestamps = (Array.isArray(entry?.timestamps) ? entry.timestamps : [])
      .filter(time => Number.isFinite(time) && now - time < HOUR);
    if (!timestamps.length) delete game.rateLimits[key];
    else entry.timestamps = timestamps;
  }
  const entry = game.rateLimits[jid] || { timestamps: [] };
  const timestamps = entry.timestamps;
  const latest = timestamps.length ? Math.max(...timestamps) : null;
  if (latest !== null && now - latest < SECOND) {
    return { allowed: false, reason: 'second', retryAfter: SECOND - (now - latest) };
  }
  if (timestamps.length >= HOURLY_LIMIT) {
    return { allowed: false, reason: 'hour', retryAfter: Math.max(1, HOUR - (now - Math.min(...timestamps))) };
  }
  timestamps.push(now);
  game.rateLimits[jid] = entry;
  return { allowed: true, reason: null, retryAfter: 0 };
}
