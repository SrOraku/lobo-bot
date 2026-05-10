'use strict';
const db = require('../utils/database');
const { logger, getNumber, isBrazilianFake, BOT_NAME } = require('../utils/helpers');

const LINK_REGEX = /(?:https?:\/\/|www\.|bit\.ly|t\.co|wa\.me|chat\.whatsapp\.com)[^\s]*/i;
const WHATSAPP_LINK_REGEX = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

async function handleProtection(sock, msg, { jid, sender, body, isGroup }) {
  if (!isGroup) return false;

  const group = db.getGroup(jid);
  if (!group) return false;

  // Checar se usuário é admin do grupo
  const groupMeta = await sock.groupMetadata(jid).catch(() => null);
  if (!groupMeta) return false;

  const senderParticipant = groupMeta.participants.find(p =>
    p.id.split('@')[0] === sender.split('@')[0]
  );
  const isGroupAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
  const isBotGroupAdmin = groupMeta.participants.find(p =>
    p.id === sock.user.id.split(':')[0] + '@s.whatsapp.net'
  )?.admin;

  // Admins são isentos das proteções
  if (isGroupAdmin) return false;

  // ========================
  // ANTI LINK
  // ========================
  if (group.antilink && LINK_REGEX.test(body)) {
    try {
      const mode = group.antilink_mode || 'delete';
      await sock.sendMessage(jid, {
        text: `⚠️ *[ ${BOT_NAME} ]*\n\n🔗 *ANTI-LINK ATIVADO!*\n\n@${sender.split('@')[0]} enviou um link!\n\n_Links não são permitidos neste grupo._`,
        mentions: [sender]
      });
      await sock.sendMessage(jid, { delete: msg.key });

      if (mode === 'kick' && isBotGroupAdmin) {
        await sock.groupParticipantsUpdate(jid, [sender], 'remove');
        logger.info(`Anti-link: ${sender} removido de ${jid}`);
      } else if (mode === 'warn') {
        const key = `warn_${sender}_${jid}`;
        const warns = (await require('../utils/cache').get(key) || 0) + 1;
        await require('../utils/cache').set(key, warns, 86400);
        if (warns >= 3 && isBotGroupAdmin) {
          await sock.groupParticipantsUpdate(jid, [sender], 'remove');
          await sock.sendMessage(jid, {
            text: `🚫 @${sender.split('@')[0]} foi *removido* após 3 avisos!`,
            mentions: [sender]
          });
        }
      }
      return true;
    } catch (err) {
      logger.error('Anti-link error:', err);
    }
  }

  // ========================
  // ANTI FAKE (número brasileiro sem dígito 9)
  // ========================
  if (group.antifake) {
    const number = getNumber(sender);
    if (isBrazilianFake(number)) {
      try {
        await sock.sendMessage(jid, {
          text: `🚫 *[ ${BOT_NAME} ]*\n\n❌ *ANTI-FAKE ATIVADO!*\n\n@${sender.split('@')[0]} possui um número suspeito/falso!\n\n_Números falsos não são permitidos._`,
          mentions: [sender]
        });
        if (isBotGroupAdmin) {
          await sock.groupParticipantsUpdate(jid, [sender], 'remove');
        }
        return true;
      } catch (err) {
        logger.error('Anti-fake error:', err);
      }
    }
  }

  // ========================
  // ANTI CONTATO (mensagens de contato)
  // ========================
  if (group.anticontact && msg.message?.contactMessage) {
    try {
      await sock.sendMessage(jid, {
        text: `🚫 *[ ${BOT_NAME} ]*\n\n📞 *ANTI-CONTATO ATIVADO!*\n\n_Compartilhamento de contatos não é permitido._`,
        mentions: [sender]
      });
      await sock.sendMessage(jid, { delete: msg.key });
      return true;
    } catch (err) {
      logger.error('Anti-contato error:', err);
    }
  }

  // ========================
  // ANTI MARCAÇÕES EXCESSIVAS
  // ========================
  if (group.antitag) {
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentions.length > 5) {
      try {
        await sock.sendMessage(jid, {
          text: `🚫 *[ ${BOT_NAME} ]*\n\n🏷️ *ANTI-MARCAÇÃO ATIVADO!*\n\n@${sender.split('@')[0]} tentou marcar ${mentions.length} pessoas!\n\n_Marcações em massa não são permitidas._`,
          mentions: [sender]
        });
        await sock.sendMessage(jid, { delete: msg.key });
        return true;
      } catch (err) {
        logger.error('Anti-tag error:', err);
      }
    }
  }

  return false;
}

module.exports = { handleProtection };
