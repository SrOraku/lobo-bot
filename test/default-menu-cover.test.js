'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {sendMenu}=require('../src/menus/media');

test('approved cover accompanies main menu but not submenus; removal remains respected',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobo-default-cover-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const defaultFile=path.join(dir,'cover.jpg');await fs.writeFile(defaultFile,'cover');
 const messages=[],sock={sendMessage:async(jid,payload)=>messages.push(payload)},ctx={jid:'123@g.us',args:[]};
 const options={getMedia:()=>null,useDefault:()=>true,defaultFile,defaultParts:[]};
 await sendMenu(sock,ctx,'main',options);assert.equal(messages[0].caption,'main');assert.equal(messages[0].image.toString(),'cover');
 await sendMenu(sock,{...ctx,args:['jogos']},'games',options);assert.deepEqual(messages[1],{text:'games'});
 await sendMenu(sock,ctx,'removed',{...options,useDefault:()=>false});assert.deepEqual(messages[2],{text:'removed'});
 await sendMenu(sock,ctx,'missing',{...options,defaultFile:path.join(dir,'missing.jpg')});assert.deepEqual(messages[3],{text:'missing'});
});

test('animated default cover is assembled and sent with gif playback',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lobo-default-video-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const partA=path.join(dir,'part-00'),partB=path.join(dir,'part-01');
 await fs.writeFile(partA,Buffer.from('ani').toString('base64'));await fs.writeFile(partB,Buffer.from('mated').toString('base64'));
 const messages=[],sock={sendMessage:async(jid,payload)=>messages.push(payload)};
 await sendMenu(sock,{jid:'123@g.us',args:[]},'main',{
  getMedia:()=>null,useDefault:()=>true,defaultParts:[partA,partB],defaultFile:path.join(dir,'missing.jpg')
 });
 assert.equal(messages[0].caption,'main');
 assert.equal(messages[0].video.toString(),'animated');
 assert.equal(messages[0].gifPlayback,true);
 assert.equal(messages[0].mimetype,'video/mp4');
});
