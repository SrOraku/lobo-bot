'use strict';
// !criador — o único lugar, além da lista do !donos, em que o contato do
// criador aparece para os usuários.
const { card, command } = require('../ui/text');
const CREATOR = require('../config/creator');

function creatorCard(prefix = '!') {
  // formatNumbers: false mantém o link do WhatsApp clicável (sem `monoespaçado`).
  return card('🧑‍💻 CRIADOR DO BOT', [
    `🐺 Criado por ${CREATOR.name}`,
    '💎 Dono absoluto do projeto em qualquer instalação',
    `📞 Contato: https://wa.me/${CREATOR.number}`,
    `💻 Código: https://${CREATOR.repository}`,
  ], { formatNumbers: false, tip: '🌹 _Volte ao menu com_ ' + command(prefix + 'menu') + '.' });
}

async function creator(sock, ctx) {
  return sock.sendMessage(ctx.jid, { text: creatorCard(require('../config').get('PREFIX') || '!') }, { quoted: ctx.msg });
}

module.exports = { creator, creatorCard };
