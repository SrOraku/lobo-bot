'use strict';

const EVENTS = ['messages.upsert', 'messages.update', 'messages.delete'];

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function messageKey(jid, id) {
  return validId(jid) && validId(id) ? JSON.stringify([jid, id]) : null;
}

/** Small, bounded WAMessage cache independent of the Baileys module format. */
class CacheMessageStore {
  constructor({ maxMessages = 1000, ttlMs = 10 * 60 * 1000, now = Date.now } = {}) {
    if (!Number.isInteger(maxMessages) || maxMessages < 1) throw new RangeError('maxMessages deve ser um inteiro positivo');
    if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new RangeError('ttlMs deve ser um número não negativo');
    if (typeof now !== 'function') throw new TypeError('now deve ser uma função');

    this._maxMessages = maxMessages;
    this._ttlMs = ttlMs;
    this._now = now;
    this._messages = new Map();
    this._emitter = null;
    this._listeners = [
      payload => this._upsert(payload),
      payload => this._update(payload),
      payload => this._delete(payload),
    ];
  }

  bind(emitter) {
    if (!emitter || typeof emitter.on !== 'function'
      || (typeof emitter.off !== 'function' && typeof emitter.removeListener !== 'function')) {
      throw new TypeError('O emissor deve implementar on e off ou removeListener');
    }

    this._unbind();
    this._emitter = emitter;
    for (let index = 0; index < EVENTS.length; index++) emitter.on(EVENTS[index], this._listeners[index]);
    return this;
  }

  async loadMessage(jid, id) {
    const key = messageKey(jid, id);
    if (key === null) return undefined;
    this._prune(this._now());
    return this._messages.get(key)?.message;
  }

  clear() {
    this._messages.clear();
  }

  destroy() {
    this._unbind();
    this.clear();
  }

  _unbind() {
    if (!this._emitter) return;
    const remove = this._emitter.off || this._emitter.removeListener;
    for (let index = 0; index < EVENTS.length; index++) {
      remove.call(this._emitter, EVENTS[index], this._listeners[index]);
    }
    this._emitter = null;
  }

  _prune(now) {
    for (const [key, entry] of this._messages) {
      if (entry.expiresAt <= now) this._messages.delete(key);
    }
    while (this._messages.size > this._maxMessages) {
      this._messages.delete(this._messages.keys().next().value);
    }
  }

  _put(key, jid, message, now) {
    // A refreshed message becomes the newest entry for bounded eviction.
    this._messages.delete(key);
    this._messages.set(key, { jid, message, expiresAt: now + this._ttlMs });
    while (this._messages.size > this._maxMessages) {
      this._messages.delete(this._messages.keys().next().value);
    }
  }

  _upsert(payload) {
    if (!Array.isArray(payload?.messages)) return;
    const now = this._now();
    this._prune(now);
    for (const message of payload.messages) {
      const jid = message?.key?.remoteJid;
      const key = messageKey(jid, message?.key?.id);
      if (key !== null) this._put(key, jid, message, now);
    }
  }

  _update(updates) {
    if (!Array.isArray(updates)) return;
    const now = this._now();
    this._prune(now);
    for (const item of updates) {
      const jid = item?.key?.remoteJid;
      const key = messageKey(jid, item?.key?.id);
      const update = item?.update;
      if (key === null || !update || typeof update !== 'object' || Array.isArray(update)) continue;
      const previous = this._messages.get(key)?.message;
      if (previous) this._put(key, jid, { ...previous, ...update, key: previous.key }, now);
    }
  }

  _delete(payload) {
    if (payload?.all === true) {
      if (!validId(payload.jid)) return;
      for (const [key, entry] of this._messages) {
        if (entry.jid === payload.jid) this._messages.delete(key);
      }
      return;
    }
    if (!Array.isArray(payload?.keys)) return;
    for (const key of payload.keys) {
      const id = messageKey(key?.remoteJid, key?.id);
      if (id !== null) this._messages.delete(id);
    }
  }
}

module.exports = { CacheMessageStore };
