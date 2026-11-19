'use strict';
const { statusCode } = require('./diagnostics');
function bounded(run, ms, code) {
  let timer;
  return Promise.race([Promise.resolve().then(run), new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(Error(code), { code })), ms);
  })]).finally(() => clearTimeout(timer));
}
function hasSavedSession(creds) {
  // requestPairingCode creates a provisional me.id; only a signed account or
  // registered credentials indicate that pairing really completed.
  return creds?.registered === true || (!!creds?.me?.id && !!creds?.account);
}
function resetIncompletePairing(creds) {
  if (!creds || hasSavedSession(creds) || !creds.me) return false;
  // A provisional me makes Baileys attempt login instead of registration.
  // Keep all identity keys and every completed signed session intact.
  delete creds.me;
  delete creds.pairingCode;
  return true;
}
function credentialWriter(save, onError) {
  let pending = Promise.resolve(), failure = null;
  function write() {
    pending = pending.then(async () => {
      try { await save(); failure = null; }
      catch (error) { failure = error; onError?.(error); }
    });
    return pending;
  }
  return { write, async flush() { await write(); if (failure) throw failure; } };
}
function createLifecycle({ reconnect, onState = () => {}, onDisconnect = () => {}, onError = () => {}, onFatal = () => {},
  maxReconnect = 10, operationTimeoutMs = 15000, initializationTimeoutMs = 60000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let current = null, attempts = 0, stopping = false;
  function attach(socket, { saveCreds, onOpen = async () => {}, beforeReconnect = async () => {} } = {}) {
    if (current?.active) throw Error('SOCKET_ALREADY_ACTIVE');
    const writer = credentialWriter(saveCreds, error => onError(error, 'SAVE_CREDS_FAILED'));
    const listeners = [];
    const session = { active: true, socket, isActive: () => session.active && !stopping,
      listen(name, listener) { socket.ev.on(name, listener); listeners.push([name, listener]); },
      detach() {
        session.active = false;
        const remove = socket.ev.off || socket.ev.removeListener;
        for (const [name, listener] of listeners) remove.call(socket.ev, name, listener);
        listeners.length = 0;
      },
      flush: () => bounded(writer.flush, operationTimeoutMs, 'SAVE_CREDS_TIMEOUT'),
      initialized: beforeReconnect,
    };
    current = session;
    session.listen('creds.update', () => { writer.write(); });
    let opened = false;
    session.listen('connection.update', update => {
      if (!session.isActive()) return;
      if (update.connection === 'open' && !opened) {
        opened = true; attempts = 0;
        Promise.resolve().then(async () => {
          await session.flush();
          if (session.isActive()) await onOpen();
        }).catch(error => onError(error, 'CONNECTION_OPEN_FAILED'));
      }
      if (update.connection !== 'close') return;
      session.detach();
      const code = statusCode(update.lastDisconnect?.error);
      try { onDisconnect({ code }); } catch { /* A console failure must not prevent reconnection. */ }
      Promise.resolve().then(async () => {
        await session.flush();
        try { await bounded(() => socket.end?.(), operationTimeoutMs, 'SOCKET_CLOSE_TIMEOUT'); }
        catch (error) { if (error.code === 'SOCKET_CLOSE_TIMEOUT') throw error; /* Socket may already be closed. */ }
        if (stopping) return;
        if (code === 401) { onFatal('LOGGED_OUT'); return; }
        if (attempts >= maxReconnect) { onFatal('RECONNECT_LIMIT'); return; }
        await bounded(beforeReconnect, initializationTimeoutMs, 'PLUGIN_INITIALIZATION_TIMEOUT');
        if (stopping) return;
        attempts++;
        const delay = code === 515 ? 1000 : Math.min(30000, 3000 * 2 ** Math.min(attempts - 1, 4));
        onState({ state: 'reconnecting', code, attempt: attempts, delay });
        await wait(delay);
        if (!stopping) await reconnect();
      }).catch(error => { onError(error, 'RECONNECT_FAILED'); if (!stopping) onFatal('RECONNECT_FAILED'); });
    });
    return session;
  }
  async function stop() {
    stopping = true;
    const session = current;
    if (!session) return;
    session.detach();
    await session.flush();
    try { await bounded(() => session.socket.end?.(), operationTimeoutMs, 'SOCKET_CLOSE_TIMEOUT'); } catch { /* Shutdown must finish even when the old socket does not. */ }
    await bounded(session.initialized, initializationTimeoutMs, 'PLUGIN_INITIALIZATION_TIMEOUT');
  }
  return { attach, stop };
}
module.exports = { hasSavedSession, resetIncompletePairing, credentialWriter, createLifecycle };
