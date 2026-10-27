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

 // Reproduce the two-step flow from the example: reply to the recut PNG with !s.
 // Only the WhatsApp download is mocked; both inference and WebP conversion run.
 const stickers=[];
 const {createStickerHandlers}=require('../src/commands/stickers');
 await createStickerHandlers({download:async()=>result.image}).criarSticker({sendMessage:async(_,payload)=>stickers.push(payload)},
  {jid:'120000@g.us',args:[],msg:{key:{id:'real-sticker'},message:{extendedTextMessage:{text:'!s',contextInfo:{quotedMessage:{imageMessage:{mimetype:'image/png'}}}}}}});
 const sticker=stickers.find(payload=>payload.sticker);assert.ok(sticker,'The recut image must convert to a sticker');
 const webp=await sharp(sticker.sticker).metadata();assert.equal(webp.format,'webp');assert.equal(webp.width,512);assert.equal(webp.height,512);
 const rgba=await sharp(sticker.sticker).ensureAlpha().raw().toBuffer();let clear=0,opaque=0;
 for(let index=3;index<rgba.length;index+=4){if(rgba[index]===0)clear++;if(rgba[index]>127)opaque++;}
 assert.ok(clear>0,'The sticker must retain transparent background');assert.ok(opaque>0,'The sticker must retain foreground');
});

test('sfundo sticker performs real inference and sends the transparent sticker directly',async()=>{
 const input=fs.readFileSync(path.join(__dirname,'../src/assets/menu-principal.jpg'));
 const sent=[];await createLocalMedia({read:async()=>input})('sfundo')({sendMessage:async(_,payload)=>sent.push(payload)},
  {jid:'120000@g.us',args:['sticker'],msg:{key:{id:'direct-background-sticker'},message:{extendedTextMessage:{text:'!sfundo sticker',contextInfo:{quotedMessage:{imageMessage:{mimetype:'image/jpeg'}}}}}}});
 const result=sent.find(payload=>payload.sticker);assert.ok(result,'The command must deliver a sticker directly');
 const meta=await sharp(result.sticker).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.hasAlpha,true);
 const rgba=await sharp(result.sticker).ensureAlpha().raw().toBuffer();let transparent=0,foreground=0;
 for(let index=3;index<rgba.length;index+=4){if(rgba[index]===0)transparent++;if(rgba[index]>127)foreground++;}
 assert.ok(transparent>0);assert.ok(foreground>0);assert.equal(sent.at(-1).react.text,'✅');
});
