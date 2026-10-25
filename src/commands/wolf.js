'use strict';
const db = require('../utils/database');
const { BOT_NAME, wolvesBar, validateStrategy, calculateBattle, cleanJid, getNumber, formatDate, sleep } = require('../utils/helpers');
const cache = require('../utils/cache');
const { mono, progress, command, numericText, card, block, flavor } = require('../ui/text');

const wolfHud = alive => `🐺 *Lobos vivos:* ${mono(`${alive}/100`)}\n${progress(alive, 100)}`;

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
    text: card('🐺 ESTRATÉGIA DE BATALHA', [
      `👤 *Guerreiro:* ${targetName}\n${wolfHud(strat.wolves_alive)}`,
      block('DISTRIBUIÇÃO', [
        `*Lobos da formação:* ${mono(100)}`,
        `🗡️ *Ataque:* ${mono(strat.attack)} lobos`,
        `🛡️ *Defesa:* ${mono(strat.defense)} lobos`,
        `🔄 *Contra-ataque:* ${mono(strat.counter)} lobos`,
      ]),
      block('HISTÓRICO', [
        `🏆 *Vitórias:* ${mono(strat.total_victories)}`,
        `⚔️ *Batalhas:* ${mono(strat.total_attacks)}`,
        `📈 *Win Rate:* ${mono(`${winRate}%`)}`,
      ]),
    ], { tip: `_Redistribua seus lobos:_ ${command('!mudar estrategia ataque:X defesa:Y contra:Z')}` }),
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
      text: `❌ *Ação Inválida!* _Informe as três posições da matilha; a soma deve ser ${mono(100)}._\n> 💡 *Use assim:* ${command('!mudar estrategia ataque:40 defesa:30 contra:30')}`
    }, { quoted: msg });
  }

  const validation = validateStrategy(attack, defense, counter);
  if (!validation.valid) {
    return sock.sendMessage(jid, {
      text: `❌ *Estratégia inválida!* _${numericText(validation.error)}_\n> 💡 *Use assim:* ${command('!mudar estrategia ataque:40 defesa:35 contra:25')}`
    }, { quoted: msg });
  }

  db.upsertStrategy(sender, attack, defense, counter);

  const tactics = getTacticLabel(attack, defense, counter);

  await sock.sendMessage(jid, {
    text: card('⚙️ ESTRATÉGIA ATUALIZADA', [
      '✅ _Sua matilha foi reorganizada para a próxima batalha._',
      `🗡️ *Ataque:* ${mono(attack)} lobos`,
      `🛡️ *Defesa:* ${mono(defense)} lobos`,
      `🔄 *Contra-ataque:* ${mono(counter)} lobos`,
      `🎯 *Estilo:* ${tactics}`,
    ], { tip: '_Estratégia pronta. Uuuuuuwooooo! 🐺_' })
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
    return sock.sendMessage(jid, { text: `❌ *Ação Inválida!* _Este comando só pode ser usado em grupos._` }, { quoted: msg });
  }

  // Verificar se há menção
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!mentioned) {
    return sock.sendMessage(jid, {
      text: `❌ *Ação Inválida!* _Mencione seu oponente._\n> 💡 *Use assim:* ${command('!atacar @usuário')}`
    }, { quoted: msg });
  }

  const defender = cleanJid(mentioned);

  if (defender === sender) {
    return sock.sendMessage(jid, {
      text: `❌ *Ação Inválida!* _Lobo, escolha outro oponente; você não pode atacar a si mesmo._`
    }, { quoted: msg });
  }

  if (require('../services/economy').economy().activeEffect(defender,'shield'))
    return sock.sendMessage(jid,{text:'⏳ *Aguarde um instante!* _Este participante está protegido por um escudo ativo._'},{quoted:msg});

  // Anti-cooldown de batalha (30s entre batalhas)
  const battleKey = `battle_${sender}`;
  const battleChat=require('../isolation/context').current() || jid;
  const persisted=db.db.prepare('SELECT expires_at FROM persistent_cooldowns WHERE chat_jid=? AND user_jid=? AND action=?').get(battleChat,sender,'battle');
  const lastBattle = persisted?.expires_at > Date.now() ? persisted.expires_at-BATTLE_TIMEOUT*1000 : null;
  if (lastBattle) {
    const remaining = Math.ceil((BATTLE_TIMEOUT - (Date.now() - lastBattle) / 1000));
    if (remaining > 0) {
      return sock.sendMessage(jid, {
        text: `⏳ *Aguarde um instante!* _Seus lobos estão descansando; novo ataque em ${mono(`${remaining}s`)}._`
      }, { quoted: msg });
    }
  }

  // Checar se já está em batalha
  if (activeBattles.has(jid+':'+sender)) {
    return sock.sendMessage(jid, {
      text: `⏳ *Aguarde um instante!* _Você já está em uma batalha._`
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
      text: `💀 *Matilha sem lobos vivos!* _Recupere sua formação antes de lutar._\n💰 *Custo:* ${mono(`${CURE_COST} WoK coin`)}\n> ▸ ${command('!curarlobos')}`
    }, { quoted: msg });
  }
  if (defStrat.wolves_alive <= 0) {
    return sock.sendMessage(jid, {
      text: `💀 *Oponente indisponível:* @${getNumber(defender)}\n_Esse participante não tem lobos vivos; escolha outro oponente._`,
      mentions: [defender]
    }, { quoted: msg });
  }

  const defUser = db.getUser(defender);
  const defName = defUser?.name || getNumber(defender);

  activeBattles.add(jid+':'+sender);
  activeBattles.add(jid+':'+defender);
  try {

  // Anunciar batalha
  await sock.sendMessage(jid, {
    text: card('⚔️ BATALHA INICIADA', [
      `🗡️ *Atacante:* @${getNumber(sender)}`,
      `🛡️ *Defensor:* @${getNumber(defender)}`,
      '_A lua cheia guia as matilhas. Que a batalha comece! 🐺_',
    ], { tip: '_Aguarde o resultado da batalha._' }),
    mentions: [sender, defender]
  });

  await sleep(2000);

  // Read fresh strategies after the announcement; mutate all results atomically.
  let result, goldPrize=0;
  db.db.transaction(()=>{
  db.db.prepare('INSERT INTO users(jid,name) VALUES (?,?) ON CONFLICT(jid) DO NOTHING').run(defender,defName);
  atkStrat=db.getStrategy(sender);defStrat=db.getStrategy(defender);
  if(require('../services/economy').economy().activeEffect(defender,'shield')) throw Error('O defensor está protegido por escudo.');
  result = calculateBattle(
    { strategy: atkStrat, wolves: atkStrat.wolves_alive },
    { strategy: defStrat, wolves: defStrat.wolves_alive }
  );

  // Atualizar banco
  db.updateWolvesAlive(sender, result.atkWolvesAfter);
  db.updateWolvesAlive(defender, result.defWolvesAfter);
  db.incrementAttackStats(sender);

  if (result.winner === 'attacker') {
    db.incrementVictoryStats(sender);
    db.updateBattleResult(sender, 1, 0);
    db.updateBattleResult(defender, 0, 1);
    goldPrize = Math.floor(50 + Math.random() * 50);
    db.addGold(sender, goldPrize);
    const protectedWallet=require('../progression/service').progression().effects(jid,defender).some(effect=>effect.type==='economicShield');
    const loss=protectedWallet?0:Math.min(db.getUser(defender)?.gold || 0,Math.floor(goldPrize*0.5));
    db.addGold(defender,-loss);
    if(loss) db.logGoldTransaction(defender,'battle',loss,'Derrota em batalha');
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

  db.db.prepare('INSERT INTO persistent_cooldowns VALUES (?,?,?,?) ON CONFLICT(chat_jid,user_jid,action) DO UPDATE SET expires_at=excluded.expires_at').run(battleChat,sender,'battle',Date.now()+BATTLE_TIMEOUT*1000);
  if(goldPrize) db.logGoldTransaction('battle',result.winner==='attacker'?sender:defender,goldPrize,'Prêmio de batalha');
  })();

  const winnerText = result.winner === 'attacker'
    ? `🏆 *Vitória de @${getNumber(sender)}!*\n💰 *Prêmio:* ${mono(`+${goldPrize} WoK coin`)}`
    : result.winner === 'defender'
    ? `🛡️ *Defesa vitoriosa de @${getNumber(defender)}!*\n💰 *Prêmio:* ${mono(`+${goldPrize} WoK coin`)}`
    : `⚖️ *Empate!* _As duas matilhas se igualaram._`;

  await sock.sendMessage(jid, {
    text: card('⚔️ RESULTADO DA BATALHA', [
      `🗡️ *@${getNumber(sender)}*\n${wolfHud(result.atkWolvesAfter)}\n*Perdas:* ${mono(`-${result.defDamage}`)} lobos`,
      `🛡️ *@${getNumber(defender)}*\n${wolfHud(result.defWolvesAfter)}\n*Perdas:* ${mono(`-${result.atkDamage}`)} lobos`,
      block('RESULTADO', [winnerText, flavor(result.winner === 'attacker' ? 'win' : 'loss')]),
    ], { tip: '_Uuuuuuwooooo! 🐺🌕_' }),
    mentions: [sender, defender]
  });
  } finally {
    activeBattles.delete(jid+':'+sender);
    activeBattles.delete(jid+':'+defender);
  }
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
    text: card('🐺 MINHA MATILHA', [
      `👤 *${pushName}*\n${wolfHud(strat.wolves_alive)}`,
      block('ESTRATÉGIA', [
        `🗡️ *Ataque:* ${mono(strat.attack)} lobos`,
        `🛡️ *Defesa:* ${mono(strat.defense)} lobos`,
        `🔄 *Contra-ataque:* ${mono(strat.counter)} lobos`,
      ]),
      block('BATALHAS', [
        `🏆 *Vitórias:* ${mono(strat.total_victories)}`,
        `⚔️ *Total:* ${mono(strat.total_attacks)}`,
        `📈 *Win Rate:* ${mono(`${winRate}%`)}`,
        `💰 *WoK coin:* ${mono(user?.gold || 0)}`,
      ]),
    ], { tip: `_${strat.wolves_alive <= 0 ? '💀 Seus lobos estão mortos! Use !curarlobos' : strat.wolves_alive <= 30 ? '⚠️ Atenção! Poucos lobos restantes!' : '✅ Matilha pronta para batalha!'}_` })
  }, { quoted: msg });
}

