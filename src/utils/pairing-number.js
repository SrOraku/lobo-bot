'use strict';
const { card, plain, DIVIDER } = require('../ui/text');

function pairingPrompt(error = '') {
  return plain(card('CONECTAR WHATSAPP', [
    '📱 Digite o número que será conectado ao bot.',
    '🌐 *Formato:* DDI + DDD + NÚMERO',
    '📌 *Exemplo:* 5543999999999',
    DIVIDER,
    '55 → DDI\n43 → DDD\n999999999 → Número',
    '⚠️ Use somente números, sem:\n• +\n• espaços\n• traços\n• parênteses',
    '✅ Exemplo correto: 5543999999999',
    '🐺 Após validar o número, o sistema continuará automaticamente.',
    ...(error ? ['❌ ' + error] : []),
  ], { tip: '🌹 AGUARDANDO NÚMERO', formatNumbers: false })) + '\n';

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
