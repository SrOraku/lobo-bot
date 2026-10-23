'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {validatePlugin,mergeCommands}=require('../src/core/plugin-contract');
test('legacy plugins remain valid; malformed permissions and hooks fail',()=>{assert.ok(validatePlugin({name:'legacy',commands:{test(){}}}).legacy);assert.throws(()=>validatePlugin({name:'bad',permissions:['secrets']}),/Permissões/);assert.throws(()=>validatePlugin({name:'bad',onLoad:true}),/Hook/);});
test('plugin collisions cannot silently replace official or other commands',()=>{const a={name:'a',commands:{test(){}}},b={name:'b',commands:{test(){}}};assert.throws(()=>mergeCommands([a,b]),/Colisão/);assert.throws(()=>mergeCommands([a],new Set(['test'])),/Colisão/);assert.equal(typeof mergeCommands([a]).test,'function');});
