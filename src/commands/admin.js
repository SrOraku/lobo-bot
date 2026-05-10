'use strict';
const db = require('../utils/database');
const { BOT_NAME, OWNER, cleanJid, getNumber, sleep } = require('../utils/helpers');
const { CronJob } = require('cron');

const scheduledJobs = new Map();

function requireOwner(fn) {
  return async (sock, ctx) => {
    const isOwner = ctx.senderNumber === OWNER;
    const isBotAdm = db.isBotAdmin(ctx.sender);
    if (!isOwner && !isBotAdm) {
      return sock.sendMessage(ctx.jid, {
        text: `🚫 *[ ${BOT_NAME} ]*\n\n_Apenas o dono do bot pode usar este comando!_ 🐺`
      }, { quoted: ctx.msg });
    }
    return fn(sock, ctx);
  };
}

// ============================
// ADD ADMIN DO BOT
// ============================
const addAdmin = requireOwner(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem adicionar como admin!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.addBotAdmin(target);

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n👑 *@${getNumber(target)}* foi adicionado como *Admin do Bot*!`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// REMOVE ADMIN DO BOT
// ============================
const removeAdmin = requireOwner(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: `❌ Mencione quem remover!` }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.removeBotAdmin(target);

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n👤 *@${getNumber(target)}* foi removido dos admins!`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// BROADCAST
// ============================
const broadcast = requireOwner(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  if (!args.length) return sock.sendMessage(jid, { text: `❌ Informe a mensagem!\n_Ex: !broadcast Olá a todos!_` }, { quoted: msg });

  const message = args.join(' ');
  const groups = db.db.prepare(`SELECT jid FROM groups`).all();

  await sock.sendMessage(jid, {
    text: `📡 *[ ${BOT_NAME} ]*\n\n📤 Enviando broadcast para *${groups.length}* grupos...\n_Aguarde..._`
  }, { quoted: msg });

  let sent = 0;
  for (const g of groups) {
    try {
      await sock.sendMessage(g.jid, {
        text: `📢 *[ ${BOT_NAME} ]*\n\n*COMUNICADO DA MATILHA:*\n\n${message}`
      });
      sent++;
      await sleep(500);
    } catch {}
  }

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n📡 Broadcast enviado para *${sent}/${groups.length}* grupos!`
  }, { quoted: msg });
});

// ============================
// AGENDAR MENSAGEM
// ============================
const agendarMensagem = requireOwner(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  // Uso: !agendarmensagem [cron] [mensagem]
  // Ex: !agendarmensagem "0 8 * * *" Bom dia matilha!
  const cronExpr = args[0];
  const message = args.slice(1).join(' ');

  if (!cronExpr || !message) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\nUso: *!agendarmensagem "cron" mensagem*\n\nExemplos de cron:\n• "0 8 * * *" = Todo dia às 8h\n• "0 */6 * * *" = A cada 6 horas\n• "0 20 * * 1" = Segunda às 20h`
    }, { quoted: msg });
  }

  try {
    const jobId = `job_${jid}_${Date.now()}`;
    const job = new CronJob(cronExpr, async () => {
      await sock.sendMessage(jid, {
        text: `⏰ *[ ${BOT_NAME} ]*\n\n*📅 MENSAGEM AGENDADA:*\n\n${message}`
      });
    }, null, true, 'America/Sao_Paulo');

    scheduledJobs.set(jobId, job);
    db.db.prepare(`INSERT INTO scheduled_messages (group_id, message, cron_expr) VALUES (?, ?, ?)`).run(jid, message, cronExpr);

    await sock.sendMessage(jid, {
      text: `✅ *[ ${BOT_NAME} ]*\n\n⏰ Mensagem agendada!\n\n📅 Cron: *${cronExpr}*\n💬 Mensagem: *${message}*\n🆔 ID: ${jobId}`
    }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao agendar!\n_Cron inválido: ${err.message}_` }, { quoted: msg });
  }
});

// ============================
// AUTO REPLY (ADD)
// ============================
async function addAutoReply(sock, ctx) {
  const { jid, msg, args } = ctx;
  // Uso: !autoreply gatilho | resposta
  const full = args.join(' ');
  const [trigger, ...responseParts] = full.split('|');
  const response = responseParts.join('|').trim();

  if (!trigger?.trim() || !response) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\nUso: *!autoreply gatilho | resposta*\n\nEx: !autoreply oi | Olá! Bem-vindo à matilha! 🐺`
    }, { quoted: msg });
  }

  db.addAutoReply(ctx.isGroup ? jid : null, trigger.trim(), response);

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🤖 Auto-reply adicionado!\n\n🎯 Gatilho: *${trigger.trim()}*\n💬 Resposta: *${response}*`
  }, { quoted: msg });
}

// ============================
// AUTO REPLY (REMOVE)
// ============================
async function removeAutoReply(sock, ctx) {
  const { jid, msg, args } = ctx;
  const id = parseInt(args[0]);
  if (!id) return sock.sendMessage(jid, { text: `❌ Informe o ID da auto-reply!` }, { quoted: msg });

  db.removeAutoReply(id, jid);
  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🗑️ Auto-reply *#${id}* removida!`
  }, { quoted: msg });
}

