'use strict';
function createCommandLimiter({now=Date.now,maxEntries=10000}={}) {
 const buckets=new Map();
 function check({chat,user,command,category,cooldown=0,rateLimit,cost=1}) {
  const timestamp=now();
  for(const [key,row] of buckets) if(row.until<=timestamp)buckets.delete(key);
  const rules=[
   [`chat:${chat}`,60,10000],
   [`cost:${chat}:${user}`,20,60000],
   ...(cooldown>0?[[`cool:${chat}:${user}:${command}`,1,cooldown]]:[]),
   ...(rateLimit?[[`cmd:${chat}:${user}:${command}`,rateLimit.max,rateLimit.window]]:[]),
   ...(cost>=5?[[`heavy:${chat}:${category}`,6,60000]]:[]),
  ];
  const entries=rules.map(([key,max,window])=>{
   if(!Number.isFinite(max)||max<=0||!Number.isFinite(window)||window<=0)throw Error('Configuração de limite inválida.');
   const row=buckets.get(key)||{used:0,until:timestamp+window};return {key,max,row,charge:key.startsWith('cost:')?Math.max(1,cost):1};
  });
  const blocked=entries.find(e=>e.row.used+e.charge>e.max);
  if(blocked)return {allowed:false,remaining:Math.ceil((blocked.row.until-timestamp)/1000)};
  if(buckets.size+entries.filter(e=>!buckets.has(e.key)).length>maxEntries)return {allowed:false,remaining:1};
  for(const e of entries)buckets.set(e.key,{...e.row,used:e.row.used+e.charge});
  return {allowed:true};
 }
 return {check,buckets};
}
module.exports={createCommandLimiter};
