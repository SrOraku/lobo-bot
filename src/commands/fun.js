'use strict';
const { BOT_NAME, shuffle } = require('../utils/helpers');
const { card, mono, progress, command } = require('../ui/text');

const PIADAS = [
  { pergunta: 'Por que o lobo não usa computador?', resposta: 'Porque tem medo de bytes! 😂' },
  { pergunta: 'O que o lobo faz quando vai ao banheiro?', resposta: 'Uuu... rinário! 🐺😂' },
  { pergunta: 'Por que o lobo foi ao médico?', resposta: 'Estava com febre da lua cheia! 🌕' },
  { pergunta: 'O que o lobo diz quando ganha na loteria?', resposta: 'Uuuuuu-ha! 🐺💰' },
  { pergunta: 'Como chama um lobo com geladeira?', resposta: 'Lobo-frio! 🥶' },
  { pergunta: 'Por que o lobo estudou tanto?', resposta: 'Para virar um Alfa intelectual! 🎓' },
];

const FATOS = [
  '🐺 Lobos se comunicam com uivos que podem ser ouvidos a `10km` de distância!',
  '🌕 Lobos não uivam para a lua - é um mito! Eles uivam para se comunicar.',
  '🐾 Uma alcateia pode percorrer até `200km` em um único dia de caça!',
  '👁️ Lobos têm visão noturna excelente graças ao tapetum lucidum nos olhos.',
  '❤️ Lobos formam casais monogâmicos e ficam juntos por toda a vida!',
  '🦷 A mordida de um lobo tem força de até `150kg/cm²`!',
  '🐺 Os lobos são um dos poucos animais que brincam mesmo na idade adulta.',
  '🌿 Lobos são fundamentais para manter o equilíbrio dos ecossistemas.',
  '👶 Filhotes de lobo nascem cegos e surdos, abrindo os olhos após `2 semanas`.',
  '🏃 Lobos podem correr a até `60km/h` durante uma caça!',
];

const OITO_BALL = [
  '✅ Com certeza!', '✅ Definitivamente sim!', '✅ Sim, sem dúvidas!',
  '🤔 Provavelmente sim...', '🤔 Parece que sim', '🌫️ Não tenho certeza...',
  '🌫️ Tente novamente', '🌫️ Pergunta nebulosa...', '❌ Provavelmente não',
  '❌ Definitivamente não!', '❌ Minha resposta é NÃO!', '🐺 Os lobos dizem NÃO!',
];

// ============================
// DADO
// ============================
async function dado(sock, ctx) {
  const { jid, msg, args } = ctx;
  const faces = parseInt(args[0]) || 6;
  const clampedFaces = Math.min(Math.max(faces, 2), 1000);
  const result = Math.floor(Math.random() * clampedFaces) + 1;

  await sock.sendMessage(jid, {
    text: card('DADO DA MATILHA', [`🎲 *Dado:* ${mono('D' + clampedFaces)}`, `*Resultado:* ${mono(result)}`, `_${result === clampedFaces ? '🎉 Resultado máximo! A lua sorriu!' : result === 1 ? '💀 Resultado mínimo! Os lobos riem de você!' : '🐺 A sorte falou!'}_`], { tip: '_O resultado foi lançado pela matilha._' })
  }, { quoted: msg });
}

// ============================
// MOEDA
// ============================
async function moeda(sock, ctx) {
  const { jid, msg } = ctx;
  const result = Math.random() < 0.5 ? '🟡 CARA' : '⚫ COROA';
  await sock.sendMessage(jid, {
    text: card('MOEDA DA MATILHA', ['🪙 _A moeda girou sob a lua._', `*Resultado:* ${result}`], { tip: '_A face revelada encerra a rodada._' })
  }, { quoted: msg });
}

// ============================
// 8 BALL
// ============================
async function bola8(sock, ctx) {
  const { jid, msg, args } = ctx;
  if (!args.length) {
    return sock.sendMessage(jid, { text: `❌ *Ação inválida!* _Faça uma pergunta à matilha._\n> 💡 *Use assim:* ${command('!8ball Vou ganhar hoje?')}` }, { quoted: msg });
  }
  const pergunta = args.join(' ');
  const resposta = OITO_BALL[Math.floor(Math.random() * OITO_BALL.length)];

  await sock.sendMessage(jid, {
    text: card('ORÁCULO DA MATILHA', [`❓ *Pergunta:* ${pergunta}`, `🎱 *Resposta:* ${resposta}`], { tip: '_A bola de cristal dos lobos falou! 🐺_', formatNumbers: false })
  }, { quoted: msg });
}

// ============================
// PIADA
// ============================
async function piada(sock, ctx) {
  const { jid, msg } = ctx;
  const p = PIADAS[Math.floor(Math.random() * PIADAS.length)];
  await sock.sendMessage(jid, {
    text: card('PIADA DO LOBO', [`❓ _${p.pergunta}_`, `😂 _${p.resposta}_`], { tip: '_Um uivo de bom humor para a matilha._' })
  }, { quoted: msg });
}

