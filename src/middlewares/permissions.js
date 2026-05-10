'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — SISTEMA DE PERMISSÕES
// ============================================================

const db = require('../utils/database');
const config = require('../config');

// Níveis de permissão
const LEVELS = {
  USER:        0,  // Membro comum
  GROUP_ADMIN: 1,  // Admin do grupo
  BOT_ADMIN:   2,  // Admin do bot
  OWNER:       3,  // Dono do bot
};

const LEVEL_NAMES = {
  0: '🐾 Membro',
  1: '🌙 Admin do Grupo',
  2: '🐺 Admin do Bot',
  3: '👑 Dono da Matilha',
};

// Cache de metadados de grupo (TTL 60s)
const groupMetaCache = new Map();
async function getGroupMeta(sock, jid) {
  const cached = groupMetaCache.get(jid);
  if (cached && Date.now() - cached.ts < 60000) return cached.data;
  try {
    const data = await sock.groupMetadata(jid);
    groupMetaCache.set(jid, { data, ts: Date.now() });
    return data;
  } catch { return null; }
}

// Resolver nível do usuário
async function resolveLevel(sock, senderJid, groupJid) {
  const ownerNumber = config.get('BOT_OWNER');
  const senderNumber = senderJid.split('@')[0].replace(/\D/g, '');

  if (senderNumber === ownerNumber) return LEVELS.OWNER;
  if (db.isBotAdmin(senderJid))    return LEVELS.BOT_ADMIN;

  if (groupJid) {
    const meta = await getGroupMeta(sock, groupJid);
    if (meta) {
      const p = meta.participants.find(x =>
        x.id.split('@')[0] === senderNumber
      );
      if (p?.admin === 'admin' || p?.admin === 'superadmin') return LEVELS.GROUP_ADMIN;
    }
  }
  return LEVELS.USER;
}

// Verificar se bot é admin no grupo
async function botIsAdmin(sock, groupJid) {
  const meta = await getGroupMeta(sock, groupJid);
  if (!meta) return false;
  const botNum = sock.user?.id?.split(':')[0]?.split('@')[0];
  const p = meta.participants.find(x => x.id.split('@')[0] === botNum);
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

// Middleware de permissão
function requireLevel(minLevel) {
  return function(fn) {
    return async (sock, ctx) => {
      const level = await resolveLevel(sock, ctx.sender, ctx.isGroup ? ctx.jid : null);
      ctx.senderLevel = level;
      ctx.senderLevelName = LEVEL_NAMES[level];

      if (level < minLevel) {
        const needed = LEVEL_NAMES[minLevel];
        return sock.sendMessage(ctx.jid, {
          text: `🚫 *[ ${config.get('BOT_NAME')} ]*\n\n_Você precisa ser_ *${needed}* _para usar este comando!_\n\n🐾 Seu nível: *${LEVEL_NAMES[level]}*`
        }, { quoted: ctx.msg });
      }
      return fn(sock, ctx);
    };
  };
}

const requireOwner      = requireLevel(LEVELS.OWNER);
const requireBotAdmin   = requireLevel(LEVELS.BOT_ADMIN);
const requireGroupAdmin = requireLevel(LEVELS.GROUP_ADMIN);

module.exports = {
  LEVELS,
  LEVEL_NAMES,
  resolveLevel,
  botIsAdmin,
  requireOwner,
  requireBotAdmin,
  requireGroupAdmin,
  getGroupMeta,
};
