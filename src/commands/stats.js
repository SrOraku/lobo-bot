'use strict';
const db = require('../utils/database');
const { BOT_NAME, formatNumber, progressBar, cleanJid, getNumber, formatDate } = require('../utils/helpers');

// ============================
// VER LEVEL
// ============================
async function verLevel(sock, ctx) {
  const { jid, sender, msg, pushName } = ctx;
  let target = sender;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) target = cleanJid(mentioned);

  const user = db.getUser(target);
  if (!user) return sock.sendMessage(jid, { text: `❌ Usuário não encontrado!` }, { quoted: msg });

  const nextLevelXP = Math.pow((user.level) / 0.1, 2);
  const bar = progressBar(user.xp, nextLevelXP, 15);

  await sock.sendMessage(jid, {
    text: `╔══════════════════════╗
║   ⭐ *SISTEMA DE LEVEL*  ║
╚══════════════════════╝

🌹 *[ ${BOT_NAME} ]*

👤 *${user.name || getNumber(target)}*
${user.premium ? '👑 *PREMIUM*' : ''}

🏆 *Rank:* ${user.rank}
🆙 *Level:* *${user.level}*
⭐ *XP:* ${formatNumber(user.xp)} / ${formatNumber(Math.floor(nextLevelXP))}

${bar}

_Continue ativo para ganhar XP!_ 🐺`,
    mentions: [target]
  }, { quoted: msg });
}

// ============================
// PERFIL COMPLETO
// ============================
async function perfil(sock, ctx) {
  const { jid, sender, msg } = ctx;
  let target = sender;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) target = cleanJid(mentioned);

  const user = db.getUser(target);
  const strat = db.getStrategy(target);
  if (!user) return sock.sendMessage(jid, { text: `❌ Usuário não encontrado!` }, { quoted: msg });

  const winRate = strat?.total_attacks > 0
    ? ((strat.total_victories / strat.total_attacks) * 100).toFixed(1) : '0.0';

  await sock.sendMessage(jid, {
    text: `╔══════════════════════════╗
║   🐺 *FICHA DO GUERREIRO*  ║
╚══════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

👤 *Nome:* ${user.name || getNumber(target)}
🏆 *Rank:* ${user.rank}
🆙 *Level:* *${user.level}*
⭐ *XP Total:* ${formatNumber(user.xp)}
${user.premium ? '👑 *Status: PREMIUM*\n' : ''}
━━━━━━━━━━━━━━━━━━━━
💰 *Gold:* ${formatNumber(user.gold)}

🐺 *BATALHAS:*
⚔️ Total: ${user.battles}
🏆 Vitórias: ${user.wins}
💀 Derrotas: ${user.losses}
📈 Win Rate: *${winRate}%*

🐺 *LOBISOMENS:*
❤️ Lobos vivos: ${strat?.wolves_alive ?? 100}/100
🗡️ Ataque: ${strat?.attack ?? 34}
🛡️ Defesa: ${strat?.defense ?? 33}
🔄 Contra: ${strat?.counter ?? 33}

📅 *Desde:* ${formatDate(user.created_at)}`,
    mentions: [target]
  }, { quoted: msg });
}

// ============================
// RANKING GERAL
// ============================
async function rankGeral(sock, ctx) {
  const { jid, msg } = ctx;
  const top = db.topLevel();

  const lines = top.map((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
    const name = u.name || getNumber(u.jid);
    return `${medal} *${name}*\n    🆙 Lv.${u.level} | ⭐ ${formatNumber(u.xp)} XP | ${u.rank}`;
  }).join('\n\n');

  await sock.sendMessage(jid, {
    text: `╔══════════════════════╗
║   🏆 *RANKING GERAL*   ║
╚══════════════════════╝

🌹 *[ ${BOT_NAME} ]*

${lines || '📭 Nenhum usuário no ranking!'}

_Quem é o Alpha? 🐺🌕_`
  }, { quoted: msg });
}

// ============================
// ESTATÍSTICAS DO GRUPO
// ============================
async function estatisticasGrupo(sock, ctx) {
  const { jid, msg } = ctx;
  if (!ctx.isGroup) return sock.sendMessage(jid, { text: `❌ Apenas em grupos!` }, { quoted: msg });

  const meta = await sock.groupMetadata(jid).catch(() => null);
  if (!meta) return;

  const members = meta.participants.length;
  const admins = meta.participants.filter(p => p.admin).length;
  const group = db.getGroup(jid);

  const protections = [
    group?.antilink ? '✅ Anti-Link' : '❌ Anti-Link',
    group?.antifake ? '✅ Anti-Fake' : '❌ Anti-Fake',
    group?.anticontact ? '✅ Anti-Contato' : '❌ Anti-Contato',
    group?.antitag ? '✅ Anti-Marcação' : '❌ Anti-Marcação',
    group?.antiinactivity ? `✅ Anti-Inatividade (${group.inactivity_days}d)` : '❌ Anti-Inatividade',
  ].join('\n');

  await sock.sendMessage(jid, {
    text: `╔══════════════════════════╗
║  📊 *ESTATÍSTICAS DO GRUPO*  ║
╚══════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

👥 *Membros:* ${members}
👑 *Admins:* ${admins}
🔒 *Status:* ${group?.open ? '🔓 Aberto' : '🔒 Fechado'}

🛡️ *PROTEÇÕES:*
${protections}

📝 *Configurações:*
• Bem-vindo: ${group?.welcome ? '✅' : '❌'}
• Level Up: ${group?.level_up_msg ? '✅' : '❌'}
• Auto-Reply: ${group?.auto_reply ? '✅' : '❌'}

_Use !antilink, !antifake etc. para gerenciar!_`
  }, { quoted: msg });
}

module.exports = { verLevel, perfil, rankGeral, estatisticasGrupo };
