'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {createClient,publicURL,publicAddress}=require('../src/integrations/bronxys/client');
const {createHandler,definitions,safeText}=require('../src/integrations/bronxys/handler');
const lookup=async()=>[{address:'8.8.8.8',family:4}];
test('Bronxys encodes query and key without letting query inject API parameters',async()=>{
 let request;const client=createClient({getKey:()=> 'test-key',lookup,request:async opts=>{request=opts;return {status:200,headers:{},data:{cep:'01001000'}};}});
 await client.json('consultacep',{cep:'12&apikey=other'});const url=new URL(request.url);
 assert.equal(url.origin,'https://api.bronxyshost.com.br');assert.equal(url.searchParams.get('cep'),'12&apikey=other');assert.equal(url.searchParams.get('apikey'),'test-key');assert.equal(request.maxRedirects,0);
});
test('missing key, auth, quotas and transport errors never expose key or request URL',async()=>{
 assert.throws(()=>createClient({getKey:()=>''}).endpoint('play'),/BRONXYS_KEY/);
 for(const status of [401,429]) {const client=createClient({getKey:()=> 'private-fixture',lookup,request:async()=>({status,headers:{},data:{}})});await assert.rejects(client.json('play'),e=>e.message===(status===401?'BRONXYS_AUTH':'BRONXYS_QUOTA'));}
 const client=createClient({getKey:()=> 'private-fixture',lookup,request:async()=>{throw Error('request url contains private-fixture');}});await assert.rejects(client.json('play'),e=>e.message==='BRONXYS_SERVICE');
});
test('SSRF blocks private IPv4 and IPv6 but accepts public API addresses',async()=>{
 for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(address),false,address);
 for(const address of ['172.67.220.69','104.21.67.94','2606:4700:3035::6815:435e'])assert.ok(publicAddress(address),address);
 await assert.rejects(publicURL('http://localhost',async()=>[{address:'127.0.0.1',family:4}]),/BRONXYS_URL/);
 await assert.rejects(publicURL('file:///etc/passwd'),/BRONXYS_URL/);
});
test('redirect is checked and private destination never requested',async()=>{
 let calls=0;const client=createClient({getKey:()=> 'test-key',lookup,request:async()=>{calls++;return {status:302,headers:{location:'http://127.0.0.1/secret'},data:Readable.from([])};}});
 await assert.rejects(client.json('play'),/BRONXYS_URL/);assert.equal(calls,1);
});
test('play delivers an MP3 file instead of just a link and cleans all temporary files',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bronxys-play-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const sent=[];
 const client={configured:()=>true,endpoint:()=> 'https://example.org/media',download:async(url,dest)=>{await fs.writeFile(dest,'audio bytes');return 'audio/mpeg';}};
 const handler=createHandler(definitions.find(d=>d.name==='play'),{client,metadata:async()=>null,tempRoot:directory,convert:(input,out)=>fs.copyFile(input,out)});
 await handler({sendMessage:async(jid,payload)=>sent.push(payload)},{jid:'123@g.us',args:['Nome','da','música'],msg:{}});
 assert.ok(Buffer.isBuffer(sent[0].audio));assert.equal(sent[0].mimetype,'audio/mpeg');assert.ok(sent[0].fileName.endsWith('.mp3'));assert.deepEqual(await fs.readdir(directory),[]);
});
test('CEP uses actual supplied digits and JSON query does not upload WhatsApp content',async()=>{
 let params;const handler=createHandler(definitions.find(d=>d.name==='cep'),{client:{configured:()=>true,json:async(endpoint,value)=>{params=value;return {cep:value.cep};}}});
 const sent=[];await handler({sendMessage:async(jid,value)=>sent.push(value)},{jid:'123@g.us',args:['12345-678'],msg:{}});assert.equal(params.cep,'12345678');assert.ok(sent[0].text.includes('12345678'));
});
test('catalog does not repeat commands; key is redacted from responses',()=>{
 const names=definitions.map(d=>d.name);assert.equal(names.length,new Set(names).size);assert.equal(safeText('https://example.org?apikey=test-key','test-key'),'https://example.org?apikey=[protegido]');
});
test('API wrappers are unwrapped and failed downloads leave no temporary files',async t=>{
 const client=createClient({getKey:()=> 'test-key',lookup,request:async()=>({status:200,headers:{},data:{success:true,data:{cep:'12345678'}}})});
 assert.deepEqual(await client.json('consultacep'),{cep:'12345678'});
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bronxys-fail-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const handler=createHandler(definitions.find(d=>d.name==='play'),{metadata:async()=>null,tempRoot:directory,client:{configured:()=>true,endpoint:()=> 'https://example.org',download:async(url,file)=>{await fs.writeFile(file,'partial');throw Error('private-fixture-url-and-key');}}});
 const sent=[];await handler({sendMessage:async(jid,data)=>sent.push(data)},{jid:'123@g.us',args:['teste'],msg:{}});
 assert.equal(sent[0].text.includes('private-fixture'),false);assert.deepEqual(await fs.readdir(directory),[]);
});
test('API registration keeps existing commands and groups art styles without collisions',()=>{
 const {registerBronxys}=require('../src/integrations/bronxys/register');
 const existing={name:'moeda',handler:()=>{}},registry=new Map([['moeda',existing]]);
 const register=def=>{for(const key of [def.name,...def.aliases||[]]){assert.equal(registry.has(key),false,key);registry.set(key,def);}};
 registerBronxys(register,registry);
 assert.equal(registry.get('moeda'),existing);assert.equal(registry.get('neongreen').name,'logos');assert.equal(registry.get('pergunta').category,'ia');assert.equal(registry.get('apibronxys').minLevel,3);
});
test('API configuration rejects members and group key disclosure; owner confirmation never repeats key',async()=>{
 const vm=require('node:vm'),read=require('node:fs'),module={exports:{}};let writes=0;
 vm.runInNewContext(read.readFileSync(path.join(__dirname,'../src/commands/bronxys-config.js'),'utf8'),{module,process:{env:{}},require:name=>{
  if(name==='../menus/render')return {frameNotice:(title,lines)=>title+'\n'+lines.join('\n')};
  if(name==='../ui/text')return require('../src/ui/text');
  if(name==='../config')return {get:()=> '!'};
  if(name==='../../package.json')return {version:'test-version'};
  if(name==='../integrations/bronxys/client')return {createClient:()=>({json:async()=>({cep:'01001000'})})};
  if(name==='../utils/owners')return {ownerNumbers:()=> ['owner']};
  if(name==='./update')return {verifiedOwner:async(sock,ctx)=>ctx.sender==='trusted'};
  if(name==='../integrations/bronxys/key')return {getKey:()=> 'private-fixture',setKey:()=>writes++};
  throw Error(name);
 }});
 const sent=[],sock={sendMessage:async(jid,data)=>sent.push(data.text)};
 for(const [sender,jid,args]of [['member','1@s.whatsapp.net'],['trusted','123@g.us'],['trusted','1@s.whatsapp.net'],['trusted','1@s.whatsapp.net',['status']],['trusted','1@s.whatsapp.net',['testar']]])await module.exports.apiBronxys(sock,{sender,jid,args:args||['chave','private-fixture'],msg:{}});
 assert.ok(sent.some(text=>text.includes('test-version')));
 assert.ok(sent.some(text=>text.includes('API respondeu')));
 assert.equal(writes,1);assert.ok(sent.every(text=>!text.includes('private-fixture')));
});
test('play sends actual metadata and downloads the exact selected video',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bronxys-info-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const sent=[];let params;
 const info={url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Quintal da Magia',timestamp:'11:25',ago:'há 4 anos',author:{name:'Canal original'},description:'Descrição exata\nSem cortes.'};
 const client={configured:()=>true,endpoint:(endpoint,value)=>{params=value;return 'https://example.org/media';},download:async(url,dest)=>{await fs.writeFile(dest,'audio bytes');return 'audio/mpeg';}};
 await createHandler(definitions.find(d=>d.name==='play'),{client,metadata:async()=>info,tempRoot:directory,convert:(input,out)=>fs.copyFile(input,out)})({sendMessage:async(jid,payload)=>sent.push(payload)},{jid:'123@g.us',args:['cantiga'],msg:{}});
 assert.equal(params.nome_url,info.url);assert.ok(Buffer.isBuffer(sent[0].audio));assert.ok(sent[1].text.includes(info.description));assert.ok(sent[1].text.includes('11:25'));assert.equal(sent[0].fileName,'Quintal da Magia.mp3');
});
