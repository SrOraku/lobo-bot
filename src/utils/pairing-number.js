'use strict';

async function choosePairingNumber(ask) {
  while (true) {
    const answer = await ask('\n🌹═══[CONECTAR WHATSAPP]═══🐺\n📱 Digite o número do WhatsApp que será conectado, com DDI.\nExemplo: 5543999999999\n👑 Isso não altera o dono do bot.\n→ ');
    const text = String(answer || '').trim();
    const number = text.replace(/[+\s().-]/g, '');
    if (/^[1-9]\d{9,14}$/.test(number)) return number;
    await ask('⚠️ Número inválido. Pressione Enter para tentar novamente. ');
  }
}

module.exports = { choosePairingNumber };
