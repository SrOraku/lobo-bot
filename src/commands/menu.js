'use strict';
const { BOT_NAME, PREFIX } = require('../utils/helpers');

const DEVELOPER = '🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺';
const DEV_CONTACT = '+55 43 99637-5955 | +55 43 92003-0769';

async function menu(sock, ctx) {
  const { jid, msg, args } = ctx;
  const subMenu = args[0]?.toLowerCase();
  if (subMenu === 'gold' || subMenu === 'lobos' || subMenu === 'lobo') return menuGold(sock, ctx);
  if (subMenu === 'moderacao' || subMenu === 'mod') return menuModeracao(sock, ctx);
  if (subMenu === 'midia' || subMenu === 'media') return menuMidia(sock, ctx);
  if (subMenu === 'diversao' || subMenu === 'fun') return menuDiversao(sock, ctx);

  // Menu principal personalizado
  await sock.sendMessage(jid, {
    text: `🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹

         ${BOT_NAME}

╔═════════════ ❀ 🌹 ❀ 100 LOBISOMENS ❀ 🐺 ❀ 🌹 ❀ ═════════════╗
          MATILHA ETERNA • LOBO BOT COMPLETO
╚═════════════ ❀ 🐺 ❀ 🌹 ❀ 🐺 ❀ 🌹 ❀ ═════════════╝

༺❦༻ Bem-vindo ao domínio da ${BOT_NAME} ༺❦༻
A matilha mais feroz e bela do WhatsApp: estratégia lupina + todas as poderosas funções do LOBO BOT!

❖✦❖🌹✦🐺✦🌹❖✦❖  MECÂNICAS 100 LOBISOMENS  ❖✦❖🌹✦🐺✦🌹❖✦❖
• Cada membro possui exatamente *100 Lobisomens*
• Distribua em: *Ataque • Defesa • Contra-ataque* (soma sempre = 100)
• *${PREFIX}mudar estrategia ataque:X defesa:Y contra:Z*
• *${PREFIX}atacar @numero* • Batalhas épicas em tempo real

❦⊱✿⊰❦  PROTEÇÃO DA MATILHA  ❦⊱✿⊰❦
• Anti Link • Anti Fake • Anti Contato • Anti Marcação • Anti Inatividade
• Abrir/Fechar grupo • Ban • Mute • Gestão total

🌹✿  DIVERSÃO & INTERAÇÃO  ✿🌹
• Marca Todos • Brincadeiras • Akinator • Gold (moeda virtual + loja)
• Sistema de Níveis & XP com ranks automáticos • Respostas automáticas
• Mensagens programadas

🐺✦  MÍDIA & DOWNLOADS  ✦🐺
• YouTube (áudio/vídeo) • TikTok sem marca d'água • Instagram • Spotify
• Downloader universal

🌹🐾  FIGURINHAS MÍSTICAS  🐾🌹
• Sticker normal • Sticker animado • Ferramentas avançadas

❖✦❖  ESTATÍSTICAS & GOLD  ❖✦❖
• Estatísticas completas do grupo • Level • Gold • Ranks

🐺 *Comandos Principais da Matilha:*
• *${PREFIX}menu gold* → Menu encantado completo
• *${PREFIX}menu mod* → Moderação
• *${PREFIX}menu midia* → Downloads
• *${PREFIX}menu diversao* → Jogos
• *${PREFIX}mudar estrategia ataque:X defesa:Y contra:Z*
• *${PREFIX}atacar @membro*
• *${PREFIX}gold* • *${PREFIX}level* • *${PREFIX}play*
• *${PREFIX}tiktok* • *${PREFIX}sticker* • *${PREFIX}ban*

🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹

_Fiel como o lobo • Bela como a rosa • Estratégico como o alfa_ 🌹🐺
${BOT_NAME} _sempre ao seu lado!_

👨‍💻 *Dev:* ${DEVELOPER}
📞 ${DEV_CONTACT}`
  }, { quoted: msg });
}