// ============================
// PING
// ============================
async function ping(sock, ctx) {
  const { jid, msg } = ctx;
  const start = Date.now();
  const sentMsg = await sock.sendMessage(jid, { text: `🏓 *[ ${BOT_NAME} ]*\n\n_Calculando ping..._` }, { quoted: msg });
  const latency = Date.now() - start;

  await sock.sendMessage(jid, {
    text: `🏓 *[ ${BOT_NAME} ]*\n\n⚡ *Pong!*\n\n📡 Latência: *${latency}ms*\n${latency < 200 ? '🟢 Excelente!' : latency < 500 ? '🟡 Boa' : '🔴 Alta latência'}`
  }, { quoted: msg });
}

// ============================
// UPTIME
// ============================
async function uptime(sock, ctx) {
  const { jid, msg } = ctx;
  const ut = process.uptime();
  const h = Math.floor(ut / 3600);
  const m = Math.floor((ut % 3600) / 60);
  const s = Math.floor(ut % 60);

  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);

  await sock.sendMessage(jid, {
    text: `🐺 *[ ${BOT_NAME} ]*\n\n⏱️ *UPTIME:* ${h}h ${m}m ${s}s\n💾 *Memória:* ${memMB}MB\n🟢 *Status:* Online\n\n_A matilha nunca dorme! 🌕_`
  }, { quoted: msg });
}


// ============================

// ============================
// PLUGINS
// ============================
async function plugins(sock, ctx) {
  const { jid, msg } = ctx;
  const { listPlugins } = require('../core/pluginLoader');
  const { BOT_NAME, DEV_NAME, DEV_TEL } = require('../utils/helpers');
  const list = listPlugins();

  if (!list.length) {
    return sock.sendMessage(jid, {
      text: [
        '🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹',
        '',
        `*[ ${BOT_NAME} ]*`,
        '',
        '🔌 *Nenhum plugin carregado!*',
        '',
        '_Adicione plugins na pasta /plugins_',
        '',
        '🌹🐺✦❀🌹🐺✦❀🌹',
      ].join('\n')
    }, { quoted: msg });
  }

  const lines = list
    .map((p, i) => `*[${i + 1}]* ${p.name} v${p.version}\n   _${p.description}_`)
    .join('\n\n');

  await sock.sendMessage(jid, {
    text: [
      '🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹',
      '',
      `*[ ${BOT_NAME} ]*`,
      '',
      '🔌 *PLUGINS ATIVOS:*',
      '',
      lines,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `👨‍💻 _Dev: *${DEV_NAME}*_`,
      `📞 _${DEV_TEL}_`,
      '',
      '🌹🐺✦❀🌹🐺✦❀🌹',
    ].join('\n')
  }, { quoted: msg });
}

module.exports = { addAdmin, removeAdmin, broadcast, agendarMensagem, addAutoReply, removeAutoReply, ping, uptime, plugins };
