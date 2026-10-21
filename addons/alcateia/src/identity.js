export function normalizeJid(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d+)(?::\d+)?@(s\.whatsapp\.net|lid|c\.us)$/.exec(value);
  if (!match) return null;
  return `${match[1]}@${match[2] === 'c.us' ? 's.whatsapp.net' : match[2]}`;
}

export function phoneJid(value) {
  const jid = normalizeJid(value);
  return jid?.endsWith('@s.whatsapp.net') ? jid : null;
}

export class IdentityResolver {
  constructor(sock, ownerJid, metadata = null) {
    this.sock = sock;
    this.ownerJid = phoneJid(ownerJid);
    this.metadata = metadata;
    this.aliases = new Map();
    this.pending = new Map();
    for (const member of metadata?.participants || []) this.register(member);
    this.register(sock.user || {});
    if (metadata?.owner && metadata?.ownerPn) this.register({ id: metadata.owner, phoneNumber: metadata.ownerPn });
  }

  register(member) {
    const identities = [member.id, member.lid, member.phoneNumber].map(normalizeJid).filter(Boolean);
    const pn = identities.find(phoneJid);
    if (pn) for (const id of identities) this.aliases.set(id, pn);
  }

  async phone(value, alternative = null) {
    const jid = normalizeJid(value);
    if (!jid) return null;
    if (phoneJid(jid)) return jid;
    const alt = phoneJid(alternative);
    if (alt) { this.aliases.set(jid, alt); return alt; }
    if (this.aliases.has(jid)) return this.aliases.get(jid);
    if (!this.pending.has(jid)) {
      this.pending.set(jid, (async () => {
        try {
          const pn = phoneJid(await this.sock.signalRepository?.lidMapping?.getPNForLID(jid));
          if (pn) this.aliases.set(jid, pn);
          return pn;
        } catch { return null; }
      })());
    }
    return this.pending.get(jid);
  }

  async same(a, b) {
    const left = normalizeJid(a);
    const right = normalizeJid(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const [lp, rp] = await Promise.all([this.phone(left), this.phone(right)]);
    return !!lp && lp === rp;
  }

  async member(value, alternative = null) {
    const jid = normalizeJid(value);
    if (!jid) return null;
    const pn = await this.phone(jid, alternative);
    let participant = null;
    for (const item of this.metadata?.participants || []) {
      const ids = [item.id, item.lid, item.phoneNumber].map(normalizeJid).filter(Boolean);
      if (ids.includes(jid) || (pn && ids.some(id => this.aliases.get(id) === pn || id === pn))) {
        participant = item;
        break;
      }
    }
    // If metadata only contains an LID, consult Baileys' trusted mapping.
    if (!participant && pn) {
      for (const item of this.metadata?.participants || []) {
        if (await this.phone(item.id) === pn) { participant = item; break; }
      }
    }
    const id = normalizeJid(participant?.id) || jid;
    const resolved = pn || await this.phone(id);
    const botIds = [this.sock.user?.id, this.sock.user?.lid].map(normalizeJid).filter(Boolean);
    const botPhones = await Promise.all(botIds.map(botId => this.phone(botId)));
    return {
      jid: id, phoneNumber: resolved, inGroup: !!participant,
      isOwner: !!resolved && resolved === this.ownerJid,
      isBot: botIds.includes(id) || botIds.includes(jid) || (!!resolved && botPhones.includes(resolved)),
      isAdmin: !!participant && (!!participant.admin || participant.isAdmin === true || participant.isSuperAdmin === true),
      isGroupOwner: participant?.admin === 'superadmin' || participant?.isSuperAdmin === true ||
        await this.same(id, this.metadata?.owner) || (!!resolved && resolved === phoneJid(this.metadata?.ownerPn)),
      aliases: [id, jid, resolved, normalizeJid(participant?.lid)].filter(Boolean),
    };
  }
}