async function menuGold(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: `🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹

         ${BOT_NAME}

╔═════════════ ❀ 🌹 ❀ 100 LOBISOMENS ❀ 🐺 ❀ 🌹 ❀ ═════════════╗
             🐺 MENU GOLD & LOBISOMENS 🐺
╚═════════════ ❀ 🐺 ❀ 🌹 ❀ 🐺 ❀ 🌹 ❀ ═════════════╝

❖✦❖🌹✦🐺✦🌹❖✦❖  100 LOBISOMENS  ❖✦❖🌹✦🐺✦🌹❖✦❖

🗡️ *${PREFIX}mudar estrategia ataque:X defesa:Y contra:Z*
   → Distribuir seus 100 lobos (soma = 100)
⚔️ *${PREFIX}atacar @usuário* → Batalha épica!
🐺 *${PREFIX}lobos* → Ver sua matilha
📊 *${PREFIX}estrategia [@usuário]* → Ver estratégia
💊 *${PREFIX}curarlobos* (200💰) → Curar lobos
🏆 *${PREFIX}ranklobos* → Top guerreiros
📖 *${PREFIX}infolobos* → Guia completo do jogo

❦⊱✿⊰❦  SISTEMA GOLD  ❦⊱✿⊰❦

💰 *${PREFIX}gold* → Ver saldo
🎁 *${PREFIX}daily* → Recompensa diária (200~500💰)
💸 *${PREFIX}enviargold @user valor* → Transferir gold
🛒 *${PREFIX}loja* → Loja da matilha
🛍️ *${PREFIX}comprar [ID]* → Comprar item
📈 *${PREFIX}rankgold* → Top ricos
👑 *${PREFIX}premiun* → Info Premium

❖✦❖  LEVEL & PERFIL  ❖✦❖

⭐ *${PREFIX}level [@usuário]* → Nível e XP
👤 *${PREFIX}perfil [@usuário]* → Ficha completa
🏅 *${PREFIX}ranking* → Ranking geral
📊 *${PREFIX}stats* → Estatísticas do grupo

🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹

_Fiel como o lobo • Bela como a rosa_ 🌹🐺
👨‍💻 *Dev:* ${DEVELOPER}
📞 ${DEV_CONTACT}`
  }, { quoted: msg });
}

async function menuModeracao(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: `🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹

         ${BOT_NAME}

╔═════════════ ❀ 🌹 ❀ 100 LOBISOMENS ❀ 🐺 ❀ 🌹 ❀ ═════════════╗
              🛡️ PROTEÇÃO DA MATILHA 🛡️
╚═════════════ ❀ 🐺 ❀ 🌹 ❀ 🐺 ❀ 🌹 ❀ ═════════════╝

❦⊱✿⊰❦  GESTÃO DE MEMBROS  ❦⊱✿⊰❦

🚫 *${PREFIX}ban @usuário* → Banir do bot
✅ *${PREFIX}unban @usuário* → Desbanir
🔇 *${PREFIX}mute @usuário* → Silenciar
🔊 *${PREFIX}unmute @usuário* → Desmutar
👢 *${PREFIX}kick @usuário* → Remover do grupo
➕ *${PREFIX}add [número]* → Adicionar membro
⬆️ *${PREFIX}promover @usuário* → Tornar admin
⬇️ *${PREFIX}rebaixar @usuário* → Remover admin
📣 *${PREFIX}marcartodos [msg]* → Marcar todos

❖✦❖  CONTROLE DO GRUPO  ❖✦❖

🔓 *${PREFIX}abrirgrupo* → Abrir para todos
🔒 *${PREFIX}fechargrupo* → Apenas admins

🌹🐾  PROTEÇÕES ATIVAS  🐾🌹

🔗 *${PREFIX}antilink [delete|warn|kick]*
🎭 *${PREFIX}antifake* → Anti-número falso
📞 *${PREFIX}anticontato* → Anti-compartilhar contato
🏷️ *${PREFIX}antimarcacao* → Anti-marcação em massa
😴 *${PREFIX}antiinatividade [dias]* → Anti-inatividade
🧹 *${PREFIX}limparinatividade* → Remover inativos agora
📊 *${PREFIX}stats* → Status completo do grupo

🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹

_⚠️ Requer admin do grupo_
_Fiel como o lobo • Estratégico como o alfa_ 🐺
👨‍💻 *Dev:* ${DEVELOPER}
📞 ${DEV_CONTACT}`
  }, { quoted: msg });
}

