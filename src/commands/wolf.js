'use strict';
const db = require('../utils/database');
const { BOT_NAME, wolvesBar, validateStrategy, calculateBattle, cleanJid, getNumber, formatDate, sleep } = require('../utils/helpers');
const cache = require('../utils/cache');

const BATTLE_TIMEOUT = parseInt(process.env.BATTLE_TIMEOUT) || 60;
const CURE_COST = 200; // gold para curar todos os lobos

// ============================
// VER ESTRATÉGIA
// ============================
async function verEstrategia(sock, ctx) {
  const { jid, sender, pushName, msg } = ctx;
  let target = sender;
  let targetName = pushName;

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) {
    target = cleanJid(mentioned);
    const targetUser = db.getUser(target);
    targetName = targetUser?.name || getNumber(target);
  }

  let strat = db.getStrategy(target);
  if (!strat) {
    db.upsertStrategy(target, 34, 33, 33);
    strat = db.getStrategy(target);
  }

  const winRate = strat.total_attacks > 0
    ? ((strat.total_victories / strat.total_attacks) * 100).toFixed(1)
    : '0.0';

  await sock.sendMessage(jid, {
    text: `╔══════════════════════════╗
║  🐺 *ESTRATÉGIA DE BATALHA*  ║
╚══════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

👤 *Guerreiro:* ${targetName}
${wolvesBar(strat.wolves_alive)}

*⚔️ DISTRIBUIÇÃO DOS 100 LOBOS:*
┌──────────────────────────
│ 🗡️ *Ataque:* ${strat.attack} lobos
│ 🛡️ *Defesa:* ${strat.defense} lobos  
│ 🔄 *Contra-ataque:* ${strat.counter} lobos
└──────────────────────────

*📊 HISTÓRICO:*
• 🏆 Vitórias: *${strat.total_victories}*
• ⚔️ Batalhas: *${strat.total_attacks}*
• 📈 Win Rate: *${winRate}%*

_Use_ *!mudar estrategia ataque:X defesa:Y contra:Z*
_para redistribuir seus lobos!_`,
    mentions: [target]
  }, { quoted: msg });
}

// ============================
// MUDAR ESTRATÉGIA
// ============================
async function mudarEstrategia(sock, ctx) {
  const { jid, sender, args, msg } = ctx;

  // Aceitar: !mudar estrategia ataque:40 defesa:30 contra:30
  // Ou: !estrategia 40 30 30
  const fullArgs = args.join(' ').toLowerCase();

  let attack, defense, counter;

  const atkMatch = fullArgs.match(/ataque?:?\s*(\d+)/);
  const defMatch = fullArgs.match(/defes[ao]:?\s*(\d+)/);
  const ctrMatch = fullArgs.match(/contra(?:-?ataque)?:?\s*(\d+)/);

  if (atkMatch && defMatch && ctrMatch) {
    attack = parseInt(atkMatch[1]);
    defense = parseInt(defMatch[1]);
    counter = parseInt(ctrMatch[1]);
  } else {
    // Tentar formato numérico simples: !estrategia 40 30 30
    const nums = fullArgs.match(/\d+/g);
    if (nums?.length >= 3) {
      attack = parseInt(nums[0]);
      defense = parseInt(nums[1]);
      counter = parseInt(nums[2]);
    }
  }

  if (attack === undefined || defense === undefined || counter === undefined) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\n🐺 *Como usar:*\n\n*!mudar estrategia ataque:40 defesa:30 contra:30*\n\n_A soma deve ser sempre 100!_`
    }, { quoted: msg });
  }

  const validation = validateStrategy(attack, defense, counter);
  if (!validation.valid) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\n🐺 *Estratégia inválida!*\n\n${validation.error}\n\n_Exemplo: !mudar estrategia ataque:40 defesa:35 contra:25_`
    }, { quoted: msg });
  }

  db.upsertStrategy(sender, attack, defense, counter);

  const tactics = getTacticLabel(attack, defense, counter);

  await sock.sendMessage(jid, {
    text: `╔══════════════════════════╗
║  ⚙️ *ESTRATÉGIA ATUALIZADA!*  ║
╚══════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

🐺 *Sua matilha foi reorganizada!*

🗡️ *Ataque:* ${attack} lobos
🛡️ *Defesa:* ${defense} lobos
🔄 *Contra-ataque:* ${counter} lobos

🎯 *Estilo:* ${tactics}

_Sua estratégia está pronta para a batalha!_
_Uuuuuuwooooo! 🐺_`
  }, { quoted: msg });
}

