'use strict';
const db = require('../utils/database');
const fs = require('node:fs');
const path = require('node:path');
const welcomeImage = path.join(__dirname, '../assets/bem-vindo.jpg');
const { welcomeCaption, GOODBYE } = require('../menus/group-captions');
const { cleanJid, getNumber, logger } = require('../utils/helpers');

async function processGroupParticipantsUpdate(sock, update) {
  try {
    const { id, participants, action } = update;

    for (const participant of participants) {
      const jid = cleanJid(typeof participant === 'string' ? participant : participant?.id || participant?.phoneNumber || '');
      if (!jid) continue;
      const number = getNumber(typeof participant === 'object' && participant.phoneNumber ? cleanJid(participant.phoneNumber) : jid);

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

          let groupName = db.getGroup?.(id)?.name || 'Alcateia';
          if (typeof sock.groupMetadata === 'function') {
            try { groupName = (await sock.groupMetadata(id))?.subject || groupName; }
            catch { logger.warn('Nome do grupo indisponível; usando o nome salvo.'); }
          }
          const caption = welcomeCaption(number, groupName);

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
            text: GOODBYE,
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
      await require('../security/group-guard').enforce(sock,update);
      const group = db.getGroup(update.id);
      if (!group) continue;

      if (update.subject) {
        const guard = require('../security/group-guard').get(update.id);
        db.updateGroup(update.id, 'name', guard.enabled ? guard.subject : update.subject);
      }
    }
  } catch (err) {
    logger.error('Erro no handleGroupsUpdate:', err);
  }
}

async function handleGroupParticipantsUpdate(sock,update){return require('../isolation/context').run(update.id,()=>processGroupParticipantsUpdate(sock,update));}
module.exports = { handleGroupParticipantsUpdate, handleGroupsUpdate };