async function menuMidia(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: `🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹

         ${BOT_NAME}

╔═════════════ ❀ 🌹 ❀ 100 LOBISOMENS ❀ 🐺 ❀ 🌹 ❀ ═════════════╗
              🎬 MÍDIA & DOWNLOADS 🎬
╚═════════════ ❀ 🐺 ❀ 🌹 ❀ 🐺 ❀ 🌹 ❀ ═════════════╝

🐺✦  YOUTUBE  ✦🐺

🔍 *${PREFIX}play [nome/url]* → Buscar música
🎵 *${PREFIX}ytmp3 [nome/url]* → Baixar áudio MP3 (max 10min)
🎬 *${PREFIX}ytmp4 [nome/url]* → Baixar vídeo MP4 (max 5min)

❖✦❖  OUTRAS PLATAFORMAS  ❖✦❖

📱 *${PREFIX}tiktok [url]* → TikTok sem marca d'água
📸 *${PREFIX}ig [url]* → Download Instagram
🎧 *${PREFIX}spotify [nome]* → Buscar no Spotify

🌹🐾  FIGURINHAS MÍSTICAS  🐾🌹

🖼️ *${PREFIX}sticker* / *${PREFIX}s*
   → Criar sticker (responda uma imagem/vídeo)
✨ *${PREFIX}stickeranim* / *${PREFIX}sanim*
   → Sticker animado (responda um vídeo)
🖼️ *${PREFIX}toimg*
   → Converter sticker → imagem

🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹

_💡 Responda uma mídia ou envie junto com o comando_
_Fiel como o lobo • Bela como a rosa_ 🌹🐺
👨‍💻 *Dev:* ${DEVELOPER}
📞 ${DEV_CONTACT}`
  }, { quoted: msg });
}

async function menuDiversao(sock, ctx) {
  const { jid, msg } = ctx;
  await sock.sendMessage(jid, {
    text: `🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹✦❀🐺✦❀🌹

         ${BOT_NAME}

╔═════════════ ❀ 🌹 ❀ 100 LOBISOMENS ❀ 🐺 ❀ 🌹 ❀ ═════════════╗
            🎭 DIVERSÃO & INTERAÇÃO 🎭
╚═════════════ ❀ 🐺 ❀ 🌹 ❀ 🐺 ❀ 🌹 ❀ ═════════════╝

🌹✿  JOGOS DA MATILHA  ✿🌹

🎲 *${PREFIX}dado [faces]* → Rolar dado
🪙 *${PREFIX}moeda* → Cara ou coroa
🎱 *${PREFIX}8ball [pergunta]* → Bola mágica dos lobos
🎯 *${PREFIX}sorteio [min] [max]* → Sortear número
🍀 *${PREFIX}azar* → Ver sua sorte hoje
🎰 *${PREFIX}escolher [op1, op2, op3]* → Escolha aleatória
💘 *${PREFIX}ship @p1 @p2* → Compatibilidade amorosa
🔮 *${PREFIX}akinator* → Akinator dos lobos!

❖✦❖  ENTRETENIMENTO  ❖✦❖

😂 *${PREFIX}piada* → Piada do Lobo
📚 *${PREFIX}fato* → Curiosidade sobre lobos

❦⊱✿⊰❦  BOT INFO  ❦⊱✿⊰❦

🏓 *${PREFIX}ping* → Latência do bot
⏱️ *${PREFIX}uptime* → Tempo online
📊 *${PREFIX}stats* → Estatísticas do grupo

🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹🐺✦❀🌹

_Fiel como o lobo • Bela como a rosa • Estratégico como o alfa_ 🌹🐺
${BOT_NAME} _sempre ao seu lado!_
👨‍💻 *Dev:* ${DEVELOPER}
📞 ${DEV_CONTACT}`
  }, { quoted: msg });
}

module.exports = { menu };
