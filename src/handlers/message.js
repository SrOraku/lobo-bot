'use strict';
require('dotenv').config();
const { cleanJid, getNumber, PREFIX, BOT_NAME, logger } = require('../utils/helpers');
const db = require('../utils/database');
const { bus, EVENTS }       = require('../core/eventBus');
const { execute }           = require('../core/commandRegistry');
const { handleProtection }  = require('./protection');
const { handleAutoReply }   = require('./autoReply');
const { handleXP }          = require('./xp');

async function processMessage(sock, msg) {
  try {
    if (!msg.message) return;
    if (msg.key.fromMe) {
      const connected=String(sock.user?.id||'').split('@')[0].split(':')[0];
      if (!require('../utils/owners').ownerNumbers().includes(connected)) return;
    }
    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    const isGroup      = jid.endsWith('@g.us');
    const sender       = msg.key.fromMe ? cleanJid(sock.user?.id || '') : isGroup ? cleanJid(msg.key.participant || '') : cleanJid(jid);
    if (!sender) return;
    const senderNumber = getNumber(sender);
    const pushName     = msg.pushName || senderNumber;

    // Extrair texto
    const msgType = Object.keys(msg.message)[0];
    let body = '';
    if (msgType === 'conversation')             body = msg.message.conversation || '';
    else if (msgType === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text || '';
    else if (msgType === 'imageMessage')        body = msg.message.imageMessage?.caption || '';
    else if (msgType === 'videoMessage')        body = msg.message.videoMessage?.caption || '';
    if(!body)body=require('../activations/message-rules').inspect(msg.message).body;
    body = body.trim();
    if (msg.key.fromMe && !body.startsWith(PREFIX) && !/^\d+$/.test(body)) return;

    db.upsertUser(sender, pushName);
    const user = db.getUser(sender);

    if (user?.banned) return;
    if (user?.muted && body.startsWith(PREFIX)) return;

    if (isGroup) {
      db.upsertActivity(sender, jid);
      db.upsertGroup(jid, '');
    }

    bus.emit(EVENTS.MESSAGE_RECEIVED, { sender, jid, isGroup, body });

    if (isGroup) {
      const blocked = await handleProtection(sock, msg, { jid, sender, body, isGroup });
      if (blocked) return;
    }

    if (isGroup && /^\d+$/.test(body) && await require('../activations/interaction').interaction().handle(sock,
      { jid, sender, msg, isGroup, senderNumber, pushName }, body)) return;

    if (isGroup && body) await handleXP(sock, msg, { jid, sender, body, user });
    if (isGroup && body && !body.startsWith(PREFIX) && await require('./autoDownload').handleAutoDownload(sock,msg,{jid,sender,body,isGroup,user,pushName,senderNumber})) return;
    if (isGroup && body && !body.startsWith(PREFIX)) await handleAutoReply(sock, msg, { jid, sender, body });
    if (!body.startsWith(PREFIX)) return;

    const parts   = body.slice(PREFIX.length).trim().split(/\s+/);
    const command = parts.shift().toLowerCase();

    const ctx = { jid, sender, senderNumber, pushName, isGroup, args: parts, body, command, msg, msgType, user, BOT_NAME, PREFIX };
    await execute(command, sock, ctx);

  } catch (err) {
    logger.error({ err }, 'Erro em handleMessage');
  }
}

async function handleMessage(sock,msg) {
  const chat=msg.key?.remoteJid;
  if(!chat||chat==='status@broadcast')return;
  try {return await require('../isolation/context').run(chat,()=>processMessage(sock,msg));}
  catch(error){logger.error({code:error.code||error.name},'Não foi possível processar o chat isolado.');}
}
module.exports = { handleMessage };
