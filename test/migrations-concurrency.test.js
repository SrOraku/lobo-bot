'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { migrations } = require('../src/config/migrations');

const script = `
const Database = require(${JSON.stringify(require.resolve('better-sqlite3'))});
const db = new Database(process.argv[1]);
db.pragma('journal_mode = WAL');
console.log = () => {};
require(${JSON.stringify(path.join(__dirname, '../src/config/migrations'))}).runMigrations(db);
`;

test('vários processos migrando o mesmo banco novo não colidem', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobo-migrations-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'fresh.db');
  const runs = Array.from({ length: 6 }, () => new Promise(resolve => {
    const child = spawn(process.execPath, ['-e', script, file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code, stderr }));
  }));
  for (const result of await Promise.all(runs)) assert.equal(result.code, 0, result.stderr);
  const db = new Database(file, { readonly: true });
  t.after(() => db.close());
  assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version), migrations.map(item => item.version));
});
