'use strict';
const db = require('../utils/database');
const { card, mono } = require('../ui/text');

const config = require('../config');


async function handleXP(sock, msg, { jid, sender, body, user }) {
  try {
    const features=require('../activations/manager').manager;
    const xpEnabled=features.isEnabled(jid,'xp');
    // Cooldown e recompensas compartilham a mesma transação.
    const chat = require('../isolation/context').current() || jid;
    const timestamp = Date.now();
    const result = db.db.transaction(() => {
      const last = db.db.prepare('SELECT expires_at FROM persistent_cooldowns WHERE chat_jid=? AND user_jid=? AND action=?').get(chat,sender,'xp');
      if(last?.expires_at > timestamp) return false;
      db.db.prepare('INSERT INTO persistent_cooldowns VALUES (?,?,?,?) ON CONFLICT(chat_jid,user_jid,action) DO UPDATE SET expires_at=excluded.expires_at').run(chat,sender,'xp',timestamp+(config.getNumber('XP_COOLDOWN_SEC') || 30)*1000);


    // Ganhou gold por mensagem (1 gold a cada 10 msgs)
    const actLog = db.db.prepare(`SELECT message_count FROM activity_log WHERE jid = ? AND group_id = ?`).get(sender, jid);
    if (features.isEnabled(jid,'economia') && actLog && actLog.message_count % 10 === 0) {
      db.addGold(sender, 1);
    }

    if(!xpEnabled) return;
    const {economy,isPremium}=require('../services/economy');
    const boost=economy().activeEffect(sender,'xp');
    const progressionMultiplier=require('../progression/service').progression().multipliers(jid,sender).xp;
    const xpGain = Math.floor(progressionMultiplier * (config.getNumber('XP_PER_MESSAGE') || 5) * Math.max(isPremium(db.getUser(sender)) ? (config.getNumber('XP_PREMIUM_MULTIPLIER') || 2) : 1, boost?.multiplier || 1));
    const gain = db.addXP(sender, xpGain);
    if(gain?.newLevel>gain?.oldLevel && features.isEnabled(jid,'level') && features.isEnabled(jid,'economia')) {
      db.addGold(sender,50);
      db.logGoldTransaction('bot',sender,50,'Level up para '+gain.newLevel);
    }
    return gain;
    })();
    if(!result) return;

    // Verificar level up
    if (result.newLevel > result.oldLevel) {
      if (features.isEnabled(jid,'level')) {
        await sock.sendMessage(jid, {
          text: card('⬆️ LEVEL UP!', [
            `🎉 *@${sender.split('@')[0]}* _subiu de nível!_`,
            `📊 *Nível anterior:* ${mono(result.oldLevel)}`,
            `🆙 *Novo nível:* ${mono(result.newLevel)}`,
            `🏆 *Rank atual:* ${result.rank}`,
            `${features.isEnabled(jid,'economia') ? '💰 *Presente:* '+mono('+50')+' WoK coin pelo level up!' : '💰 Economia pausada neste grupo.'}`,
          ], { tip: '_Uuuuuuwooooo! 🐺_' }),
          mentions: [sender]
        });

      }
    }
  } catch (err) {
    require('../utils/helpers').logger.error({component:'xp',errorCode:err.code || 'XP_FAILED',error:err.message},'Falha ao processar XP.');
  }
}

module.exports = { handleXP };
