'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {renderMediaInfo,sendMediaInfo,lookupMedia}=require('../src/commands/media-info');
test('media information preserves original title and full description without invented data',async()=>{
 const description='Descrição original: ação 🌹\n'+ 'Texto completo. '.repeat(600);
 const info={title:'Quintal da Magia',timestamp:'11:25',ago:'há 4 anos',author:{name:'Quintal da Magia'},description};
 const messages=[];await sendMediaInfo(text=>messages.push(text),info);
 assert.equal(messages.join(''),renderMediaInfo(info));assert.ok(messages.join('').includes(description));
 assert.ok(messages.every(text=>text.length<=3500));assert.match(messages[0],/11:25/);
 assert.doesNotMatch(renderMediaInfo({}),/100%|Quintal/);
});
test('metadata resolves a named search to the exact video and obtains its description',async()=>{
 const calls=[];const info=await lookupMedia('cantiga',async query=>{calls.push(query);return typeof query==='string'?{videos:[{videoId:'abcdefghijk'}]}:{title:'Original',description:'Descrição integral'};});
 assert.equal(info.url,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(info.description,'Descrição integral');assert.deepEqual(calls[1],{videoId:'abcdefghijk'});
});
test('metadata failure does not prevent media delivery or invent description',async()=>{
 assert.equal(await lookupMedia('cantiga',async()=>{throw Error('offline');}),null);
 assert.match(renderMediaInfo({}),/Não disponibilizada pela fonte/);
});
