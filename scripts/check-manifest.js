'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(require('../package.json').version,'1.0.0','A versão oficial do LOBO-BOT permanece em 1.0.0.');
assert.equal(manifest.version,require('../package.json').version);
assert.equal(fs.readFileSync(path.join(root,'.version'),'utf8').trim(),manifest.version);
assert.deepEqual(manifest.files,require('./build-manifest').collect(root),'Manifesto desatualizado. Execute npm run release:manifest após finalizar as mudanças.');
console.log('✅ SHA-256 de todos os arquivos gerenciados confere.');
