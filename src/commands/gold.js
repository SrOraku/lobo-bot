'use strict';
const db = require('../utils/database');
const { formatNumber, cleanJid, getNumber } = require('../utils/helpers');
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
    text: `💰 🐺 *@${getNumber(target)}* possui:\n\n✨ *${formatNumber(gold)} WoK coin* ✨\n\n_Use !daily para ganhar WoK coin diariamente!_\n_Use !loja para gastar sua WoK coin!_`,
    mentions: [target]
  }, { quoted: msg });
}

// ============================
// ENVIAR GOLD
// ============================
async function enviarGold(sock, ctx) {
  if(ctx.args?.[0]?.toLowerCase()==='divida')return require('./expansion').handler('pagardivida')(sock,{...ctx,args:ctx.args.slice(1)});
  const { jid, sender, msg, args } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const token = args.find(a => /^\d+$/.test(a));
  const amount = token ? Number(token) : NaN;

  if (!mentioned || !amount || amount <= 0) {
    return sock.sendMessage(jid, {
      text: `❌ Uso: *!enviargold @usuário 100*`
    }, { quoted: msg });
  }

  const target = cleanJid(mentioned);
  if (target === sender) return sock.sendMessage(jid, { text: `❌ Você não pode enviar WoK coin para si mesmo!` }, { quoted: msg });

  try { require('../services/economy').economy().transfer(sender,target,amount,msg.key?.id); }
  catch(error) { return sock.sendMessage(jid,{text:'❌ '+error.message},{quoted:msg}); }

  await sock.sendMessage(jid, {
    text: `💸 ✅ Transferência realizada!\n\n👤 De: @${getNumber(sender)}\n👤 Para: @${getNumber(target)}\n💰 Valor: *${formatNumber(amount)} WoK coin*\n\n_A matilha cuida dos seus!_ 🐺`,
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
    return `${medal} *${name}*\n    💰 ${formatNumber(u.gold)} WoK coin`;
  }).join('\n\n');

  await sock.sendMessage(jid, {
    text: `╔══════════════════════╗
║  💰 *RANKING WoK COIN*  ║
╚══════════════════════╝



${lines || '📭 Nenhum usuário com WoK coin ainda!'}

_Quem é o mais rico da matilha? 🐺_`
  }, { quoted: msg });
}

// ============================
// DAILY
// ============================
async function daily(sock, ctx) {
  const { jid, sender, msg, pushName } = ctx;
  let result;
  try { result = require('../services/economy').economy().daily(sender,msg.key?.id); }
  catch(error) { return sock.sendMessage(jid,{text:'❌ '+error.message},{quoted:msg}); }
  if(!result.success) return sock.sendMessage(jid,{text:`⏳ Próximo daily em ${Math.ceil(result.remaining/60)} minutos.`},{quoted:msg});
  const {premium:isPremium,gold:goldAmount,xp:xpAmount}=result;

  await sock.sendMessage(jid, {
    text: `🌅 ✅ *Daily coletado, ${pushName}!*\n\n💰 *+${formatNumber(goldAmount)} WoK coin*\n⭐ *+${xpAmount} XP*\n${isPremium ? '\n👑 Bônus Premium aplicado!' : ''}\n\n_Volte amanhã para mais recompensas!_\n_Uuuuuuwooooo! 🐺🌕_`
  }, { quoted: msg });
}

// ============================
// LOJA
// ============================
async function loja(sock, ctx) {
  const { jid, msg } = ctx;
  const items = SHOP_ITEMS.map(item =>
    `*[${item.id}]* ${item.name}\n    💰 *${formatNumber(item.price)} WoK coin*\n    _${item.description}_`
  ).join('\n\n');

  await sock.sendMessage(jid, {
    text: `╔══════════════════════╗
║   🏪 *LOJA DA MATILHA*  ║
╚══════════════════════╝



${items}\n\n🛡️ Escudo econômico: !comprarescudo\n🚀 Boosts: !boosts

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
  const itemId = args.length === 1 && /^\d+$/.test(args[0]) ? Number(args[0]) : NaN;
  const item = SHOP_ITEMS.find(i => i.id === itemId);

  if (!item) {
    return sock.sendMessage(jid, {
      text: `❌ Item inválido! Use *!loja* para ver os itens disponíveis.`
    }, { quoted: msg });
  }

  let effectMsg;
  try { effectMsg=require('../services/economy').economy().buy(sender,item,msg.key?.id).message; }
  catch(error) { return sock.sendMessage(jid,{text:'❌ '+error.message},{quoted:msg}); }

  await sock.sendMessage(jid, {
    text: `✅ 🛒 *Compra realizada!*\n\n📦 ${item.name}\n💰 *-${formatNumber(item.price)} WoK coin*\n\n${effectMsg}\n\n_A matilha agradece! 🐺_`
  }, { quoted: msg });
}

async function premiumInfo(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: `👑 *VANTAGENS PREMIUM:*\n\n• ⭐ XP dobrado por mensagem\n• 💰 Daily dobrado (500 WoK coin)\n• 🐺 Título especial no perfil\n• ⚡ Acesso a comandos exclusivos\n\n_Compre na !loja por apenas 2000 WoK coin!_`
  }, { quoted: msg });
}

async function titulos(sock,ctx) {
  const items=require('../services/economy').economy().titles(ctx.sender);
  return sock.sendMessage(ctx.jid,{text:require('../menus/render').frameMenu('🌕 TÍTULOS',items.length?items.map(item=>`${item.equipped?'✅':'🐾'} ${item.title_name} • ${item.title_id}`):['Você ainda não adquiriu títulos.'])},{quoted:ctx.msg});
}
async function titulo(sock,ctx) {
  if(ctx.args.length!==2 || ctx.args[0]!=='usar') return sock.sendMessage(ctx.jid,{text:'Use '+require('../config').get('PREFIX')+'titulo usar ID'},{quoted:ctx.msg});
  try { require('../services/economy').economy().equip(ctx.sender,ctx.args[1]);return sock.sendMessage(ctx.jid,{text:'🌕 Título equipado.'},{quoted:ctx.msg}); }
  catch(error) { return sock.sendMessage(ctx.jid,{text:'❌ '+error.message},{quoted:ctx.msg}); }
}
module.exports = { verGold, enviarGold, rankGold, daily, loja, comprar, premiumInfo, titulos, titulo };
