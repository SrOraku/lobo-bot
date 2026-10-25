'use strict';

// Best-effort presentation. A reaction must never delay or fail a command.
function createReactions({ now = Date.now, timeout = 1000, maxEntries = 1000, log = () => {} } = {}) {
  const entries = new Map();
  let sequence = 0;
  function prune() {
    for (const [key, entry] of entries) if (entry.expires <= now()) entries.delete(key);
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
  }
  async function post(sock, jid, key, text) {
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(() => sock.sendMessage(jid, { react: { text, key } })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('REACTION_TIMEOUT')), timeout); timer.unref?.(); }),
      ]);
      return true;
    } catch {
      // Optional feedback has no effect on permissions, persistence or replies.
      try { log({ component: 'ui-reactions', errorCode: 'REACTION_UNAVAILABLE' }); } catch { /* Logging is also optional. */ }
      return false;
    } finally { clearTimeout(timer); }
  }
  function begin(sock, ctx, definition = {}) {
    const key = ctx.msg?.key;
    if (!key?.id || key.remoteJid !== ctx.jid || typeof sock.sendMessage !== 'function') return;
    const id = `${ctx.jid}|${key.id}`;
    if (entries.has(id)) return;
    prune();
    const context = /adm|dono|seguranca/u.test(definition.category || '') || /ativacoes|^anti|security|seguranca/u.test(definition.name || ctx.command || '') ? '🛡️'
      : /jogos|alcateia|rp|gartic/u.test(definition.category || '') ? '🎮' : '🐺';
    const icons = ['🐺', '🌹', context];
    const entry = { key: { ...key }, expires: now() + 120000, complete: false };
    entry.pending = post(sock, ctx.jid, entry.key, icons[sequence++ % icons.length]);
    entries.set(id, entry);
  }
  function complete(sock, ctx) {
    const entry = entries.get(`${ctx.jid}|${ctx.msg?.key?.id}`);
    if (!entry || entry.complete) return;
    entry.complete = true;
    entry.pending = entry.pending.then(sent => sent ? post(sock, ctx.jid, entry.key, '✅') : false);
  }
  return {
    begin, complete,
    async run(sock, ctx, definition, execute) {
      begin(sock, ctx, definition);
      const result = await execute();
      complete(sock, ctx);
      return result;
    },
    size: () => entries.size,
    drain: () => Promise.all([...entries.values()].map(entry => entry.pending)),
  };
}

module.exports = { createReactions, reactions: createReactions() };
