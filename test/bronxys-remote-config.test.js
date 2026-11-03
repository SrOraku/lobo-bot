'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const keys=require('../src/integrations/bronxys/key');

test('remote Bronxys config loads only over HTTPS with Bearer auth and keeps key in memory',async()=>{
 const previous={url:process.env.BRONXYS_CONFIG_URL,token:process.env.BRONXYS_CONFIG_TOKEN,envKey:process.env.BRONXYS_API_KEY};
 try{
  delete process.env.BRONXYS_API_KEY;
  process.env.BRONXYS_CONFIG_URL='https://license.example.test/functions/v1/bronxys-config';
  process.env.BRONXYS_CONFIG_TOKEN='test-install-token';
  let called;
  const result=await keys.refreshRemote({fetchImpl:async(url,options)=>{
   called={url,options};
   return {ok:true,status:200,text:async()=>JSON.stringify({apiKey:'test-bronxys-secret'})};
  }});
  assert.equal(result.loaded,true);
  assert.equal(called.url,process.env.BRONXYS_CONFIG_URL);
  assert.equal(called.options.headers.authorization,'Bearer test-install-token');
  assert.equal(called.options.redirect,'error');
  assert.equal(keys.getKey(),'test-bronxys-secret');
  assert.equal(keys.getOrigin(),'Base44/Supabase');
 }finally{
  if(previous.url===undefined)delete process.env.BRONXYS_CONFIG_URL;else process.env.BRONXYS_CONFIG_URL=previous.url;
  if(previous.token===undefined)delete process.env.BRONXYS_CONFIG_TOKEN;else process.env.BRONXYS_CONFIG_TOKEN=previous.token;
  if(previous.envKey===undefined)delete process.env.BRONXYS_API_KEY;else process.env.BRONXYS_API_KEY=previous.envKey;
 }
});

test('remote Bronxys config refuses non-HTTPS endpoints and incomplete credentials',async()=>{
 const previous={url:process.env.BRONXYS_CONFIG_URL,token:process.env.BRONXYS_CONFIG_TOKEN};
 try{
  process.env.BRONXYS_CONFIG_URL='http://example.test/config';
  process.env.BRONXYS_CONFIG_TOKEN='token';
  assert.equal((await keys.refreshRemote()).error,'REMOTE_CONFIG_HTTPS_REQUIRED');
  process.env.BRONXYS_CONFIG_URL='https://example.test/config';
  delete process.env.BRONXYS_CONFIG_TOKEN;
  assert.equal((await keys.refreshRemote()).error,'REMOTE_CONFIG_INCOMPLETE');
 }finally{
  if(previous.url===undefined)delete process.env.BRONXYS_CONFIG_URL;else process.env.BRONXYS_CONFIG_URL=previous.url;
  if(previous.token===undefined)delete process.env.BRONXYS_CONFIG_TOKEN;else process.env.BRONXYS_CONFIG_TOKEN=previous.token;
 }
});
