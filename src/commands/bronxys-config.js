'use strict';
const {frameNotice}=require('../menus/render');
const {mono,command}=require('../ui/text');
async function apiBronxys(sock,ctx) {
 const config=require('../config'),reply=text=>sock.sendMessage(ctx.jid,{text:frameNotice('⚙️ API BRONXYS',[text])},{quoted:ctx.msg});
 let owner=false;
 for(const number of require('../utils/owners').ownerNumbers(config))if(await require('./update').verifiedOwner(sock,ctx,number)){owner=true;break;}
 if(!owner)return reply('Somente donos cadastrados podem configurar a API.');
 const keys=require('../integrations/bronxys/key'),args=ctx.args||[],action=String(args[0]||'status').toLowerCase();
 if(action==='status'&&args.length<=1)return reply(`*Chave:* ${keys.getKey()?'configurada':'não configurada'}.\n*Provedor:* api.bronxyshost.com.br\n*Versão instalada:* ${mono(require('../../package.json').version)}\n*Origem:* ${process.env.BRONXYS_API_KEY?.trim()?'variável de ambiente':keys.getKey()?'arquivo privado':'ausente'}\n${keys.getKey()?'O play usará a API Bronxys.':'O play está usando o baixador sem API.'}\nO status local não consulta nem consome a API.\n> Use no privado: ${command(config.get('PREFIX') + 'apibronxys chave SUA_CHAVE')}.`);
 if(action==='testar'&&args.length===1){
  if(!keys.getKey())return reply('A chave não está configurada nesta instalação. Cadastre-a no privado com apibronxys chave SUA_CHAVE.');
  try {
   const data=await require('../integrations/bronxys/client').createClient().json('consultacep',{cep:'01001000'});
   if(!data?.cep)throw Error('BRONXYS_RESPONSE');
   return reply('✅ Chave aceita e API respondeu à consulta de teste. O teste consome uma requisição; a disponibilidade de cada baixador pode variar.');
  } catch(error) {
   const messages={BRONXYS_AUTH:'A API recusou a chave. Confira a validade no painel Bronxys.',BRONXYS_QUOTA:'A API recusou por limite/cota. Confira seu painel.'};
   return reply('⚠️ '+(messages[error.message]||'Não consegui confirmar a API agora. Confira a conexão e tente mais tarde.'));
  }
 }
 if(action==='chave'&&args.length===2){
  if(ctx.jid?.endsWith('@g.us'))return reply('Configure a chave somente no privado do bot.');
  try {keys.setKey(args[1]);return reply('✅ Chave salva de forma privada. O play já usará a API Bronxys, sem precisar reiniciar. Nenhuma chave é exibida nas confirmações.');}
  catch(error){return reply(error.message==='BRONXYS_KEY_STORAGE'?'Não consegui salvar a chave.':error.message);}
 }
 return reply(`> Use ${command(config.get('PREFIX') + 'apibronxys status')} ou, no privado, ${command('apibronxys chave SUA_CHAVE')}.`);
}
apiBronxys.auditFile='src/commands/bronxys-config.js';apiBronxys.auditExport='apiBronxys';
module.exports={apiBronxys};