function getTacticLabel(atk, def, ctr) {
  if (atk >= 60) return '⚔️ Agressivo Total - Tudo ou Nada!';
  if (def >= 60) return '🛡️ Muralha de Ferro - Impenetrável!';
  if (ctr >= 50) return '🔄 Mestre do Contra-Ataque - Letal!';
  if (atk >= 40 && def >= 30) return '⚡ Guerreiro Equilibrado';
  if (atk >= 40 && ctr >= 30) return '🌀 Lupus Viper - Veneno e Garra';
  if (def >= 40 && ctr >= 30) return '🧱 Bastião da Matilha';
  return '🐺 Estratégia Personalizada';
}

// ============================
// ATACAR
// ============================
const activeBattles = new Set();

async function atacar(sock, ctx) {
  const { jid, sender, msg, pushName, args } = ctx;
  if (!ctx.isGroup) {
    return sock.sendMessage(jid, { text: `❌ Este comando só pode ser usado em grupos!` }, { quoted: msg });
  }

  // Verificar se há menção
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) {
    return sock.sendMessage(jid, {
      text: `❌ *[ ${BOT_NAME} ]*\n\n🐺 Mencione seu oponente!\n\n_Exemplo:_ *!atacar @usuário*`
    }, { quoted: msg });
  }

  const defender = cleanJid(mentioned);

  if (defender === sender) {
    return sock.sendMessage(jid, {
      text: `🐺 *[ ${BOT_NAME} ]*\n\nVocê não pode atacar a si mesmo, Lobo Tolo! 😂`
    }, { quoted: msg });
  }

  // Anti-cooldown de batalha (30s entre batalhas)
  const battleKey = `battle_${sender}`;
  const lastBattle = await cache.get(battleKey);
  if (lastBattle) {
    const remaining = Math.ceil((BATTLE_TIMEOUT - (Date.now() - lastBattle) / 1000));
    if (remaining > 0) {
      return sock.sendMessage(jid, {
        text: `⏳ *[ ${BOT_NAME} ]*\n\n🐺 Seus lobos estão descansando!\n\nAguarde *${remaining}s* para atacar novamente.`
      }, { quoted: msg });
    }
  }

  // Checar se já está em batalha
  if (activeBattles.has(sender)) {
    return sock.sendMessage(jid, {
      text: `⚔️ Você já está em uma batalha!`
    }, { quoted: msg });
  }

  // Garantir estratégias
  let atkStrat = db.getStrategy(sender);
  if (!atkStrat) { db.upsertStrategy(sender, 34, 33, 33); atkStrat = db.getStrategy(sender); }

  let defStrat = db.getStrategy(defender);
  if (!defStrat) { db.upsertStrategy(defender, 34, 33, 33); defStrat = db.getStrategy(defender); }

  // Checar lobos vivos
  if (atkStrat.wolves_alive <= 0) {
    return sock.sendMessage(jid, {
      text: `💀 *[ ${BOT_NAME} ]*\n\nSeus lobos estão todos mortos! Use *!curarlobos* para ressuscitá-los.\n💰 Custo: *${CURE_COST} Gold*`
    }, { quoted: msg });
  }
  if (defStrat.wolves_alive <= 0) {
    return sock.sendMessage(jid, {
      text: `💀 *[ ${BOT_NAME} ]*\n\n@${getNumber(defender)} não tem lobos vivos para lutar! Escolha outro oponente.`,
      mentions: [defender]
    }, { quoted: msg });
  }

  const defUser = db.getUser(defender);
  const defName = defUser?.name || getNumber(defender);

  activeBattles.add(sender);
  activeBattles.add(defender);
  await cache.set(battleKey, Date.now(), BATTLE_TIMEOUT);

  // Anunciar batalha
  await sock.sendMessage(jid, {
    text: `🌙 *[ ${BOT_NAME} ]*\n\n╔══════════════════════╗\n║  ⚔️ *BATALHA INICIADA!* ║\n╚══════════════════════╝\n\n🗡️ *Atacante:* @${getNumber(sender)}\n🛡️ *Defensor:* @${getNumber(defender)}\n\n_A lua cheia guia as matilhas..._\n_Que a batalha comece! 🐺_`,
    mentions: [sender, defender]
  });

  await sleep(2000);

  // Calcular batalha
  const result = calculateBattle(
    { strategy: atkStrat, wolves: atkStrat.wolves_alive },
    { strategy: defStrat, wolves: defStrat.wolves_alive }
  );

  // Atualizar banco
  db.updateWolvesAlive(sender, result.atkWolvesAfter);
  db.updateWolvesAlive(defender, result.defWolvesAfter);
  db.incrementAttackStats(sender);

  let goldPrize = 0;

  if (result.winner === 'attacker') {
    db.incrementVictoryStats(sender);
    db.updateBattleResult(sender, 1, 0);
    db.updateBattleResult(defender, 0, 1);
    goldPrize = Math.floor(50 + Math.random() * 50);
    db.addGold(sender, goldPrize);
    db.addGold(defender, -Math.floor(goldPrize * 0.5));
  } else if (result.winner === 'defender') {
    db.incrementVictoryStats(defender);
    db.updateBattleResult(defender, 1, 0);
    db.updateBattleResult(sender, 0, 1);
    goldPrize = Math.floor(30 + Math.random() * 30);
    db.addGold(defender, goldPrize);
  }

  // Registrar batalha
  db.logBattle({
    attacker: sender, defender,
    atkBefore: atkStrat.wolves_alive, defBefore: defStrat.wolves_alive,
    atkAfter: result.atkWolvesAfter, defAfter: result.defWolvesAfter,
    result: result.winner, groupId: jid
  });

  activeBattles.delete(sender);
  activeBattles.delete(defender);

  const winnerText = result.winner === 'attacker'
    ? `🏆 *VITÓRIA de @${getNumber(sender)}!*\n💰 Prêmio: *+${goldPrize} Gold*`
    : result.winner === 'defender'
    ? `🛡️ *DEFESA VITORIOSA de @${getNumber(defender)}!*\n💰 Prêmio: *+${goldPrize} Gold*`
    : `⚖️ *EMPATE! Ambas as matilhas se igualaram!*`;

  await sock.sendMessage(jid, {
    text: `╔══════════════════════════╗
║   ⚔️ *RESULTADO DA BATALHA*   ║
╚══════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

🗡️ *@${getNumber(sender)}*
${wolvesBar(result.atkWolvesAfter)} 
_(-${result.defDamage} lobos perdidos)_

🛡️ *@${getNumber(defender)}*
${wolvesBar(result.defWolvesAfter)}
_(-${result.atkDamage} lobos perdidos)_

━━━━━━━━━━━━━━━━━━━━━━
${winnerText}
━━━━━━━━━━━━━━━━━━━━━━

_Uuuuuuwooooo! 🐺🌕_`,
    mentions: [sender, defender]
  });
}

