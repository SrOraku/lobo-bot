'use strict';
const path = require('node:path');
const Database = require('better-sqlite3');
const { migrations } = require('../src/config/migrations');
const { prefixFor } = require('../src/services/universal-currency');

function inspect(db) {
  const problems = [], totals = { chats: 0, players: 0, wallets: 0 };
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").pluck().all());
  const flag = message => { if (!problems.includes(message)) problems.push(message); };
  if (db.pragma('quick_check', { simple: true }) !== 'ok') flag('Falha de integridade no SQLite.');
  if (db.prepare('PRAGMA foreign_key_check').get()) flag('Referência inválida no SQLite.');
  const applied = new Map(tables.has('schema_migrations') ? db.prepare('SELECT version,name FROM schema_migrations').all().map(m => [m.version, m.name]) : []);
  const pending = migrations.filter(m => !applied.has(m.version)).map(m => m.version);
  if (migrations.some(m => applied.has(m.version) && applied.get(m.version) !== m.name)) flag('Histórico de migrações divergente.');
  if ([...applied.keys()].some(v => !migrations.some(m => m.version === v))) flag('Banco de uma versão mais recente ou desconhecida.');
  if (pending.length) flag('Há migrações pendentes.');
  const required = ['universal_wallets', 'universal_wallet_aliases', 'universal_game_states', 'chat_partitions', 'alcateia_action_receipts'];
  for (const table of required) if (!tables.has(table)) flag('Tabela ausente: ' + table);
  if (tables.has('universal_wallets') && tables.has('universal_wallet_aliases')) {
    totals.wallets = db.prepare('SELECT COUNT(*) FROM universal_wallets').pluck().get();
    if (db.prepare("SELECT 1 FROM universal_wallets WHERE typeof(balance)!='integer' OR balance NOT BETWEEN 0 AND 9007199254740991 LIMIT 1").get()) flag('Saldo de carteira inválido.');
    if (db.prepare('SELECT 1 FROM universal_wallet_aliases a LEFT JOIN universal_wallets w USING(chat_jid,wallet_jid) WHERE w.wallet_jid IS NULL LIMIT 1').get()) flag('Há uma identidade sem carteira correspondente.');
  }
  if (tables.has('universal_game_states')) {
    for (const row of db.prepare('SELECT state FROM universal_game_states').iterate()) {
      totals.chats++;
      let game;
      try { game = JSON.parse(row.state); } catch { flag('Estado de jogo com JSON ilegível.'); continue; }
      if (!game?.players || typeof game.players !== 'object' || Array.isArray(game.players)) { flag('Lista de jogadores inválida.'); continue; }
      for (const p of Object.values(game.players)) {
        totals.players++;
        if (!Number.isSafeInteger(p?.coins) || p.coins < 0) flag('Saldo de perfil inválido.');
        const inventory = p?.rp?.inventory;
        if (inventory !== undefined && (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)
          || Object.values(inventory).some(n => !Number.isSafeInteger(n) || n < 0 || n > 999))) flag('Estoque RP inválido.');
      }
    }
  }
  if (required.slice(0, 4).every(name => tables.has(name))) {
    for (const row of db.prepare('SELECT p.chat_jid,p.table_prefix FROM chat_partitions p JOIN universal_game_states g USING(chat_jid)').iterate()) {
      let prefix;
      try { prefix = prefixFor(row.chat_jid); } catch { flag('Identificador de partição inválido.'); continue; }
      const table = prefix + 'users';
      if (prefix !== row.table_prefix || !tables.has(table)) { flag('Partição de jogadores inválida.'); continue; }
      const mismatch = db.prepare(`SELECT 1 FROM ${table} u LEFT JOIN universal_wallet_aliases a ON a.user_jid=u.jid AND a.chat_jid=?
        LEFT JOIN universal_wallets w ON w.wallet_jid=a.wallet_jid AND w.chat_jid=a.chat_jid WHERE w.balance IS NOT u.gold LIMIT 1`).get(row.chat_jid);
      if (mismatch) flag('Saldo do perfil e da carteira divergem.');
    }
  }
  return { ok: problems.length === 0, ...totals, pending, problems };
}
function checkFile(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try { return db.transaction(() => inspect(db))(); } finally { db.close(); }
}
if (require.main === module) {
  try {
    const report = checkFile(process.argv[2] || path.join(__dirname, '../data/lobo.db'));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch { console.error('Não foi possível verificar o banco. Confira o arquivo SQLite, a versão e as permissões de leitura.'); process.exitCode = 1; }
}
module.exports = { checkFile };
