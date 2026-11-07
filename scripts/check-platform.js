'use strict';

const assert = require('node:assert/strict');
const { detectPlatform, describePlatform } = require('../src/utils/platform');

const info = detectPlatform();
assert.ok(info.family);
assert.ok(info.arch);
assert.ok(info.node);
console.log(`✅ Ambiente detectado: ${describePlatform(info)}`);
console.log('ℹ️ Esta verificação identifica o ambiente; não substitui testes de instalação das dependências nativas.');