// ============================
// MEUS LOBOS
// ============================
async function meusLobos(sock, ctx) {
  const { jid, sender, pushName, msg } = ctx;
  let strat = db.getStrategy(sender);
  if (!strat) {
    db.upsertStrategy(sender, 34, 33, 33);
    strat = db.getStrategy(sender);
  }

  const user = db.getUser(sender);
  const winRate = strat.total_attacks > 0
    ? ((strat.total_victories / strat.total_attacks) * 100).toFixed(1) : '0.0';

  await sock.sendMessage(jid, {
    text: `╔══════════════════════════╗
║    🐺 *MINHA MATILHA*    ║
╚══════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

👤 *${pushName}*
${wolvesBar(strat.wolves_alive)}

*⚔️ ESTRATÉGIA ATUAL:*
🗡️ Ataque: *${strat.attack}* lobos
🛡️ Defesa: *${strat.defense}* lobos
🔄 Contra-ataque: *${strat.counter}* lobos

*📊 BATALHAS:*
🏆 Vitórias: *${strat.total_victories}*
⚔️ Total: *${strat.total_attacks}*
📈 Win Rate: *${winRate}%*
💰 Gold: *${user?.gold || 0}*

_${strat.wolves_alive <= 0 ? '💀 Seus lobos estão mortos! Use !curarlobos' : strat.wolves_alive <= 30 ? '⚠️ Atenção! Poucos lobos restantes!' : '✅ Matilha pronta para batalha!'}_`
  }, { quoted: msg });
}

