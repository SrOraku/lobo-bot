'use strict';
const db = require('../utils/database');
const { BOT_NAME, formatNumber, cleanJid, getNumber, OWNER } = require('../utils/helpers');
const cache = require('../utils/cache');

const DAILY_BASE = 200;
const DAILY_PREMIUM = 500;
const DAILY_COOLDOWN = 24 * 60 * 60; // 24h em segundos

const SHOP_ITEMS = [
  { id: 1, name: '💎 Premium 7 dias', price: 2000, description: 'XP dobrado por 7 dias' },
  { id: 2, name: '🐺 Cure Total de Lobos', price: 200, description: 'Restaura todos os 100 lobos' },
  { id: 3, name: '🔮 Estratégia Aleatória', price: 100, description: 'Sorteia uma estratégia misteriosa' },
  { id: 4, name: '⚡ Boost XP 24h', price: 500, description: 'XP triplicado por 24 horas' },
  { id: 5, name: '🎯 Escudo de Batalha 3h', price: 300, description: 'Imunidade a ataques por 3 horas' },
  { id: 6, name: '🌕 Título "Alfa da Lua"', price: 5000, description: 'Título exclusivo no perfil' },
];

// ============================
// VER GOLD
// ============================
async function verGold(sock, ctx) {
  const { jid, sender, msg, args } = ctx;
  let target = sender;

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) target = cleanJid(mentioned);

  const user = db.getUser(target);
  const gold = user?.gold || 0;

  await sock.sendMessage(jid, {
    text: `💰 *[ ${BOT_NAME} ]*\n\n🐺 *@${getNumber(target)}* possui:\n\n✨ *${formatNumber(gold)} Gold* ✨\n\n_Use !daily para ganhar gold diariamente!_\n_Use !loja para gastar seu gold!_`,
    mentions: [target]
  }, { quoted: msg });
}

// ============================
// ENVIAR GOLD
// ============================
async function enviarGold(sock, ctx) {
  const { jid, sender, msg, args } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const amount = parseInt(args.find(a => /^\d+$/.test(a)) || args[1] || args[0]);

  if (!mentioned || !amount || amount <= 0) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\nUso: *!enviargold @usuário 100*`
    }, { quoted: msg });
  }

  const target = cleanJid(mentioned);
  if (target === sender) return sock.sendMessage(jid, { text: `❌ Você não pode enviar gold para si mesmo!` }, { quoted: msg });

  const user = db.getUser(sender);
  if ((user?.gold || 0) < amount) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\nSaldo insuficiente!\n💰 Você tem: *${formatNumber(user?.gold || 0)} Gold*`
    }, { quoted: msg });
  }

  db.addGold(sender, -amount);
  db.addGold(target, amount);
  db.logGoldTransaction(sender, target, amount, 'Transferência');

  await sock.sendMessage(jid, {
    text: `💸 *[ ${BOT_NAME} ]*\n\n✅ Transferência realizada!\n\n👤 De: @${getNumber(sender)}\n👤 Para: @${getNumber(target)}\n💰 Valor: *${formatNumber(amount)} Gold*\n\n_A matilha cuida dos seus!_ 🐺`,
    mentions: [sender, target]
  }, { quoted: msg });
}

// ============================
// RANK GOLD
// ============================
async function rankGold(sock, ctx) {
  const { jid, msg } = ctx;
  const top = db.topGold();

  const lines = top.map((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
    const name = u.name || getNumber(u.jid);
    return `${medal} *${name}*\n    💰 ${formatNumber(u.gold)} Gold`;
  }).join('\n\n');

  await sock.sendMessage(jid, {
    text: `╔══════════════════════╗
║  💰 *RANKING DE GOLD*  ║
╚══════════════════════╝

🌹 *[ ${BOT_NAME} ]*

${lines || '📭 Nenhum usuário com gold ainda!'}

_Quem é o mais rico da matilha? 🐺_`
  }, { quoted: msg });
}

