'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WELCOME,GOODBYE,welcomeCaption}=require('../src/menus/group-captions');
test('welcome fills every group placeholder and mentions participant without changing the template',()=>{
 const caption=welcomeCaption('5543999999999','Lua Verde');
 assert.equal(caption,WELCOME.replaceAll('#numerodele#','@5543999999999').replaceAll('#nomedogp#','Lua Verde'));
 assert.equal(caption.includes('#nomedogp#'),false);
 assert.ok(caption.includes('🔮 𝐎𝐑𝐈𝐗𝐀́(𝐒)'));
 assert.ok(caption.includes('Compartilhe somente o que se sentir confortável.'));
});
test('group names are inserted literally rather than treated as replacement instructions',()=>{
 assert.ok(welcomeCaption('123','Lua $& #numerodele#').includes('Lua $& #numerodele#'));
});
test('goodbye preserves the supplied satire, motto and closing',()=>{
 assert.ok(GOODBYE.includes('“MEU FILHO, ELE SÓ SAIU DO GRUPO.” 😂🌹'));
 assert.ok(GOODBYE.includes('𝐁𝐎𝐋𝐒𝐎𝐍𝐀𝐑𝐈𝐒𝐓𝐀 𝐎̂𝐌𝐄𝐆𝐀:'));
 assert.ok(GOODBYE.includes('𝐏𝐄𝐓𝐈𝐒𝐓𝐀 𝐎̂𝐌𝐄𝐆𝐀:'));
 assert.ok(GOODBYE.endsWith('🌹◢◤━━━━━━━━━━🌙━━━━━━━━━━◥◣🌹'));
});