// ============================
// RANK LOBOS
// ============================
async function rankLobos(sock, ctx) {
  const { jid, msg } = ctx;
  const top = db.topWolves();

  const lines = top.map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
    const name = p.name || getNumber(p.jid);
    const wr = p.total_attacks > 0 ? ((p.total_victories / p.total_attacks) * 100).toFixed(0) : 0;
    return `${medal} *${name}*\n    🏆 ${p.total_victories} vitórias | 📈 ${wr}% WR`;
  }).join('\n\n');

  await sock.sendMessage(jid, {
    text: `╔══════════════════════════╗
║   🌕 *RANKING 100 LOBISOMENS*  ║
╚══════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

${lines || '📭 Ainda não há batalhas registradas!'}

_Quem vai dominar a matilha? 🐺_`
  }, { quoted: msg });
}

// ============================
// CURAR LOBOS
// ============================
async function curarLobos(sock, ctx) {
  const { jid, sender, msg } = ctx;
  const user = db.getUser(sender);
  const strat = db.getStrategy(sender);

  if (!strat || strat.wolves_alive >= 100) {
    return sock.sendMessage(jid, {
      text: `🐺 *[ ${BOT_NAME} ]*\n\nSua matilha já está com todos os *100 lobos* vivos! Não precisa curar.`
    }, { quoted: msg });
  }

  if ((user?.gold || 0) < CURE_COST) {
    return sock.sendMessage(jid, {
      text: `💸 *[ ${BOT_NAME} ]*\n\nVocê precisa de *${CURE_COST} Gold* para curar sua matilha!\n\nVocê tem: *${user?.gold || 0} Gold*\n\n_Use !daily para ganhar gold diariamente!_`
    }, { quoted: msg });
  }

  db.addGold(sender, -CURE_COST);
  db.updateWolvesAlive(sender, 100);

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🐺 *Matilha Curada!*\n\nSeus 100 lobos foram ressuscitados!\n💰 Custo: *-${CURE_COST} Gold*\n\n_Uuuuuuwooooo! 🐺🌕_`
  }, { quoted: msg });
}

// ============================
// RESETAR LOBOS (dono)
// ============================
async function resetarLobos(sock, ctx) {
  const { jid, sender, msg, args } = ctx;
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const target = mentioned ? cleanJid(mentioned) : sender;

  db.updateWolvesAlive(target, 100);
  db.upsertStrategy(target, 34, 33, 33);

  await sock.sendMessage(jid, {
    text: `✅ *[ ${BOT_NAME} ]*\n\n🔄 Lobos de @${getNumber(target)} foram resetados para 100!`,
    mentions: [target]
  }, { quoted: msg });
}

// ============================
// INFO DO JOGO
// ============================
async function infoJogo(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: `╔══════════════════════════════╗
║  🐺 *100 LOBISOMENS - GUIA*  ║
╚══════════════════════════════╝

🌹 *[ ${BOT_NAME} ]*

*📖 COMO JOGAR:*

Cada jogador possui *100 lobos* distribuídos em 3 posições:

🗡️ *Ataque* - Lobos que atacam o inimigo
🛡️ *Defesa* - Lobos que protegem a matilha
🔄 *Contra-ataque* - Lobos que contra-atacam

*📐 REGRA FUNDAMENTAL:*
A soma das 3 posições deve ser sempre *100*!

*⚙️ COMANDOS:*
▸ *!mudar estrategia ataque:X defesa:Y contra:Z*
  → Define sua estratégia de batalha

▸ *!atacar @usuário*
  → Ataca outro jogador!

▸ *!lobos* → Ver sua matilha
▸ *!estrategia* → Ver estratégia atual
▸ *!curarlobos* → Curar lobos (${CURE_COST} Gold)
▸ *!ranklobos* → Ranking de batalhas

*⚔️ MECÂNICA:*
• Ataque vs Defesa do inimigo
• Contra-ataque pode ferir o atacante
• Lobos mortos = sem batalha
• Vencer = ganhar Gold!

_Que a lua cheia guie sua matilha! 🌕🐺_`
  }, { quoted: msg });
}

module.exports = { verEstrategia, mudarEstrategia, atacar, meusLobos, rankLobos, curarLobos, resetarLobos, infoJogo };