// ============================
// DAILY
// ============================
async function daily(sock, ctx) {
  const { jid, sender, msg, pushName } = ctx;
  const cacheKey = `daily_${sender}`;
  const last = await cache.get(cacheKey);

  if (last) {
    const remaining = DAILY_COOLDOWN - Math.floor((Date.now() - last) / 1000);
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    return sock.sendMessage(jid, {
      text: `⏰ *[ ${BOT_NAME} ]*\n\n⏳ Você já coletou seu daily hoje!\n\n_Próximo daily em: *${h}h ${m}m*_`
    }, { quoted: msg });
  }

  const user = db.getUser(sender);
  const isPremium = user?.premium;
  const goldAmount = isPremium ? DAILY_PREMIUM : DAILY_BASE;
  const xpAmount = isPremium ? 100 : 50;

  db.addGold(sender, goldAmount);
  db.addXP(sender, xpAmount);
  db.logGoldTransaction('daily', sender, goldAmount, 'Recompensa diária');

  await cache.set(cacheKey, Date.now(), DAILY_COOLDOWN);

  await sock.sendMessage(jid, {
    text: `🌅 *[ ${BOT_NAME} ]*\n\n✅ *Daily coletado, ${pushName}!*\n\n💰 *+${formatNumber(goldAmount)} Gold*\n⭐ *+${xpAmount} XP*\n${isPremium ? '\n👑 Bônus Premium aplicado!' : ''}\n\n_Volte amanhã para mais recompensas!_\n_Uuuuuuwooooo! 🐺🌕_`
  }, { quoted: msg });
}

// ============================
// LOJA
// ============================
async function loja(sock, ctx) {
  const { jid, msg } = ctx;
  const items = SHOP_ITEMS.map(item =>
    `*[${item.id}]* ${item.name}\n    💰 *${formatNumber(item.price)} Gold*\n    _${item.description}_`
  ).join('\n\n');

  await sock.sendMessage(jid, {
    text: `╔══════════════════════╗
║   🏪 *LOJA DA MATILHA*  ║
╚══════════════════════╝

🌹 *[ ${BOT_NAME} ]*

${items}

━━━━━━━━━━━━━━━━━━━━
_Use *!comprar [ID]* para comprar!_
_Ex: !comprar 2_`
  }, { quoted: msg });
}

// ============================
// COMPRAR
// ============================
async function comprar(sock, ctx) {
  const { jid, sender, msg, args } = ctx;
  const itemId = parseInt(args[0]);
  const item = SHOP_ITEMS.find(i => i.id === itemId);

  if (!item) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\nItem inválido! Use *!loja* para ver os itens disponíveis.`
    }, { quoted: msg });
  }

  const user = db.getUser(sender);
  if ((user?.gold || 0) < item.price) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\nGold insuficiente!\n💰 Você tem: *${formatNumber(user?.gold || 0)} Gold*\n💸 Precisa: *${formatNumber(item.price)} Gold*`
    }, { quoted: msg });
  }

  db.addGold(sender, -item.price);

  // Aplicar efeito do item
  let effectMsg = '';
  if (itemId === 1) { // Premium 7 dias
    db.db.prepare(`UPDATE users SET premium = 1 WHERE jid = ?`).run(sender);
    effectMsg = '👑 Premium ativado por 7 dias!';
  } else if (itemId === 2) { // Cure lobos
    db.updateWolvesAlive(sender, 100);
    effectMsg = '🐺 Todos os 100 lobos foram curados!';
  } else if (itemId === 3) { // Estratégia aleatória
    const atk = Math.floor(Math.random() * 60) + 20;
    const def = Math.floor(Math.random() * (80 - atk));
    const ctr = 100 - atk - def;
    db.upsertStrategy(sender, atk, def, ctr);
    effectMsg = `🎲 Estratégia sorteada: Ataque ${atk} / Defesa ${def} / Contra ${ctr}`;
  } else if (itemId === 4) { // Boost XP
    effectMsg = '⚡ Boost de XP ativado por 24h!';
  } else if (itemId === 5) { // Escudo
    const cache = require('../utils/cache');
    await cache.set(`shield_${sender}`, true, 3 * 3600);
    effectMsg = '🛡️ Escudo ativado por 3 horas!';
  } else if (itemId === 6) { // Título
    effectMsg = '🌕 Título "Alfa da Lua" concedido!';
  }

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🛒 *Compra realizada!*\n\n📦 ${item.name}\n💰 *-${formatNumber(item.price)} Gold*\n\n${effectMsg}\n\n_A matilha agradece! 🐺_`
  }, { quoted: msg });
}

async function premiumInfo(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: `👑 *[ ${BOT_NAME} ]*\n\n*VANTAGENS PREMIUM:*\n\n• ⭐ XP dobrado por mensagem\n• 💰 Daily dobrado (500 gold)\n• 🐺 Título especial no perfil\n• ⚡ Acesso a comandos exclusivos\n\n_Compre na !loja por apenas 2000 Gold!_`
  }, { quoted: msg });
}

module.exports = { verGold, enviarGold, rankGold, daily, loja, comprar, premiumInfo };
