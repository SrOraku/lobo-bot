'use strict';
const issueError=message=>Object.assign(Error(message),{code:'WOK_ISSUE_INVALID'});
function applyDonation(game, {actor,target,amount,event,source='doarwok',now=Date.now()}, owners, {prepareTarget}={}) {
  if(typeof actor!=='string'||!/^\d+@s\.whatsapp\.net$/.test(actor)||!owners.includes(actor.split('@')[0])) throw issueError('Somente donos cadastrados podem emitir WoK coin.');
  if(typeof target!=='string'||!/^\d+@s\.whatsapp\.net$/.test(target))throw issueError('Destinatário inválido.');
  if(!Number.isSafeInteger(amount) || amount<1 || amount>1000000) throw issueError('Informe de 1 a 1000000 WoK coin por operação.');
  if(typeof event!=='string' || !event || event.length>200) throw issueError('Identificador da emissão inválido.');
  const key=actor+':'+event;
  if(game.donations?.[key]) {
    const prior=game.donations[key];
    if(prior.target!==target||prior.amount!==amount)throw issueError('Esta mensagem já foi usada para outra emissão.');
    return {...prior,duplicate:true};
  }
  const player=prepareTarget?prepareTarget(game,target,now):game.players[target];
  if(!player || player.banned) throw issueError('O destinatário não possui perfil válido neste chat ou está banido.');
  if(!Number.isSafeInteger(player.coins) || player.coins<0 || !Number.isSafeInteger(player.coins+amount)) throw issueError('O saldo excederia o limite seguro.');
  const record={actor,target,amount,before:player.coins,after:player.coins+amount,at:now,source:source==='addwok'?'addwok':'doarwok'};
  player.coins=record.after;player.updatedAt=now;
  game.donations ||= {};game.donations[key]=record;
  return record;
}
module.exports={applyDonation,issueError};