// ============================
// RANK LOBOS
// ============================
async function rankLobos(sock, ctx) {
  const { jid, msg } = ctx;
  const top = db.topWolves();

  const lines = top.map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : mono(`${i + 1}º`);
    const name = p.name || getNumber(p.jid);
    const wr = p.total_attacks > 0 ? ((p.total_victories / p.total_attacks) * 100).toFixed(0) : 0;
    return `${medal} *${name}*\n🏆 ${mono(p.total_victories)} vitórias • 📈 ${mono(`${wr}%`)} WR`;
  }).join('\n');

  await sock.sendMessage(jid, {
    text: card('🌕 RANKING DE LOBOS', [
      `*Lobisomens:* ${mono(100)}`,
      lines || '📭 _Ainda não há batalhas registradas._',
    ], { tip: '_Quem vai dominar a matilha? 🐺_' })
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
      text: `✅ *Matilha completa!* _Seus ${mono(100)} lobos estão vivos; não é necessário curar._`
    }, { quoted: msg });
  }

  if ((user?.gold || 0) < CURE_COST) {
    return sock.sendMessage(jid, {
      text: `⏳ *Saldo insuficiente!*\n💰 *Custo:* ${mono(`${CURE_COST} WoK coin`)}\n*Sua carteira:* ${mono(`${user?.gold || 0} WoK coin`)}\n> _Receba a recompensa diária:_ ${command('!daily')}`
    }, { quoted: msg });
  }

  require('../services/economy').economy().buy(sender,{id:2,price:CURE_COST},msg.key?.id);

  await sock.sendMessage(jid, {
    text: card('✅ MATILHA CURADA', [
      `_Seus ${mono(100)} lobos voltaram à formação._`,
      `💰 *Custo:* ${mono(`-${CURE_COST} WoK coin`)}`,
      wolfHud(100),
    ], { tip: '_Uuuuuuwooooo! 🐺🌕_' })
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
    text: `✅ *Concluído!* _Lobos de @${getNumber(target)} restaurados para ${mono(100)}._`,
    mentions: [target]
  }, { quoted: msg });
}

