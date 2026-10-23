'use strict';
const {frameNotice}=require('../menus/render');
async function apiBronxys(sock,ctx) {
 const config=require('../config'),reply=text=>sock.sendMessage(ctx.jid,{text:frameNotice('⚙️ API BRONXYS',[text])},{quoted:ctx.msg});
 let owner=false;
 for(const number of require('../utils/owners').ownerNumbers(config))if(await require('./update').verifiedOwner(sock,ctx,number)){owner=true;break;}
 if(!owner)return reply('Somente donos cadastrados podem configurar a API.');
 const keys=require('../integrations/bronxys/key'),args=ctx.args||[],action=String(args[0]||'status').toLowerCase();
 if(action==='status'&&args.length<=1)return reply(`Chave: ${keys.getKey()?'configurada':'não configurada'}.\nProvedor: api.bronxyshost.com.br\nO status local não consulta nem consome a API.\nUse no privado: ${config.get('PREFIX')}apibronxys chave SUA_CHAVE.`);
 if(action==='chave'&&args.length===2){
  if(ctx.jid?.endsWith('@g.us'))return reply('Configure a chave somente no privado do bot.');
  try {keys.setKey(args[1]);return reply('✅ Chave salva de forma privada. Nenhuma chave é exibida nas confirmações.');}
  catch(error){return reply(error.message==='BRONXYS_KEY_STORAGE'?'Não consegui salvar a chave.':error.message);}
 }
 return reply(`Use ${config.get('PREFIX')}apibronxys status ou, no privado, apibronxys chave SUA_CHAVE.`);
}
apiBronxys.auditFile='src/commands/bronxys-config.js';apiBronxys.auditExport='apiBronxys';
module.exports={apiBronxys};
