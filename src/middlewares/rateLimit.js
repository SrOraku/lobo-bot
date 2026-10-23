'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — ANTI-FLOOD & RATE LIMITER
// ============================================================

const config = require('../config');

const CMD_COOLDOWN_MS  = config.getNumber('CMD_COOLDOWN_MS') || 1500;
const FLOOD_LIMIT      = 8;    // max comandos em janela
const FLOOD_WINDOW_MS  = 10000; // janela de 10s
const FLOOD_BAN_MS     = 60000; // banido por 1 min

const cmdCooldown  = new Map(); // jid → lastCmdTime
const floodTracker = new Map(); // jid → { count, windowStart }
const floodBanned  = new Map(); // jid → bannedUntil

function checkRateLimit(senderJid) {
  senderJid=require('../isolation/context').cacheKey(senderJid);
  const now = Date.now();

  // Verificar flood ban
  const bannedUntil = floodBanned.get(senderJid);
  if (bannedUntil && now < bannedUntil) {
    const remaining = Math.ceil((bannedUntil - now) / 1000);
    return { allowed: false, reason: 'flood_ban', remaining };
  }
  if (bannedUntil && now >= bannedUntil) floodBanned.delete(senderJid);

  // Cooldown entre comandos
  const lastCmd = cmdCooldown.get(senderJid);
  if (lastCmd && (now - lastCmd) < CMD_COOLDOWN_MS) {
    return { allowed: false, reason: 'cooldown', remaining: Math.ceil((CMD_COOLDOWN_MS - (now - lastCmd)) / 1000) };
  }

  // Rastrear flood
  let tracker = floodTracker.get(senderJid);
  if (!tracker || (now - tracker.windowStart) > FLOOD_WINDOW_MS) {
    tracker = { count: 0, windowStart: now };
  }
  tracker.count++;
  floodTracker.set(senderJid, tracker);

  if (tracker.count > FLOOD_LIMIT) {
    floodBanned.set(senderJid, now + FLOOD_BAN_MS);
    floodTracker.delete(senderJid);
    return { allowed: false, reason: 'flood', remaining: Math.ceil(FLOOD_BAN_MS / 1000) };
  }

  cmdCooldown.set(senderJid, now);
  return { allowed: true };
}

// Limpeza periódica de mapas (a cada 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cmdCooldown) if (now - v > 60000) cmdCooldown.delete(k);
  for (const [k, v] of floodTracker) if (now - v.windowStart > FLOOD_WINDOW_MS * 2) floodTracker.delete(k);
  for (const [k, v] of floodBanned) if (now > v) floodBanned.delete(k);
}, 300000).unref();

module.exports = { checkRateLimit };
