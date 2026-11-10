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
async function resolveLevel(sock, senderJid, groupJid, message = null) {
  const {IdentityResolver,normalizeJid,verifiedMember}=await import('../../addons/alcateia/src/identity.js');
  let alternative = null;
  const key = message?.key;
  if (key?.remoteJid) {
    const group = key.remoteJid.endsWith('@g.us');
    const authenticated = normalizeJid(key.fromMe ? sock.user?.id : group ? key.participant : key.remoteJid);
    // Use somente a identidade alternativa da própria mensagem recebida.
    // ctx.senderNumber e o destinatário de mensagens fromMe não provam autoria.
    if (!authenticated || authenticated !== normalizeJid(senderJid) ||
        (group ? key.remoteJid !== groupJid : !!groupJid)) return LEVELS.USER;
    alternative = key.fromMe ? sock.user?.lid : group ? key.participantAlt : key.remoteJidAlt;
  }
  const meta=groupJid?await getGroupMeta(sock,groupJid):null;
  const resolver = new IdentityResolver(sock,config.get('BOT_OWNER')+'@s.whatsapp.net',meta);
  const actor = await verifiedMember(resolver,senderJid,alternative);
  if (!actor) return LEVELS.USER;
  let securityActor = null;
  if(groupJid){
    try {
      const c=await require('../security/groups/service').security().permissions.context(sock,groupJid,senderJid,alternative,{force:false,meta:meta||undefined});
      if(c.actor.conflict)return LEVELS.USER;
      securityActor = c.actor;
    } catch { /* A falha não concede níveis de segurança adicionais. */ }
  }
  if(actor?.isOwner===true || require('../utils/owners').ownerNumbers(config).includes(actor?.phoneNumber?.split('@')[0]))return LEVELS.OWNER;
  if(db.isBotAdmin(senderJid)||actor?.phoneNumber&&db.isBotAdmin(actor.phoneNumber))return LEVELS.BOT_ADMIN;
  if(securityActor?.level>=2)return LEVELS.BOT_ADMIN;
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
      const level = await resolveLevel(sock, ctx.sender, ctx.isGroup ? ctx.jid : null, ctx.msg);
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
