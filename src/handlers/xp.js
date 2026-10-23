'use strict';
const db = require('../utils/database');
const { BOT_NAME, wolvesBar } = require('../utils/helpers');

const XP_PER_MSG = parseInt(process.env.XP_PER_MESSAGE) || 5;
const XP_PREMIUM = parseFloat(process.env.XP_PREMIUM_MULTIPLIER) || 2;
const XP_COOLDOWN = new Map(); // anti spam xp

async function handleXP(sock, msg, { jid, sender, body, user }) {
  try {
    const features=require('../activations/manager').manager;
    const xpEnabled=features.isEnabled(jid,'xp');
    // Cooldown de 30s por mensagem para não ganhar XP spammando
    const coolKey = `xp_${sender}_${jid}`;
    const lastXP = XP_COOLDOWN.get(coolKey) || 0;
    if (Date.now() - lastXP < 30000) return;
    XP_COOLDOWN.set(coolKey, Date.now());

    // Ganhou gold por mensagem (1 gold a cada 10 msgs)
    const actLog = db.db.prepare(`SELECT message_count FROM activity_log WHERE jid = ? AND group_id = ?`).get(sender, jid);
    if (features.isEnabled(jid,'economia') && actLog && actLog.message_count % 10 === 0) {
      db.addGold(sender, 1);
    }

    if(!xpEnabled) return;
    const xpGain = Math.floor(XP_PER_MSG * (user?.premium ? XP_PREMIUM : 1));
    const result = db.addXP(sender, xpGain);
    if (!result) return;

    // Verificar level up
    if (result.newLevel > result.oldLevel) {
      if (features.isEnabled(jid,'level')) {
        await sock.sendMessage(jid, {
          text: `╔══════════════════════╗
║   ⬆️ *LEVEL UP!* ⬆️      
╚══════════════════════╝

🐺 *[ ${BOT_NAME} ]*

🎉 *@${sender.split('@')[0]}* subiu de nível!

📊 *Nível anterior:* ${result.oldLevel}
🆙 *Novo nível:* *${result.newLevel}*
🏆 *Rank atual:* ${result.rank}

${features.isEnabled(jid,'economia') ? '💰 *+50 Gold* de presente pelo level up!' : '💰 Economia pausada neste grupo.'}

_Uuuuuuwooooo! 🐺_`,
          mentions: [sender]
        });
        if(features.isEnabled(jid,'economia')) {
          db.addGold(sender, 50);
          db.logGoldTransaction('bot', sender, 50, `Level up para ${result.newLevel}`);
        }
      }
    }
  } catch (err) {
    // XP errors são silenciosos
  }
}

module.exports = { handleXP };
