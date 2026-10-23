'use strict';
function applyDonation(game, {actor,target,amount,event,now=Date.now()}, owners) {
  if(!owners.includes(actor?.split('@')[0])) throw Error('Somente donos cadastrados podem doar WoK coin.');
  if(!Number.isSafeInteger(amount) || amount<1 || amount>1000000) throw Error('Informe de 1 a 1000000 WoK coin por operação.');
  if(typeof event!=='string' || !event || event.length>200) throw Error('Identificador da doação inválido.');
  const key=actor+':'+event;
  if(game.donations?.[key]) return {...game.donations[key],duplicate:true};
  const player=game.players[target];
  if(!player || player.banned) throw Error('O destinatário precisa se registrar com start neste chat e não pode estar banido.');
  if(!Number.isSafeInteger(player.coins) || !Number.isSafeInteger(player.coins+amount)) throw Error('O saldo excederia o limite seguro.');
  const record={actor,target,amount,before:player.coins,after:player.coins+amount,at:now};
  player.coins=record.after;player.updatedAt=now;
  game.donations ||= {};game.donations[key]=record;
  return record;
}
module.exports={applyDonation};
