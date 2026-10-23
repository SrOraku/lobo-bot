'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
let count = 0;
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'data', 'storage', 'sessions', 'backups'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.error || result.status !== 0) process.exit(1);
      count++;
    }
  }
}
for (const name of ['src', 'scripts', 'plugins', 'addons', 'test']) check(path.join(root, name));
console.log(`✅ Sintaxe validada: ${count} arquivos JavaScript.`);
