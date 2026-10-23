'use strict';
const db = require('../utils/database');
const { BOT_NAME, cleanJid, getNumber, OWNER, sleep } = require('../utils/helpers');

// Helper: verificar se é admin do grupo
async function isGroupAdmin(sock, jid, senderJid) {
  try {
    const meta = await sock.groupMetadata(jid);
    const p = meta.participants.find(x => cleanJid(x.id) === cleanJid(senderJid));
    return p?.admin === 'admin' || p?.admin === 'superadmin';
  } catch { return false; }
}

async function isBotAdmin(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    const bot = meta.participants.find(x => x.id.split(':')[0] === sock.user.id.split(':')[0]);
    return bot?.admin === 'admin' || bot?.admin === 'superadmin';
  } catch { return false; }
}

function requireGroupAdmin(fn) {
  return async (sock, ctx) => {
    if (!ctx.isGroup) return sock.sendMessage(ctx.jid, { text: `❌ Apenas em grupos!` }, { quoted: ctx.msg });
    const isAdm = await isGroupAdmin(sock, ctx.jid, ctx.sender);
    const isBotAdm = db.isBotAdmin(ctx.sender);
    const isOwner = ctx.senderLevel === 3 || require('../utils/owners').ownerNumbers().includes(ctx.senderNumber);
    if (!isAdm && !isBotAdm && !isOwner) {
      return sock.sendMessage(ctx.jid, {
        text: `🚫 *[ ${BOT_NAME} ]*\n\n_Apenas administradores podem usar este comando!_ 🐺`
      }, { quoted: ctx.msg });
    }
    return fn(sock, ctx);
  };
}

// ============================
// BAN
// ============================
const ban = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg, sender } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem deseja banir!\n_Exemplo: !ban @usuário_` }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.setBanned(target, 1);

  await sock.sendMessage(jid, {
    text: `🔨 *[ ${BOT_NAME} ]*\n\n🚫 *@${getNumber(target)}* foi *BANIDO* do bot!\n\n_Nenhum comando será respondido para esse usuário._`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// UNBAN
// ============================
const unban = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem deseja desbanir!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.setBanned(target, 0);

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🔓 *@${getNumber(target)}* foi *DESBANIDO*!`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// MUTE
// ============================
const mute = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem silenciar!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.setMuted(target, 1);

  await sock.sendMessage(jid, {
    text: `🔇 *[ ${BOT_NAME} ]*\n\n🤫 *@${getNumber(target)}* foi *SILENCIADO*!\n_Comandos do bot ignorados._`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// UNMUTE
// ============================
const unmute = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem deseja desmutar!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.setMuted(target, 0);

  await sock.sendMessage(jid, {
    text: `🔊 *[ ${BOT_NAME} ]*\n\n✅ *@${getNumber(target)}* foi *DESMUTADO*!`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// KICK
// ============================
const kick = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem deseja remover!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: `❌ O bot precisa ser admin do grupo para remover membros!` }, { quoted: msg });

  await sock.sendMessage(jid, {
    text: `👢 *[ ${BOT_NAME} ]*\n\n🚪 *@${getNumber(target)}* foi *REMOVIDO* do grupo!\n\n_A matilha não tolera fraqueza!_ 🐺`,
    mentions: [target]
  }, { quoted: msg });

  await sleep(500);
  await sock.groupParticipantsUpdate(jid, [target], 'remove');
});

