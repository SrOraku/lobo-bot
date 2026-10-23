'use strict';
const db = require('../utils/database');
const fs = require('node:fs');
const path = require('node:path');
const welcomeImage = path.join(__dirname, '../assets/bem-vindo.jpg');
const { IDENTITY } = require('../menus/render');
const { BOT_NAME, cleanJid, getNumber, logger } = require('../utils/helpers');

async function processGroupParticipantsUpdate(sock, update) {
  try {
    const { id, participants, action } = update;

    for (const participant of participants) {
      const jid = cleanJid(typeof participant === 'string' ? participant : participant?.id || participant?.phoneNumber || '');
      if (!jid) continue;
      const number = getNumber(jid);

      if (action === 'add') {
        // Boas-vindas
        if (require('../activations/manager').manager.isEnabled(id,'bemvindo')) {
          db.upsertUser(jid, number);

          // Gold inicial
          const goldStart = parseInt(process.env.GOLD_START) || 500;
          db.addGold(jid, goldStart);

          // Inicializar estratégia de lobos
          if (!db.getStrategy(jid)) {
            db.upsertStrategy(jid, 34, 33, 33);
          }

          const caption = `🌙 *[ ${BOT_NAME} ]*\n\n╔══════════════════════╗\n║   🐾 *BEM-VINDO!* 🐾   ║\n╚══════════════════════╝\n\n🐺 @${number} entrou na matilha!\n\n💰 Você ganhou *${goldStart} Gold* de boas-vindas!\n🐺 Seus *100 Lobos* estão prontos!\n\n📖 Use *!infolobos* para aprender o jogo\n📋 Use *!menu* para ver todos os comandos\n\n_A matilha te recebe com uivos! 🐺🌕_\n\n🌹 Dev: ${IDENTITY.developer}\n${IDENTITY.motto}`;
          try {
            await sock.sendMessage(id, {
              image: fs.readFileSync(welcomeImage), caption, mentions: [jid]
            });
          } catch (error) {
            logger.warn('Não foi possível enviar a imagem de boas-vindas; enviando texto.');
            await sock.sendMessage(id, { text: caption, mentions: [jid] });
          }
        }

      } else if (action === 'remove') {
        if (require('../activations/manager').manager.isEnabled(id,'despedida')) {
          await sock.sendMessage(id, {
            text: `🌑 *[ ${BOT_NAME} ]*\n\n😢 *@${number}* deixou a matilha...\n\n_Os lobos uivam em sua despedida. 🐺_\n\n🌹 Dev: ${IDENTITY.developer}\n${IDENTITY.motto}`,
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

async function handleGroupParticipantsUpdate(sock,update){return require('../isolation/context').run(update.id,()=>processGroupParticipantsUpdate(sock,update));}
module.exports = { handleGroupParticipantsUpdate, handleGroupsUpdate };
