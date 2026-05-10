'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — PLUGIN DE EXEMPLO
// Copie este arquivo, renomeie e personalize!
// ============================================================

module.exports = {
  name:        'exemplo',
  version:     '1.0.0',
  description: 'Plugin de exemplo — demonstra como criar plugins',

  commands: {
    'olamundo': async (sock, ctx) => {
      const { jid, msg, pushName } = ctx;
      await sock.sendMessage(jid, {
        text: `🌹✦❀🐺✦❀🌹\n\n🐺 Olá, *${pushName}*!\nEste comando veio de um plugin!\n\n_Adicione seus plugins na pasta /plugins_\n\n🌹🐺✦❀🌹`
      }, { quoted: msg });
    },
  },

  onLoad:   async (sock) => { console.log('🔌 Plugin "exemplo" carregado!'); },
  onUnload: async ()     => { console.log('🔌 Plugin "exemplo" descarregado!'); },
};