// ============================
// INFO DO JOGO
// ============================
async function infoJogo(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: card('🐺 GUIA DOS LOBOS', [
      block('COMO JOGAR', [
        `_Cada jogador possui ${mono(100)} lobos em ${mono(3)} posições._`,
        '🗡️ *Ataque* — _Avança sobre o inimigo._',
        '🛡️ *Defesa* — _Protege a matilha._',
        '🔄 *Contra-ataque* — _Responde à ofensiva._',
        `📐 *Regra:* _A soma das ${mono(3)} posições deve ser ${mono(100)}._`,
      ]),
      block('COMANDOS', [
        `▸ ${command('!mudar estrategia ataque:X defesa:Y contra:Z')}\n_Define sua estratégia de batalha._`,
        `▸ ${command('!atacar @usuário')}\n_Ataca outro jogador._`,
        `▸ ${command('!lobos')} — _Ver sua matilha._`,
        `▸ ${command('!estrategia')} — _Ver estratégia atual._`,
        `▸ ${command('!curarlobos')} — _Curar lobos._\n*Custo:* ${mono(`${CURE_COST} WoK coin`)}`,
        `▸ ${command('!ranklobos')} — _Ranking de batalhas._`,
      ]),
      block('MECÂNICA', [
        '_Ataque contra a defesa inimiga._',
        '_O contra-ataque pode ferir o atacante._',
        '_Lobos sem vida não entram em batalha._',
        '_Vencer rende WoK coin._',
      ]),
    ], { tip: '_Que a lua cheia guie sua matilha! 🌕🐺_' })
  }, { quoted: msg });
}

module.exports = { verEstrategia, mudarEstrategia, atacar, meusLobos, rankLobos, curarLobos, resetarLobos, infoJogo };
