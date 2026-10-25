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
  if (cached && Date.now() - cached.ts < 3000) return cached.data;
  try {
    const data = await sock.groupMetadata(jid);
    if(groupMetaCache.size>=1000)groupMetaCache.delete(groupMetaCache.keys().next().value);
    groupMetaCache.set(jid, { data, ts: Date.now() });
    return data;
  } catch { return null; }
}

// Resolver nível do usuário
async function resolveLevel(sock, senderJid, groupJid) {
  const {IdentityResolver}=await import('../../addons/alcateia/src/identity.js');
  const meta=groupJid?await getGroupMeta(sock,groupJid):null;
  const actor=await new IdentityResolver(sock,config.get('BOT_OWNER')+'@s.whatsapp.net',meta).member(senderJid);
  if(require('../utils/owners').ownerNumbers(config).includes(actor?.phoneNumber?.split('@')[0]))return LEVELS.OWNER;
  if(db.isBotAdmin(senderJid)||actor?.phoneNumber&&db.isBotAdmin(actor.phoneNumber))return LEVELS.BOT_ADMIN;
  if(groupJid){const c=await require('../security/groups/service').security().permissions.context(sock,groupJid,senderJid,null,{force:false,meta:meta||undefined});if(c.actor.level>=2)return LEVELS.BOT_ADMIN;}
  if(actor?.isAdmin)return LEVELS.GROUP_ADMIN;
  return LEVELS.USER;
}

// Verificar se bot é admin no grupo
async function botIsAdmin(sock, groupJid) {
  try{return (await require('../security/groups/service').security().permissions.context(sock,groupJid,sock.user?.id,sock.user?.lid,{force:true})).bot.isAdmin===true;}catch{return false;}
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
          text: require('../core/response').error('Sem permissão', `*${config.get('BOT_NAME')}*\n_Você precisa ser ${needed} para usar este comando!_\n*Seu nível:* ${LEVEL_NAMES[level]}`)
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
