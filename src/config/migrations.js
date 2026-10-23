'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — MIGRATIONS DO BANCO
// ============================================================

// Também verificado no boot: instalações antigas podem ter a versão marcada
// sem a tabela de auditoria. Não repetir migrações que alteram configurações.
const ACTIVATION_AUDIT_SCHEMA = `CREATE TABLE IF NOT EXISTS activation_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT NOT NULL,
      feature TEXT NOT NULL, previous_state TEXT, new_state TEXT,
      actor TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activation_audit_group ON activation_audit(group_jid,created_at);
`;

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        jid TEXT PRIMARY KEY,
        name TEXT,
        gold INTEGER DEFAULT 500,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        rank TEXT DEFAULT '🐾 Filhote de Lobo',
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        battles INTEGER DEFAULT 0,
        premium INTEGER DEFAULT 0,
        premium_until TEXT,
        banned INTEGER DEFAULT 0,
        muted INTEGER DEFAULT 0,
        shield_until TEXT,
        last_seen TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS wolf_strategy (
        jid TEXT PRIMARY KEY,
        attack INTEGER DEFAULT 34,
        defense INTEGER DEFAULT 33,
        counter INTEGER DEFAULT 33,
        total_attacks INTEGER DEFAULT 0,
        total_victories INTEGER DEFAULT 0,
        wolves_alive INTEGER DEFAULT 100,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS battle_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attacker TEXT, defender TEXT,
        attacker_wolves_before INTEGER, defender_wolves_before INTEGER,
        attacker_wolves_after INTEGER, defender_wolves_after INTEGER,
        result TEXT, group_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS groups (
        jid TEXT PRIMARY KEY, name TEXT,
        antilink INTEGER DEFAULT 0, antilink_mode TEXT DEFAULT 'delete',
        antifake INTEGER DEFAULT 0, anticontact INTEGER DEFAULT 0,
        antitag INTEGER DEFAULT 0, antiinactivity INTEGER DEFAULT 0,
        inactivity_days INTEGER DEFAULT 7, open INTEGER DEFAULT 1,
        welcome INTEGER DEFAULT 1, goodbye INTEGER DEFAULT 1,
        auto_reply INTEGER DEFAULT 1, level_up_msg INTEGER DEFAULT 1,
        nsfw INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS auto_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT, trigger TEXT, response TEXT,
        type TEXT DEFAULT 'text',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT, message TEXT, cron_expr TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS activity_log (
        jid TEXT, group_id TEXT,
        message_count INTEGER DEFAULT 0,
        last_message TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (jid, group_id)
      );
      CREATE TABLE IF NOT EXISTS admins (
        jid TEXT PRIMARY KEY,
        level INTEGER DEFAULT 1,
        added_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS gold_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_jid TEXT, to_jid TEXT,
        amount INTEGER, reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS error_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context TEXT, message TEXT, stack TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `
  },
  {
    version: 2,
    name: 'indexes',
    up: `
      CREATE INDEX IF NOT EXISTS idx_users_gold   ON users(gold DESC);
      CREATE INDEX IF NOT EXISTS idx_users_level  ON users(level DESC, xp DESC);
      CREATE INDEX IF NOT EXISTS idx_wolf_vic     ON wolf_strategy(total_victories DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_grp ON activity_log(group_id, last_message DESC);
      CREATE INDEX IF NOT EXISTS idx_battle_date  ON battle_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_gold_tx_date ON gold_transactions(created_at DESC);
    `
  },
  {
    version: 3,
    name: 'plugin_support',
    up: `
      CREATE TABLE IF NOT EXISTS plugins (
        name TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        config TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS events_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT, payload TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `
  },
  {
    version: 4,
    name: 'group_activations',
    up: `CREATE TABLE IF NOT EXISTS group_activations (
      group_jid TEXT PRIMARY KEY,
      policy TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );`
  },
  {
    version: 5,
    name: 'central_feature_activations',
    up: ACTIVATION_AUDIT_SCHEMA + `    INSERT INTO group_activations(group_jid,policy,updated_by)
      SELECT jid,'{"bot":true,"sectors":{},"delegates":{},"features":{}}','migration' FROM groups WHERE true
      ON CONFLICT(group_jid) DO NOTHING;
    UPDATE group_activations SET policy=json_set(policy,
      '$.features',json_patch(COALESCE(json_extract(policy,'$.features'),'{}'),
      COALESCE((SELECT json_object('antilink',antilink,'antifake',antifake,'anticontato',anticontact,
      'antimarcacao',antitag,'antiinatividade',antiinactivity,'bemvindo',welcome,
      'despedida',goodbye,'autoresposta',auto_reply,'level',level_up_msg) FROM groups WHERE jid=group_jid),'{}')));
    `
  },
  {version:6,name:'chat_isolation_seed',up:`CREATE TABLE IF NOT EXISTS chat_partitions(chat_jid TEXT PRIMARY KEY,table_prefix TEXT NOT NULL UNIQUE,created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE isolation_seed_users AS SELECT * FROM users;
CREATE TABLE isolation_seed_wolf_strategy AS SELECT * FROM wolf_strategy;
CREATE TABLE isolation_seed_battle_log AS SELECT * FROM battle_log;
CREATE TABLE isolation_seed_gold_transactions AS SELECT * FROM gold_transactions;
CREATE TABLE isolation_seed_auto_replies AS SELECT * FROM auto_replies;
CREATE TABLE isolation_seed_scheduled_messages AS SELECT * FROM scheduled_messages;
`},
  { version: 7, name: 'repair_activation_audit', up: ACTIVATION_AUDIT_SCHEMA },
  { version: 8, name: 'group_warnings', up: `
    CREATE TABLE IF NOT EXISTS group_warnings(group_jid TEXT NOT NULL,user_jid TEXT NOT NULL,total INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(group_jid,user_jid));
    CREATE TABLE IF NOT EXISTS group_warning_events(id INTEGER PRIMARY KEY AUTOINCREMENT,group_jid TEXT NOT NULL,user_jid TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT,event_id TEXT NOT NULL,created_at TEXT DEFAULT (datetime('now')),UNIQUE(group_jid,event_id));
  ` },
  { version: 9, name: 'arcade_games', up: `
    CREATE TABLE arcade_sessions(chat_jid TEXT NOT NULL,user_jid TEXT NOT NULL,game TEXT NOT NULL,state TEXT,updated_at INTEGER NOT NULL,available_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(chat_jid,user_jid,game));
    CREATE TABLE arcade_scores(chat_jid TEXT NOT NULL,user_jid TEXT NOT NULL,name TEXT,points INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,played INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(chat_jid,user_jid));
    CREATE TABLE arcade_events(chat_jid TEXT NOT NULL,event_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(chat_jid,event_id));
    CREATE INDEX arcade_event_date ON arcade_events(created_at);
  ` },
  {version:10,name:'owner_security_media',up:`
    CREATE TABLE bot_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE security_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,chat_jid TEXT,actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT,created_at TEXT DEFAULT(datetime('now')));
    CREATE TABLE group_guard(group_jid TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,policy TEXT NOT NULL);
  `},
];

function runMigrations(db) {
  // Tabela de controle de versão
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare(`SELECT version FROM schema_migrations`).all().map(r => r.version)
  );

  let ran = 0;
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.up);
      db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`).run(m.version, m.name);
    })();
    ran++;
    console.log(`  🌹 Migration v${m.version} "${m.name}" aplicada`);
  }

  // Reparo idempotente inclusive quando o histórico já informa a versão atual.
  // A falha deve impedir o boot antes de aceitar comandos sem auditoria.
  db.transaction(() => db.exec(ACTIVATION_AUDIT_SCHEMA))();

  if (ran === 0) console.log(`  ✅ Banco atualizado (v${migrations.at(-1).version})`);
  return ran;
}

module.exports = { runMigrations, migrations };
