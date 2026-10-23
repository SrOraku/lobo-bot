'use strict';
const { createHash } = require('node:crypto');
const { current, chatId } = require('./context');
const TABLES = [
  'users',
  'wolf_strategy',
  'battle_log',
  'gold_transactions',
  'auto_replies',
  'scheduled_messages',
];
function createScopedDatabase(db) {
  const ready = new Map(),
    statements = new Map();
  function partition(scope) {
    chatId(scope);
    if (ready.has(scope)) {
      require('../services/universal-currency').ensureScope(db,scope,ready.get(scope));
      return ready.get(scope);
    }
    const prefix = 'chat_' + createHash('sha256').update(scope).digest('hex').slice(0, 32) + '_';
    db.transaction(() => {
      for (const table of TABLES) {
        const name = prefix + table;
        if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
          continue;
        const schema = db
          .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
          .get(table)?.sql;
        if (!schema) throw Error('Tabela original ausente.');
        const ddl = schema.replace(
          /\b(users|wolf_strategy|battle_log|gold_transactions|auto_replies|scheduled_messages)\b/g,
          (word) => prefix + word,
        );
        db.exec(ddl);
        const columns = db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((c) => c.name);
        const available = new Set(
          db
            .prepare(`PRAGMA table_info(isolation_seed_${table})`)
            .all()
            .map((c) => c.name),
        );
        const common = columns
          .filter((c) => available.has(c))
          .map((c) => '"' + c + '"')
          .join(',');
        db.exec(`INSERT INTO ${name} (${common}) SELECT ${common} FROM isolation_seed_${table}`);
        if (table === 'users')
          db.exec(
            `CREATE INDEX ${name}_gold ON ${name}(gold DESC);CREATE INDEX ${name}_level ON ${name}(level DESC,xp DESC)`,
          );
      }
      db.prepare('INSERT OR IGNORE INTO chat_partitions(chat_jid,table_prefix) VALUES (?,?)').run(
        scope,
        prefix,
      );
    })();
    require('../services/universal-currency').ensureScope(db,scope,prefix);
    ready.set(scope, prefix);
    return prefix;
  }
  function statement(sql) {
    const scope = current();
    const prefix = scope ? partition(scope) : '';
    const query = prefix
      ? sql.replace(
          /\b(users|wolf_strategy|battle_log|gold_transactions|auto_replies|scheduled_messages)\b/g,
          (word) => prefix + word,
        )
      : sql;
    if (!statements.has(query)) statements.set(query, db.prepare(query));
    return statements.get(query);
  }
  return new Proxy(db, {
    get(target, key) {
      if(key===Symbol.for('lobo.rawDatabase'))return target;
      if (key === 'exec')
        return (sql) => {
          const scope = current(),
            prefix = scope ? partition(scope) : '';
          return target.exec(
            prefix
              ? sql.replace(
                  /\b(users|wolf_strategy|battle_log|gold_transactions|auto_replies|scheduled_messages)\b/g,
                  (word) => prefix + word,
                )
              : sql,
          );
        };
      if (key === 'prepare')
        return (sql) =>
          new Proxy(
            {},
            {
              get(_, method) {
                const value = statement(sql)[method];
                return typeof value === 'function'
                  ? (...args) => statement(sql)[method](...args)
                  : value;
              },
            },
          );
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
module.exports = { createScopedDatabase, TABLES };
