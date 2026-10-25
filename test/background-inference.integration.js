'use strict';
// Explicit integration check: model inference is intentionally outside npm test
// so every unrelated update does not load an AI model on constrained hosts.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {createLocalMedia}=require('../src/commands/local-media');
test('bundled CPU model removes a real background without Python or paid API',async()=>{
 const input=fs.readFileSync(path.join(__dirname,'../src/assets/menu-principal.jpg'));
 const sent=[];await createLocalMedia({read:async()=>input})('sfundo')({sendMessage:async(_,payload)=>sent.push(payload)},
  {jid:'120000@g.us',args:[],msg:{key:{id:'real-background'},message:{imageMessage:{caption:'!sfundo'}}}});
 const result=sent.find(payload=>payload.image);assert.ok(result,'Local inference must deliver an image');
 const meta=await sharp(result.image).metadata();assert.equal(meta.format,'png');assert.equal(meta.hasAlpha,true);
 const {data}=await sharp(result.image).ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=0,foreground=0;
 for(let index=3;index<data.length;index+=4){if(data[index]===0)transparent++;if(data[index]>127)foreground++;}
 assert.ok(transparent>0,'Background pixels must be transparent');assert.ok(foreground>0,'Foreground must be retained');
 assert.equal(sent.at(-1).react.text,'✅');
});
