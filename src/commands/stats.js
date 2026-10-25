'use strict';
const db = require('../utils/database');
const { card, mono, command, progress } = require('../ui/text');
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
  if (!user) return sock.sendMessage(jid, { text: '❌ *Ação inválida!* _Usuário não encontrado._' }, { quoted: msg });

  const nextLevelXP = Math.pow((user.level) / 0.1, 2);
  const bar = progressBar(user.xp, nextLevelXP, 15);

  await sock.sendMessage(jid, {
    text: card('⭐ SISTEMA DE LEVEL', [
      `👤 *Jogador:* ${user.name || getNumber(target)}`,
      `${require('../services/economy').isPremium(user) ? '👑 *PREMIUM*' : ''}`,
      `🏆 *Rank:* ${user.rank}`,
      `${require('../services/economy').economy().titles(target).filter(t=>t.equipped).map(t=>'🌕 *Título:* '+t.title_name).join('\n')}`,
      `🆙 *Level:* ${mono(user.level)}`,
      `⭐ *XP:* ${mono(formatNumber(user.xp))} / ${mono(formatNumber(Math.floor(nextLevelXP)))}`,
      `${bar}`,
    ], { tip: '_Continue ativo para ganhar XP!_ 🐺' }),
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
  if (!user) return sock.sendMessage(jid, { text: '❌ *Ação inválida!* _Usuário não encontrado._' }, { quoted: msg });

  const winRate = strat?.total_attacks > 0
    ? ((strat.total_victories / strat.total_attacks) * 100).toFixed(1) : '0.0';

  await sock.sendMessage(jid, {
    text: card('🐺 FICHA DO GUERREIRO', [
      `👤 *Nome:* ${user.name || getNumber(target)}`,
      `🏆 *Rank:* ${user.rank}`,
      `${require('../services/economy').economy().titles(target).filter(t=>t.equipped).map(t=>'🌕 *Título:* '+t.title_name).join('\n')}`,
      `🆙 *Level:* ${mono(user.level)}`,
      `⭐ *XP total:* ${mono(formatNumber(user.xp))}`,
      `${require('../services/economy').isPremium(user) ? '👑 *Status: PREMIUM*\n' : ''}`,
      `💰 *WoK coin:* ${mono(formatNumber(user.gold))}`,
      `🚀 *Boosts:* ${require('../progression/service').progression().effects(jid,target).map(e=>e.type+' '+mono(e.multiplier+'×')).join(', ')||'nenhum'}`,
      '├─ ✦ *BATALHAS*',
      `⚔️ *Total:* ${mono(user.battles)}`,
      `🏆 *Vitórias:* ${mono(user.wins)} • *Derrotas:* ${mono(user.losses)}`,
      `📈 *Win rate:* ${mono(winRate+'%')} ${progress(winRate,100)}`,
      '├─ ✦ *LOBISOMENS*',
      `❤️ *Lobos vivos:* ${mono(strat?.wolves_alive ?? 100)}/${mono(100)} ${progress(strat?.wolves_alive ?? 100,100)}`,
      `🗡️ *Ataque:* ${mono(strat?.attack ?? 34)}`,
      `🛡️ *Defesa:* ${mono(strat?.defense ?? 33)}`,
      `🔄 *Contra:* ${mono(strat?.counter ?? 33)}`,
      `📅 *Desde:* ${mono(formatDate(user.created_at))}`,
    ], { tip: '_Cada treino fortalece sua presença na matilha._' }),
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
    return `${medal} *${name}*\n🆙 *Lv.* ${mono(u.level)} • ⭐ ${mono(formatNumber(u.xp))} XP • ${u.rank}`;
  }).join('\n\n');

  await sock.sendMessage(jid, {
    text: card('🏆 RANKING GERAL', [
      `${lines || '📭 _Nenhum usuário no ranking._'}`,
    ], { tip: '_Quem é o Alpha? 🐺🌕_' })
  }, { quoted: msg });
}

// ============================
// ESTATÍSTICAS DO GRUPO
// ============================
async function estatisticasGrupo(sock, ctx) {
  const { jid, msg } = ctx;
  if (!ctx.isGroup) return sock.sendMessage(jid, { text: '❌ *Ação inválida!* _Use este comando dentro de um grupo._' }, { quoted: msg });

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
    group?.antiinactivity ? `✅ Anti-Inatividade (${mono(group.inactivity_days+'d')})` : '❌ Anti-Inatividade',
  ].join('\n');

  await sock.sendMessage(jid, {
    text: card('📊 ESTATÍSTICAS DO GRUPO', [
      `👥 *Membros:* ${mono(members)} • 👑 *Admins:* ${mono(admins)}`,
      `🔒 *Status:* ${group?.open ? '🔓 Aberto' : '🔒 Fechado'}`,
      '├─ ✦ *PROTEÇÕES*',
      `${protections}`,
      '├─ ✦ *CONFIGURAÇÕES*',
      `▸ *Bem-vindo:* ${group?.welcome ? '✅' : '❌'}`,
      `▸ *Level up:* ${group?.level_up_msg ? '✅' : '❌'}`,
      `▸ *Auto-reply:* ${group?.auto_reply ? '✅' : '❌'}`,
    ], { tip: `Use ${command('!antilink')}, ${command('!antifake')} etc. para gerenciar!` })
  }, { quoted: msg });
}

module.exports = { verLevel, perfil, rankGeral, estatisticasGrupo };
