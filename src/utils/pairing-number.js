'use strict';

function pairingPrompt(error = '') {
  return `
🌹╔═══❖♆❖═══╗
📱 ESCOLHA DO WHATSAPP
╚═══❖♆❖═══╝🐺

╭── ❖ NOVO PAREAMENTO ❖ ──╮
┃ 1. Escolha a conta do WhatsApp.
┃ 2. Informe o número com DDI e DDD.
┃ 3. Aguarde o código de conexão.
╰────────────────────────╯

📋 COMO PREENCHER
• Brasil: 55 + DDD + número.
• Exemplo: 5511987654321
• Também aceita: +55 (11) 98765-4321
• Outros países: DDI + número completo.
• Não coloque letras ou o dígito 0 de operadora.

🛡️ PERMISSÕES E SESSÃO
• O número conectado não recebe poderes de dono.
• O dono configurado permanece o mesmo.
• Tenha acesso ao WhatsApp desse número.
• Uma sessão válida será reutilizada nos reinícios.

🔑 DEPOIS DE RECEBER O CÓDIGO
WhatsApp → Aparelhos conectados
→ Conectar aparelho → Conectar com número.

${error ? `⚠️ ${error}\nDigite novamente, sem precisar pressionar Enter antes.\n\n` : ''}📱 Digite o número do WhatsApp que será conectado:
➤ `;
}

async function choosePairingNumber(ask) {
  let error = '';
  while (true) {
    const answer = await ask(pairingPrompt(error));
    const text = String(answer || '').trim();
    const number = text.replace(/[+\s().-]/g, '');
    if (/^[1-9]\d{9,14}$/.test(number)) return number;
    error = 'Número inválido. Informe de 10 a 15 dígitos, incluindo o DDI.';
  }
}

module.exports = { choosePairingNumber, pairingPrompt };
