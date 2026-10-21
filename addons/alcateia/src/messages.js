function normalizeMessageContent(content) {
  for (let depth = 0; content && depth < 8; depth++) {
    const inner = content.ephemeralMessage?.message || content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message || content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message;
    if (!inner) break;
    content = inner;
  }
  return content;
}


export function contentOf(msg) { return normalizeMessageContent(msg.message) || {}; }

export function textOf(msg) {
  const c = contentOf(msg);
  return c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption ||
    c.videoMessage?.caption || c.documentMessage?.caption || '';
}

export function contextOf(msg) {
  const content = contentOf(msg);
  for (const value of Object.values(content)) {
    if (value && typeof value === 'object' && value.contextInfo) return value.contextInfo;
  }
  return {};
}

export function parseCommand(body, prefix) {
  if (!body.startsWith(prefix)) return null;
  const text = body.slice(prefix.length).trim();
  if (!text) return null;
  const [command, ...args] = text.split(/\s+/);
  return { command: command.toLowerCase(), args, argText: text.slice(command.length).trim() };
}

export class Deduplicator {
  constructor({ ttl = 15 * 60_000, max = 10_000 } = {}) {
    this.ttl = ttl;
    this.max = max;
    this.seen = new Map();
  }
  accept(key, now = Date.now()) {
    if (this.seen.has(key) && now - this.seen.get(key) < this.ttl) return false;
    this.seen.delete(key);
    this.seen.set(key, now);
    while (this.seen.size > this.max) this.seen.delete(this.seen.keys().next().value);
    return true;
  }
}

export class ChatQueue {
  constructor() { this.queues = new Map(); this.depth = new Map(); }
  run(id, callback) {
    const depth = this.depth.get(id) || 0;
    if (depth >= 100) return Promise.resolve();
    this.depth.set(id, depth + 1);
    const previous = this.queues.get(id) || Promise.resolve();
    const result = previous.catch(() => {}).then(callback);
    this.queues.set(id, result);
    const cleanup = () => {
      this.depth.set(id, this.depth.get(id) - 1);
      if (this.queues.get(id) === result) { this.queues.delete(id); this.depth.delete(id); }
    };
    result.then(cleanup, cleanup);
    return result;
  }
}