// ============================
// ADD
// ============================
const add = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  if (!args[0]) return sock.sendMessage(jid, { text: `❌ Informe o número: !add 5511999999999` }, { quoted: msg });

  const number = args[0].replace(/\D/g, '');
  const targetJid = `${number}@s.whatsapp.net`;

  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: `❌ O bot precisa ser admin para adicionar membros!` }, { quoted: msg });

  await sock.groupParticipantsUpdate(jid, [targetJid], 'add');
  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🐾 *+55${number}* foi adicionado à matilha!`,
  }, { quoted: msg });
});

// ============================
// PROMOVER
// ============================
const promover = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem promover!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  await sock.groupParticipantsUpdate(jid, [target], 'promote');
  await sock.sendMessage(jid, {
    text: `⬆️ *[ ${BOT_NAME} ]*\n\n👑 *@${getNumber(target)}* agora é *ADMIN* da matilha!`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// REBAIXAR
// ============================
const rebaixar = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem rebaixar!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  await sock.groupParticipantsUpdate(jid, [target], 'demote');
  await sock.sendMessage(jid, {
    text: `⬇️ *[ ${BOT_NAME} ]*\n\n👤 *@${getNumber(target)}* foi *rebaixado* para membro.`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// ABRIR / FECHAR GRUPO
// ============================
const abrirGrupo = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: `❌ Bot precisa ser admin!` }, { quoted: msg });

  await sock.groupSettingUpdate(jid, 'not_announcement');
  db.updateGroup(jid, 'open', 1);
  await sock.sendMessage(jid, {
    text: `🔓 *[ ${BOT_NAME} ]*\n\n✅ O grupo foi *ABERTO*!\n_Todos podem enviar mensagens._`
  }, { quoted: msg });
});

const fecharGrupo = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: `❌ Bot precisa ser admin!` }, { quoted: msg });

  await sock.groupSettingUpdate(jid, 'announcement');
  db.updateGroup(jid, 'open', 0);
  await sock.sendMessage(jid, {
    text: `🔒 *[ ${BOT_NAME} ]*\n\n🚫 O grupo foi *FECHADO*!\n_Apenas admins podem enviar mensagens._`
  }, { quoted: msg });
});

// ============================
// TOGGLES DE PROTEÇÃO
// ============================
const toggleAntilink = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  const group = db.getGroup(jid);
  const newVal = group?.antilink ? 0 : 1;
  db.updateGroup(jid, 'antilink', newVal);
  const mode = args[0] || 'delete';
  if (newVal) db.updateGroup(jid, 'antilink_mode', mode);
  await sock.sendMessage(jid, {
    text: `🔗 *[ ${BOT_NAME} ]*\n\n*Anti-Link:* ${newVal ? `✅ *ATIVADO* (modo: ${mode})` : '❌ *DESATIVADO*'}`
  }, { quoted: msg });
});

const toggleAntifake = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const group = db.getGroup(jid);
  const newVal = group?.antifake ? 0 : 1;
  db.updateGroup(jid, 'antifake', newVal);
  await sock.sendMessage(jid, {
    text: `🎭 *[ ${BOT_NAME} ]*\n\n*Anti-Fake:* ${newVal ? '✅ *ATIVADO*' : '❌ *DESATIVADO*'}`
  }, { quoted: msg });
});

const toggleAnticontato = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const group = db.getGroup(jid);
  const newVal = group?.anticontact ? 0 : 1;
  db.updateGroup(jid, 'anticontact', newVal);
  await sock.sendMessage(jid, {
    text: `📞 *[ ${BOT_NAME} ]*\n\n*Anti-Contato:* ${newVal ? '✅ *ATIVADO*' : '❌ *DESATIVADO*'}`
  }, { quoted: msg });
});

const toggleAntitag = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const group = db.getGroup(jid);
  const newVal = group?.antitag ? 0 : 1;
  db.updateGroup(jid, 'antitag', newVal);
  await sock.sendMessage(jid, {
    text: `🏷️ *[ ${BOT_NAME} ]*\n\n*Anti-Marcação:* ${newVal ? '✅ *ATIVADO*' : '❌ *DESATIVADO*'}`
  }, { quoted: msg });
});

const toggleAntiInatividade = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  const group = db.getGroup(jid);
  const days = parseInt(args[0]) || 7;
  const newVal = group?.antiinactivity ? 0 : 1;
  db.updateGroup(jid, 'antiinactivity', newVal);
  if (newVal) db.updateGroup(jid, 'inactivity_days', days);
  await sock.sendMessage(jid, {
    text: `😴 *[ ${BOT_NAME} ]*\n\n*Anti-Inatividade:* ${newVal ? `✅ *ATIVADO* (${days} dias)` : '❌ *DESATIVADO*'}`
  }, { quoted: msg });
});

const limparInatividade = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const group = db.getGroup(jid);
  const days = group?.inactivity_days || 7;
  const botAdm = await isBotAdmin(sock, jid);
  if (!botAdm) return sock.sendMessage(jid, { text: `❌ Bot precisa ser admin!` }, { quoted: msg });

  const inactive = db.getInactiveUsers(jid, days);
  if (!inactive.length) {
    return sock.sendMessage(jid, {
      text: `✅ *[ ${BOT_NAME} ]*\n\nNenhum membro inativo encontrado nos últimos ${days} dias!`
    }, { quoted: msg });
  }

  await sock.sendMessage(jid, {
    text: `⏳ *[ ${BOT_NAME} ]*\n\n🗑️ Removendo *${inactive.length}* membros inativos há mais de *${days} dias*...`
  }, { quoted: msg });

  let removed = 0;
  for (const u of inactive) {
    try {
      await sock.groupParticipantsUpdate(jid, [u.jid], 'remove');
      removed++;
      await sleep(500);
    } catch {}
  }

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🧹 *${removed}* membros inativos foram removidos!\n\n_A matilha permanece forte! 🐺_`
  }, { quoted: msg });
});

// ============================
// MARCAR TODOS
// ============================
const marcarTodos = requireGroupAdmin(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  const text = args.join(' ') || 'Atenção matilha! 🐺';
  const meta = await sock.groupMetadata(jid).catch(() => null);
  if (!meta) return;

  const members = meta.participants.map(p => cleanJid(p.id));
  const chunks = [];
  for (let i = 0; i < members.length; i += 20) {
    chunks.push(members.slice(i, i + 20));
  }

  for (const chunk of chunks) {
    const mentions = chunk.map(m => `@${getNumber(m)}`).join(' ');
    await sock.sendMessage(jid, {
      text: `🌙 *[ ${BOT_NAME} ]*\n\n${text}\n\n${mentions}`,
      mentions: chunk
    });
    await sleep(1000);
  }
});

module.exports = {
  ban, unban, mute, unmute, kick, add, promover, rebaixar,
  abrirGrupo, fecharGrupo,
  toggleAntilink, toggleAntifake, toggleAnticontato, toggleAntitag,
  toggleAntiInatividade, limparInatividade,
  marcarTodos
};