// ============================
// FATO
// ============================
async function fato(sock, ctx) {
  const { jid, msg } = ctx;
  const f = FATOS[Math.floor(Math.random() * FATOS.length)];
  await sock.sendMessage(jid, {
    text: card('FATO LOBO DO DIA', [`_${f}_`], { tip: '_Conheça mais sobre a alcateia._' })
  }, { quoted: msg });
}

// ============================
// SORTEIO
// ============================
async function sorteio(sock, ctx) {
  const { jid, msg, args } = ctx;
  const [minStr, maxStr] = args;
  const min = parseInt(minStr) || 1;
  const max = parseInt(maxStr) || 100;

  if (min >= max) return sock.sendMessage(jid, { text: `❌ *Ação inválida!* _O mínimo deve ser menor que o máximo._` }, { quoted: msg });

  const result = Math.floor(Math.random() * (max - min + 1)) + min;
  await sock.sendMessage(jid, {
    text: card('SORTEIO DA MATILHA', [`🎯 *Intervalo:* ${mono(min)} a ${mono(max)}`, `🎉 *Número sorteado:* ${mono(result)}`], { tip: '_A matilha já tem seu resultado._' })
  }, { quoted: msg });
}

// ============================
// AZAR
// ============================
async function azar(sock, ctx) {
  const { jid, msg } = ctx;
  const pct = Math.floor(Math.random() * 101);
  let msg2 = pct >= 80 ? '🌕 A lua ilumina seu caminho!' :
             pct >= 60 ? '🐺 Os lobos estão do seu lado!' :
             pct >= 40 ? '🌙 Sorte mediana, guerreiro.' :
             pct >= 20 ? '⚠️ Cuidado, as sombras te cercam!' :
             '💀 Hoje não é seu dia, lobo!';

  await sock.sendMessage(jid, {
    text: card('SORTE DA MATILHA', [`🍀 *Sorte:* ${mono(pct + '%')}`, progress(pct, 100), `_${msg2}_`], { tip: '_Uma brincadeira sob a lua da matilha._' })
  }, { quoted: msg });
}

// ============================
// ESCOLHER
// ============================
async function escolher(sock, ctx) {
  const { jid, msg, args } = ctx;
  const options = args.join(' ').split(/[,|\/]/);
  if (options.length < 2) {
    return sock.sendMessage(jid, {
      text: `❌ *Ação inválida!* _Envie pelo menos ${mono(2)} opções separadas por vírgula._\n> 💡 *Use assim:* ${command('!escolher pizza, hamburguer, sushi')}`
    }, { quoted: msg });
  }
  const chosen = options[Math.floor(Math.random() * options.length)].trim();
  await sock.sendMessage(jid, {
    text: card('ESCOLHA DA MATILHA', [`🎯 *Escolha:* ${chosen}`], { tip: '_A matilha decidiu! Sem discussão! 🐺_', formatNumbers: false })
  }, { quoted: msg });
}

// ============================
// SHIP
// ============================
async function ship(sock, ctx) {
  const { jid, msg } = ctx;
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentions || mentions.length < 2) {
    return sock.sendMessage(jid, {
      text: `❌ *Ação inválida!* _Mencione ${mono(2)} pessoas._\n> 💡 *Use assim:* ${command('!ship @pessoa1 @pessoa2')}`
    }, { quoted: msg });
  }

  const [p1, p2] = mentions;
  const compat = Math.floor(Math.random() * 101);
  const bar = '❤️'.repeat(Math.floor(compat / 10)) + '🖤'.repeat(10 - Math.floor(compat / 10));
  const comment = compat >= 90 ? '💍 Feitos um pro outro!' :
                  compat >= 70 ? '💕 Grande chance de dar certo!' :
                  compat >= 50 ? '💫 Vale tentar!' :
                  compat >= 30 ? '🤔 Difícil, mas não impossível...' :
                  '💔 Os lobos preveem tempestade!';

  await sock.sendMessage(jid, {
    text: card('COMPATIBILIDADE', [`👤 @${p1.split('@')[0]}`, '❤️ + ❤️', `👤 @${p2.split('@')[0]}`, bar, `*Compatibilidade:* ${mono(compat + '%')}`, progress(compat, 100), `_${comment}_`], { tip: '_Apenas uma brincadeira da alcateia._' }),
    mentions: [p1, p2]
  }, { quoted: msg });
}

// ============================
// AKINATOR: respostas filtram candidatos reais; partida persistente por chat.
// ============================
const akinator = require('./arcade').createArcadeCommand('akinator');

module.exports = { dado, moeda, bola8, piada, fato, sorteio, azar, escolher, ship, akinator };
