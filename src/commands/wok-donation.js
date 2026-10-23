'use strict';
async function donate(sock,ctx) {
  const {frameNotice}=require('../menus/render');
  const reply=text=>sock.sendMessage(ctx.jid,{text:frameNotice('💰 DOAÇÃO DE WOK COIN',[text])},{quoted:ctx.msg});
  const actor=await require('../activations/access').resolveActor(sock,ctx);
  if(!actor.owner) return reply('Somente donos cadastrados podem emitir doações.');
  const mentions=require('../activations/message-rules').inspect(ctx.msg.message).mentions;
  const amountText=ctx.args.filter(s=>!s.startsWith('@'));
  if(mentions.length!==1 || amountText.length!==1 || !/^\d+$/.test(amountText[0])) return reply('Use doarwok @participante quantidade. A moeda é virtual; não há pagamento externo.');
  const {IdentityResolver}=await import('../../addons/alcateia/src/identity.js');
  const target=await new IdentityResolver(sock,'',ctx.isGroup?await sock.groupMetadata(ctx.jid):null).member(mentions[0]);
  if(!target?.phoneNumber) return reply('Não foi possível confirmar o número do destinatário.');
  try {
    const result=await require('../../plugins/alcateia-rp').donateWok({chat:ctx.jid,actor:actor.phone,target:target.phoneNumber,amount:Number(amountText[0]),event:ctx.msg.key.id});
    return reply(`${result.duplicate?'ℹ️ Doação já processada':'✅ Doação concluída'}\n💰 ${result.amount} WOK Coin\nCarteira após essa operação: ${result.after}\n_A doação vale somente para a economia deste chat._`);
  } catch(error) {return reply(error.message);}
}
module.exports={donate};
