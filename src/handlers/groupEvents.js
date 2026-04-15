'use strict';
const db = require('../utils/database');
const { BOT_NAME, cleanJid, getNumber, logger } = require('../utils/helpers');

async function handleGroupParticipantsUpdate(sock, update) {
  try {
    const { id, participants, action } = update;
    const group = db.getGroup(id);

    for (const participant of participants) {
      const jid = cleanJid(participant);
      const number = getNumber(jid);

      if (action === 'add') {
        // Boas-vindas
        if (group?.welcome !== 0) {
          db.upsertUser(jid, number);

          // Gold inicial
          const goldStart = parseInt(process.env.GOLD_START) || 500;
          db.addGold(jid, goldStart);

          // Inicializar estratégia de lobos
          if (!db.getStrategy(jid)) {
            db.upsertStrategy(jid, 34, 33, 33);
          }

          await sock.sendMessage(id, {
            text: `🌙 *[ ${BOT_NAME} ]*\n\n╔══════════════════════╗\n║   🐾 *BEM-VINDO!* 🐾   ║\n╚══════════════════════╝\n\n🐺 @${number} entrou na matilha!\n\n💰 Você ganhou *${goldStart} Gold* de boas-vindas!\n🐺 Seus *100 Lobos* estão prontos!\n\n📖 Use *!infolobos* para aprender o jogo\n📋 Use *!menu* para ver todos os comandos\n\n_A matilha te recebe com uivos! 🐺🌕_`,
            mentions: [jid]
          });
        }

      } else if (action === 'remove') {
        if (group?.goodbye !== 0) {
          await sock.sendMessage(id, {
            text: `🌑 *[ ${BOT_NAME} ]*\n\n😢 *@${number}* deixou a matilha...\n\n_Os lobos uivam em sua despedida. 🐺_`,
            mentions: [jid]
          });
        }
      }
    }
  } catch (err) {
    logger.error('Erro no handleGroupParticipantsUpdate:', err);
  }
}

async function handleGroupsUpdate(sock, updates) {
  try {
    for (const update of updates) {
      if (!update.id) continue;
      const group = db.getGroup(update.id);
      if (!group) continue;

      if (update.subject) {
        db.updateGroup(update.id, 'name', update.subject);
      }
    }
  } catch (err) {
    logger.error('Erro no handleGroupsUpdate:', err);
  }
}

module.exports = { handleGroupParticipantsUpdate, handleGroupsUpdate };
