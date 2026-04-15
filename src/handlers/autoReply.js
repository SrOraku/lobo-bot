'use strict';
const db = require('../utils/database');
const { BOT_NAME } = require('../utils/helpers');

async function handleAutoReply(sock, msg, { jid, sender, body }) {
  try {
    const group = db.getGroup(jid);
    if (!group?.auto_reply) return;

    const replies = db.getAutoReplies(jid);
    if (!replies?.length) return;

    const bodyLower = body.toLowerCase();
    for (const reply of replies) {
      if (bodyLower.includes(reply.trigger.toLowerCase())) {
        await sock.sendMessage(jid, {
          text: reply.response,
          mentions: [sender]
        }, { quoted: msg });
        break;
      }
    }
  } catch (err) {}
}

module.exports = { handleAutoReply };
