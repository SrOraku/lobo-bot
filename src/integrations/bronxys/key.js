'use strict';
const fs=require('node:fs');
const path=require('node:path');
const filename=path.join(__dirname,'../../../data/bronxys-api-key');
function getKey() {
  if(process.env.BRONXYS_API_KEY?.trim()) return process.env.BRONXYS_API_KEY.trim();
  try {if(fs.lstatSync(filename).isSymbolicLink())return '';return fs.readFileSync(filename,'utf8').trim();}
  catch(error){if(error.code==='ENOENT')return '';throw Error('BRONXYS_KEY_STORAGE');}
}
function setKey(value) {
  if(process.env.BRONXYS_API_KEY) throw Error('A chave está definida em BRONXYS_API_KEY. Altere essa variável na configuração do servidor.');
  if(typeof value!=='string'||!value.trim()||value.length>256||/[\s\x00-\x1f]/.test(value))throw Error('Formato de chave inválido.');
  fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  if(fs.lstatSync(path.dirname(filename)).isSymbolicLink())throw Error('Diretório de chaves inválido.');
  const temporary=filename+'.'+require('node:crypto').randomUUID()+'.tmp';
  try {fs.writeFileSync(temporary,value.trim(),{flag:'wx',mode:0o600});fs.renameSync(temporary,filename);}
  finally{fs.rmSync(temporary,{force:true});}
}
module.exports={getKey,setKey};
