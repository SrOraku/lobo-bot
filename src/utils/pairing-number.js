'use strict';

function pairingPrompt(error = '') {
  return `
🌹═══[ CONECTAR WHATSAPP ]═══🐺

📱 Digite o número que será conectado ao bot.

🌐 Formato:
DDI + DDD + NÚMERO

📌 Exemplo:
5543999999999

╭─── 📋 ───╮
55 → DDI
43 → DDD
999999999 → Número
╰───────────╯

⚠️ Use somente números, sem:
• +
• espaços
• traços
• parênteses

✅ Exemplo correto:
5543999999999

🐺 Após validar o número, o sistema continuará automaticamente.

${error ? `❌ ${error}\n\n` : ''}🌹═══[ AGUARDANDO NÚMERO ]═══🐺
`;

}

async function choosePairingNumber(ask) {
  let error = '';
  while (true) {
    const answer = await ask(pairingPrompt(error));
    const text = String(answer || '').trim();
    const number = text;
    if (/^[1-9]\d{9,14}$/.test(number)) return number;
    error = 'Número inválido. Informe de 10 a 15 dígitos, incluindo o DDI.';
  }
}

module.exports = { choosePairingNumber, pairingPrompt };
