'use strict';
const db = require('../utils/database');
const { BOT_NAME } = require('../utils/helpers');

async function handleAutoReply(sock, msg, { jid, sender, body }) {
  try {
    if (!require('../activations/manager').manager.isEnabled(jid,'autoresposta')) return;

    if(await require('../automation/responses').createResponses(db).run(sock,msg,{jid,sender,body}))return;
    if(msg.key.fromMe)return;
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
  } catch (err) { require('../config/logger').logger.error({component:'autoresponse',code:err.code||'RESPONSE_FAILED'},'Falha na autoresposta.'); }
}

module.exports = { handleAutoReply };
