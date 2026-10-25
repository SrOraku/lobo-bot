'use strict';
const db = require('../utils/database');
const { card, mono, command } = require('../ui/text');
const { BOT_NAME, OWNER, cleanJid, getNumber, sleep } = require('../utils/helpers');
const { CronJob } = require('cron');

const scheduledJobs = new Map();

function requireOwner(fn) {
  return async (sock, ctx) => {
    const isOwner = ctx.senderLevel === 3 || require('../utils/owners').ownerNumbers().includes(ctx.senderNumber);
    const isBotAdm = db.isBotAdmin(ctx.sender);
    if (!isOwner && !isBotAdm) {
      return sock.sendMessage(ctx.jid, {
        text: '❌ *Ação inválida!* _Apenas o dono do bot pode usar este comando._'
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
  if (!mentioned) return sock.sendMessage(jid, { text: '❌ *Ação inválida!* _Mencione quem adicionar como admin._' }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.addBotAdmin(target);

  await sock.sendMessage(jid, {
    text: `✅ *Concluído!* _@${getNumber(target)} foi adicionado como Admin do Bot._`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// REMOVE ADMIN DO BOT
// ============================
const removeAdmin = requireOwner(async (sock, ctx) => {
  const { jid, msg } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) return sock.sendMessage(jid, { text: '❌ *Ação inválida!* _Mencione quem remover dos administradores._' }, { quoted: msg });

  const target = cleanJid(mentioned);
  db.removeBotAdmin(target);

  await sock.sendMessage(jid, {
    text: `✅ *Concluído!* _@${getNumber(target)} foi removido dos administradores._`,
    mentions: [target]
  }, { quoted: msg });
});

// ============================
// BROADCAST
// ============================
const broadcast = requireOwner(async (sock, ctx) => {
  const { jid, msg, args } = ctx;
  if (!args.length) return sock.sendMessage(jid, { text: `❌ *Ação inválida!* _Informe a mensagem._\n> 💡 *Use assim:* ${command('!broadcast Olá a todos!')}` }, { quoted: msg });

  const message = args.join(' ');
  const groups = db.db.prepare(`SELECT jid FROM groups`).all();

  await sock.sendMessage(jid, {
    text: `⏳ *Aguarde um instante!* _Enviando comunicado para ${mono(groups.length)} grupos._`
  }, { quoted: msg });

  let sent = 0;
  for (const g of groups) {
    try {
      await sock.sendMessage(g.jid, {
        text: card('📢 COMUNICADO DA MATILHA', [message], { formatNumbers: false })
      });
      sent++;
      await sleep(500);
    } catch {}
  }

  await sock.sendMessage(jid, {
    text: `✅ *Concluído!* _Comunicado enviado para ${mono(sent)}/${mono(groups.length)} grupos._`
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
      text: card('⏰ AGENDAR MENSAGEM', [
        `❌ *Ação inválida!* _Informe o cron e a mensagem._`,
        `▸ ${mono('0 8 * * *')} — _Todo dia às ${mono('8h')}_`,
        `▸ ${mono('0 */6 * * *')} — _A cada ${mono(6)} horas_`,
        `▸ ${mono('0 20 * * 1')} — _Segunda às ${mono('20h')}_`,
      ], { tip: `💡 *Use assim:* ${command('!agendarmensagem "cron" mensagem')}` })
    }, { quoted: msg });
  }

  try {
    const jobId = `job_${jid}_${Date.now()}`;
    const job = new CronJob(cronExpr, async () => {
      await sock.sendMessage(jid, {
        text: card('⏰ MENSAGEM AGENDADA', [message], { formatNumbers: false })
      });
    }, null, true, 'America/Sao_Paulo');

    scheduledJobs.set(jobId, job);
    db.db.prepare(`INSERT INTO scheduled_messages (group_id, message, cron_expr) VALUES (?, ?, ?)`).run(jid, message, cronExpr);

    await sock.sendMessage(jid, {
      text: card('✅ MENSAGEM AGENDADA', [`📅 *Cron:* ${mono(cronExpr)}`, `💬 *Mensagem:* ${message}`, `🆔 *ID:* ${mono(jobId)}`], { formatNumbers: false })
    }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ *Ação inválida!* _Cron inválido: ${err.message}_` }, { quoted: msg });
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
      text: `❌ *Ação inválida!* _Informe gatilho e resposta._\n> 💡 *Use assim:* ${command('!autoreply gatilho | resposta')}\n> ${command('!autoreply oi | Olá! Bem-vindo à matilha! 🐺')}`
    }, { quoted: msg });
  }

  db.addAutoReply(ctx.isGroup ? jid : null, trigger.trim(), response);

  await sock.sendMessage(jid, {
    text: card('✅ AUTO-REPLY ADICIONADO', [`🎯 *Gatilho:* ${trigger.trim()}`, `💬 *Resposta:* ${response}`], { formatNumbers: false })
  }, { quoted: msg });
}

// ============================
// AUTO REPLY (REMOVE)
// ============================
async function removeAutoReply(sock, ctx) {
  const { jid, msg, args } = ctx;
  const id = parseInt(args[0]);
  if (!id) return sock.sendMessage(jid, { text: '❌ *Ação inválida!* _Informe o ID da auto-reply._' }, { quoted: msg });

  db.removeAutoReply(id, jid);
  await sock.sendMessage(jid, {
    text: `✅ *Concluído!* _Auto-reply ${mono('#'+id)} removida._`
  }, { quoted: msg });
}

// ============================
// PING
// ============================
const { ping } = require('./ping');

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
    text: card('⏱️ TEMPO ONLINE', [`⏱️ *Uptime:* ${mono(h+'h')} ${mono(m+'m')} ${mono(s+'s')}`, `💾 *Memória:* ${mono(memMB+'MB')}`, '🟢 *Status:* Online'], { tip: '_A matilha nunca dorme! 🌕_' })
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
      text: card('🔌 PLUGINS', ['_Nenhum plugin carregado._'], { tip: '_Adicione plugins na pasta /plugins._' })
    }, { quoted: msg });
  }

  const lines = list
    .map((p, i) => `▸ ${mono(i + 1)} *${p.name}* ${mono('v'+p.version)}\n_${p.description}_`)
    .join('\n\n');

  await sock.sendMessage(jid, {
    text: card('🔌 PLUGINS ATIVOS', [lines])
  }, { quoted: msg });
}

module.exports = { addAdmin, removeAdmin, broadcast, agendarMensagem, addAutoReply, removeAutoReply, ping, uptime, plugins };
