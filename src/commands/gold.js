'use strict';
const db = require('../utils/database');
const { formatNumber, cleanJid, getNumber } = require('../utils/helpers');
const { card, mono, command } = require('../ui/text');
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
    text: card('💰 CARTEIRA', [
      `*Lobo:* @${getNumber(target)}`,
      `*Saldo:* ${mono(formatNumber(gold))} WoK coin`,
      `│ ▸ ${command('!daily')} — _Recompensa diária_`,
      `│ ▸ ${command('!loja')} — _Itens da matilha_`,
    ], { tip: 'Acompanhe sua moeda universal neste chat.' }),
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
      text: `❌ *Ação inválida!* _Informe o participante e a quantidade._\n> 💡 *Use assim:* ${command('!enviargold @usuário 100')}`
    }, { quoted: msg });
  }

  const target = cleanJid(mentioned);
  if (target === sender) return sock.sendMessage(jid, { text: `❌ *Ação inválida!* _Você não pode enviar WoK coin para si mesmo._` }, { quoted: msg });

  try { require('../services/economy').economy().transfer(sender,target,amount,msg.key?.id); }
  catch(error) { return sock.sendMessage(jid,{text:'❌ *Ação inválida!* _'+error.message+'_'},{quoted:msg}); }

  await sock.sendMessage(jid, {
    text: card('💸 TRANSFERÊNCIA', [
      '✅ *Concluído!* _A moeda chegou ao destino._',
      `*De:* @${getNumber(sender)}`,
      `*Para:* @${getNumber(target)}`,
      `*Saída:* ${mono('-' + formatNumber(amount))} WoK coin`,
      `*Entrada:* ${mono('+' + formatNumber(amount))} WoK coin`,
    ], { tip: 'A matilha cuida dos seus. 🐺' }),
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
    return `${medal} *${name}*\n*Saldo:* ${mono(formatNumber(u.gold))} WoK coin`;
  }).join('\n');

  await sock.sendMessage(jid, {
    text: card('💰 RANKING', [lines || '📭 _Nenhum usuário com WoK coin ainda._'], { tip: 'Os maiores tesouros da matilha neste chat. 🐺' })
  }, { quoted: msg });
}

// ============================
// DAILY
// ============================
async function daily(sock, ctx) {
  const { jid, sender, msg, pushName } = ctx;
  let result;
  try { result = require('../services/economy').economy().daily(sender,msg.key?.id); }
  catch(error) { return sock.sendMessage(jid,{text:'❌ *Ação inválida!* _'+error.message+'_'},{quoted:msg}); }
  if(!result.success) return sock.sendMessage(jid,{text:`⏳ *Aguarde um instante!* _Próximo daily em_ ${mono(Math.ceil(result.remaining/60))} _minutos._`},{quoted:msg});
  const {premium:isPremium,gold:goldAmount,xp:xpAmount}=result;

  await sock.sendMessage(jid, {
    text: card('🌅 RECOMPENSA DIÁRIA', [
      `✅ *Daily coletado, ${pushName}!*`,
      '_A lua recompensa sua presença na matilha._',
      `*WoK coin:* ${mono('+' + formatNumber(goldAmount))}`,
      `*XP:* ${mono('+' + xpAmount)}`,
      `${isPremium ? '👑 _Bônus Premium aplicado!_' : ''}`,
      '_Uuuuuuwooooo! 🐺🌕_',
    ], { tip: 'Volte amanhã para mais recompensas.' })
  }, { quoted: msg });
}

// ============================
// LOJA
// ============================
async function loja(sock, ctx) {
  const { jid, msg } = ctx;
  const items = SHOP_ITEMS.map(item =>
    `│ ▸ ${mono(item.id)} *${item.name}*\n*Preço:* ${mono(formatNumber(item.price))} WoK coin\n_${item.description}_`
  ).join('\n\n');

  await sock.sendMessage(jid, {
    text: card('🏪 LOJA DA MATILHA', [
      items,
      `│ ▸ ${command('!comprarescudo')} — _Escudo econômico_`,
      `│ ▸ ${command('!boosts')} — _Boosts ativos e catálogo_`,
      `*Comprar:* ${command('!comprar [ID]')}`,
    ], { tip: `Exemplo: ${command('!comprar 2')}` })
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
      text: `❌ *Ação inválida!* _Item não encontrado._\n> 💡 *Use assim:* ${command('!loja')} _para consultar os IDs._`
    }, { quoted: msg });
  }

  let effectMsg;
  try { effectMsg=require('../services/economy').economy().buy(sender,item,msg.key?.id).message; }
  catch(error) { return sock.sendMessage(jid,{text:'❌ *Ação inválida!* _'+error.message+'_'},{quoted:msg}); }

  await sock.sendMessage(jid, {
    text: card('🛒 COMPRA', [
      '✅ *Concluído!* _Item adquirido para sua jornada._',
      `*Item:* ${item.name}`,
      `*Custo:* ${mono('-' + formatNumber(item.price))} WoK coin`,
      effectMsg,
    ], { tip: 'A matilha agradece. 🐺' })
  }, { quoted: msg });
}

async function premiumInfo(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: card('👑 PREMIUM', [
      `*XP:* ${mono('2×')} _por mensagem_`,
      `*Daily:* ${mono('500')} WoK coin _com bônus_`,
      '🐺 _Título especial no perfil_',
      '⚡ _Acesso a comandos exclusivos_',
      `*Preço:* ${mono('2000')} WoK coin`,
    ], { tip: `Consulte ${command('!loja')} para comprar.` })
  }, { quoted: msg });
}

async function titulos(sock,ctx) {
  const items=require('../services/economy').economy().titles(ctx.sender);
  return sock.sendMessage(ctx.jid,{text:require('../menus/render').frameMenu('🌕 TÍTULOS',items.length?items.map(item=>`${item.equipped?'✅':'🐾'} *${item.title_name}* • ${mono(item.title_id)}`):['Você ainda não adquiriu títulos.'])},{quoted:ctx.msg});
}
async function titulo(sock,ctx) {
  if(ctx.args.length!==2 || ctx.args[0]!=='usar') return sock.sendMessage(ctx.jid,{text:'❌ *Ação inválida!* _Informe o título que deseja usar._\n> 💡 *Use assim:* '+command(require('../config').get('PREFIX')+'titulo usar ID')},{quoted:ctx.msg});
  try { require('../services/economy').economy().equip(ctx.sender,ctx.args[1]);return sock.sendMessage(ctx.jid,{text:'✅ *Concluído!* _Título equipado para sua jornada._'},{quoted:ctx.msg}); }
  catch(error) { return sock.sendMessage(ctx.jid,{text:'❌ *Ação inválida!* _'+error.message+'_'},{quoted:ctx.msg}); }
}
module.exports = { verGold, enviarGold, rankGold, daily, loja, comprar, premiumInfo, titulos, titulo };
