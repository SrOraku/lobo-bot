'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — PLUGIN DE EXEMPLO
// Copie este arquivo, renomeie e personalize!
// ============================================================

const { card } = require('../src/ui/text');

module.exports = {
  name:        'exemplo',
  version:     '1.0.0',
  description: 'Plugin de exemplo — demonstra como criar plugins',

  commands: {
    'olamundo': async (sock, ctx) => {
      const { jid, msg, pushName } = ctx;
      await sock.sendMessage(jid, {
        text: card('OLÁ, MATILHA', [`🐺 Olá, *${pushName}*!`, '_Este comando veio de um plugin!_'], { tip: '🌹 _Adicione seus plugins na pasta_ `/plugins`.', formatNumbers: false })
      }, { quoted: msg });
    },
  },

  onLoad:   async (sock) => { console.log('🔌 Plugin "exemplo" carregado!'); },
  onUnload: async ()     => { console.log('🔌 Plugin "exemplo" descarregado!'); },
};
