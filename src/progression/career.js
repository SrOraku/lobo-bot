'use strict';
const TIERS=[['Estagiário',0,1,0],['Assistente',3,2,5],['Júnior',7,3,10],['Pleno',14,5,20],['Sênior',25,8,35],['Especialista',40,12,50],['Gerente',60,18,75],['Diretor',90,25,100],['CEO',150,40,150]].map(([name,days,level,bonus])=>({name,days,level,bonus}));
function current(career={},level=1){return TIERS.filter(t=>(career.days||0)>=t.days&&level>=t.level).at(-1)||TIERS[0];}
function record(rp,now,day,base){const c=rp.career||{days:0,streak:0,total:0,lastDay:null,shifts:0};if(c.lastDay!==day){c.streak=c.lastDay&&Date.parse(day)-Date.parse(c.lastDay)===86400000?c.streak+1:1;c.days++;c.lastDay=day;}c.shifts++;const tier=current(c,1+Math.floor(Math.sqrt(rp.experience||0)/10));const bonus=tier.bonus+Math.min(50,Math.max(0,c.streak-1)*2);const paid=base+bonus;c.total+=paid;if(!Number.isSafeInteger(c.total))throw Error('Salário excedeu o limite.');rp.career=c;return {paid,tier,bonus,career:c};}
module.exports={TIERS,current,record};
