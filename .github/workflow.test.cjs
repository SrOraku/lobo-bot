'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('o CI continua executando a auditoria pelo npm run security', () => {
  assert.equal(require('../package.json').scripts.security, 'node scripts/check-audit.js');
  const workflow = fs.readFileSync(path.join(__dirname, 'workflows/ci.yml'), 'utf8');
  assert.match(workflow, /run: npm run security/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});
