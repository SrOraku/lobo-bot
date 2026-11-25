'use strict';

const PLAYER = /^\d{5,20}@(?:s\.whatsapp\.net|lid)$/;

// Phone and LID of the same person share one wallet; games key players by that wallet.
function canonicalPlayer(db, chat, original) {
  if (typeof original !== 'string' || !PLAYER.test(original)) return null;
  return db.prepare('SELECT wallet_jid FROM universal_wallet_aliases WHERE chat_jid=? AND user_jid=?').get(chat, original)?.wallet_jid || original;
}

module.exports = { canonicalPlayer };
