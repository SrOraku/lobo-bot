'use strict';
const fs=require('node:fs');
const path=require('node:path');
const filename=path.join(__dirname,'../../../data/bronxys-api-key');
let remoteKey='';
let remoteLoadedAt=0;
function getKey() {
  if(remoteKey)return remoteKey;
  if(process.env.BRONXYS_API_KEY?.trim()) return process.env.BRONXYS_API_KEY.trim();
  try {if(fs.lstatSync(filename).isSymbolicLink())return '';return fs.readFileSync(filename,'utf8').trim();}
  catch(error){if(error.code==='ENOENT')return '';throw Error('BRONXYS_KEY_STORAGE');}
}
function getOrigin() {
  if(remoteKey)return 'Base44/Supabase';
  if(process.env.BRONXYS_API_KEY?.trim())return 'variável de ambiente';
  try {if(fs.lstatSync(filename).isSymbolicLink())return 'ausente';return fs.readFileSync(filename,'utf8').trim()?'arquivo privado':'ausente';}
  catch{return 'ausente';}
}
async function refreshRemote({fetchImpl=global.fetch}={}) {
  const endpoint=String(process.env.BRONXYS_CONFIG_URL||'').trim();
  const token=String(process.env.BRONXYS_CONFIG_TOKEN||'').trim();
  if(!endpoint&&!token)return {configured:false,loaded:false};
  if(!endpoint||!token)return {configured:true,loaded:false,error:'REMOTE_CONFIG_INCOMPLETE'};
  let url;
  try{url=new URL(endpoint);}catch{return {configured:true,loaded:false,error:'REMOTE_CONFIG_URL_INVALID'};}
  if(url.protocol!=='https:')return {configured:true,loaded:false,error:'REMOTE_CONFIG_HTTPS_REQUIRED'};
  try{
    const response=await fetchImpl(url.href,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!response.ok)return {configured:true,loaded:false,error:'REMOTE_CONFIG_HTTP'};
    const body=await response.text();
    if(body.length>8192)return {configured:true,loaded:false,error:'REMOTE_CONFIG_SIZE'};
    const data=JSON.parse(body);
    const value=typeof data.apiKey==='string'?data.apiKey.trim():'';
    if(!value||value.length>256||/[\\s\\x00-\\x1f]/.test(value))return {configured:true,loaded:false,error:'REMOTE_CONFIG_RESPONSE'};
    remoteKey=value;remoteLoadedAt=Date.now();
    return {configured:true,loaded:true,loadedAt:remoteLoadedAt};
  }catch{return {configured:true,loaded:false,error:'REMOTE_CONFIG_UNAVAILABLE'};}
}
function setKey(value) {
  if(process.env.BRONXYS_API_KEY) throw Error('A chave está definida em BRONXYS_API_KEY. Altere essa variável na configuração do servidor.');
  if(typeof value!=='string'||!value.trim()||value.length>256||/[\\s\\x00-\\x1f]/.test(value))throw Error('Formato de chave inválido.');
  fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  if(fs.lstatSync(path.dirname(filename)).isSymbolicLink())throw Error('Diretório de chaves inválido.');
  const temporary=filename+'.'+require('node:crypto').randomUUID()+'.tmp';
  try {fs.writeFileSync(temporary,value.trim(),{flag:'wx',mode:0o600});fs.renameSync(temporary,filename);}
  finally{fs.rmSync(temporary,{force:true});}
}
module.exports={getKey,setKey,getOrigin,refreshRemote};
