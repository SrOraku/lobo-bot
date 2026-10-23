'use strict';
const { defaults } = require('./policy');
const registry = require('./registry');
function createPolicyStore(db) {
  const select = db.prepare('SELECT policy FROM group_activations WHERE group_jid=?');
  const rows = db.prepare('SELECT group_jid,policy FROM group_activations');
  const legacy = db.prepare('SELECT * FROM groups WHERE jid=?');
  const write = db.prepare(
    "INSERT INTO group_activations(group_jid,policy,updated_by) VALUES (?,?,?) ON CONFLICT(group_jid) DO UPDATE SET policy=excluded.policy,updated_by=excluded.updated_by,updated_at=datetime('now')",
  );
  const audit = db.prepare(
    'INSERT INTO activation_audit(group_jid,feature,previous_state,new_state,actor) VALUES (?,?,?,?,?)',
  );
  const cache = new Map();
  function normalize(policy, group = {}) {
    const result = {
      ...defaults(),
      ...policy,
      features: { ...policy?.features },
      options: {
        antilink_mode: group.antilink_mode || 'delete',
        inactivity_days: group.inactivity_days || 7,
        ...policy?.options,
      },
    };
    for (const f of registry.list())
      if (f.source !== 'sector' && !Object.hasOwn(result.features, f.id))
        result.features[f.id] =
          f.legacyColumn && group[f.legacyColumn] != null ? !!group[f.legacyColumn] : f.default;
    for (const key of Object.keys(result.features)) {
      if (![true, false, 0, 1].includes(result.features[key]))
        throw Error('Configuração de ativação inválida.');
      result.features[key] = !!result.features[key];
    }
    return result;
  }
  function load(jid) {
    const row = select.get(jid);
    return normalize(row ? JSON.parse(row.policy) : null, legacy.get(jid));
  }
  function preload() {
    const records = rows.all(),
      next = new Map();
    for (const row of records) {
      try {
        next.set(row.group_jid, normalize(JSON.parse(row.policy), legacy.get(row.group_jid)));
      } catch {
        next.set(row.group_jid, new Error('Configuração de ativação inválida.'));
      }
    }
    cache.clear();
    for (const [id, value] of next) cache.set(id, value);
  }
  preload();
  function get(jid) {
    if (!cache.has(jid)) cache.set(jid, load(jid));
    const value = cache.get(jid);
    if (value instanceof Error) throw value;
    return structuredClone(value);
  }
  const transaction = db.transaction((jid, actor, fn) => {
    const before = load(jid),
      next = fn(structuredClone(before));
    write.run(jid, JSON.stringify(next), actor);
    const changes = [
      ['bot', before.bot, next.bot],
      ...['features', 'sectors', 'delegates', 'options'].flatMap((section) =>
        [...new Set([...Object.keys(before[section] || {}), ...Object.keys(next[section] || {})])]
          .filter(
            (key) =>
              JSON.stringify(before[section]?.[key]) !== JSON.stringify(next[section]?.[key]),
          )
          .map((key) => [section + '.' + key, before[section]?.[key], next[section]?.[key]]),
      ),
    ];
    for (const [id, old, value] of changes)
      if (JSON.stringify(old) !== JSON.stringify(value))
        audit.run(jid, id, JSON.stringify(old ?? null), JSON.stringify(value ?? null), actor);
    // Espelho de compatibilidade, escrito na mesma transação, nunca uma segunda configuração.
    for (const f of registry.list())
      if (f.legacyColumn && next.features?.[f.id] !== before.features?.[f.id])
        db.prepare(`UPDATE groups SET ${f.legacyColumn}=? WHERE jid=?`).run(
          next.features[f.id] ? 1 : 0,
          jid,
        );
    for (const key of ['antilink_mode', 'inactivity_days'])
      if (next.options?.[key] !== before.options?.[key])
        db.prepare(`UPDATE groups SET ${key}=? WHERE jid=?`).run(next.options[key], jid);
    return next;
  });
  return {
    get,
    history(jid, limit = 10) {
      return db.prepare('SELECT feature,previous_state,new_state,actor,created_at FROM activation_audit WHERE group_jid=? ORDER BY id DESC LIMIT ?').all(jid, Math.max(1, Math.min(50, Number(limit) || 10)));
    },
    preload,
    update(jid, actor, fn) {
      const next = transaction(jid, actor, fn);
      cache.set(jid, structuredClone(next));
      return structuredClone(next);
    },
  };
}
let instance;
function getStore() {
  return instance || (instance = createPolicyStore(require('../utils/database').db));
}
module.exports = { createPolicyStore, getStore };
