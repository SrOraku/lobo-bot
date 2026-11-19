'use strict';
const {mono,command}=require('../ui/text');
const CHAPTERS={
  entrada:{title:'1 • O vale dos sinais',text:'Um pulso verde desperta as antigas torres. Você precisa chegar ao Farol de Cristal antes da noite.',choices:[['Investigar o bosque','bosque'],['Ajudar a curandeira','curandeira'],['Estudar as ruínas','arquivo']]},
  bosque:{title:'1 • Bosque das cordas',text:'Há fibras resistentes e pegadas perto de uma ponte quebrada.',choices:[['Trançar uma corda','encruzilhada',{item:'corda'}],['Seguir as pegadas','batedor'],['Voltar ao vale','entrada']]},
  curandeira:{title:'1 • O pedido de Ayla',text:'Ayla precisa de ajuda para organizar ervas. Ela conhece os perigos do caminho.',choices:[['Ajudar e levar um unguento','encruzilhada',{item:'unguento',flag:'ajudouAyla'}],['Pedir orientação sem ajudar','encruzilhada'],['Procurar outra trilha','entrada']]},
  arquivo:{title:'1 • Arquivo lunar',text:'Um mapa registra que a porta do Farol responde à luz, e não à força.',choices:[['Levar a inscrição copiada','encruzilhada',{item:'inscricao'}],['Carregar uma pedra brilhante','encruzilhada',{item:'cristal'}],['Retornar ao vale','entrada']]},
  batedor:{title:'2 • O batedor perdido',text:'Um filhote de lobo precisa cruzar um trecho íngreme.',choices:[['Usar sua corda para resgatá-lo','encruzilhada',{requires:'corda',flag:'resgatouFilhote'}],['Buscar ferramentas no bosque','bosque'],['Marcar o caminho e seguir','encruzilhada',{flag:'marcouCaminho'}]]},
  encruzilhada:{title:'2 • Travessia do rio',text:'O caminho direto exige uma corda. A trilha longa passa por névoa cortante.',choices:[['Cruzar pela corda','portal',{requires:'corda',flag:'travessiaSegura'}],['Atravessar a névoa com proteção','portal',{requires:'unguento',flag:'travessiaSegura'}],['Procurar suprimentos no vale','entrada']]},
  portal:{title:'3 • O Farol de Cristal',text:'Uma porta opaca protege o foco do farol. Os sulcos formam uma constelação.',choices:[['Interpretar sua inscrição','foco',{requires:'inscricao',flag:'abriuComConhecimento'}],['Iluminar os sulcos com seu cristal','foco',{requires:'cristal',flag:'abriuComLuz'}],['Voltar ao arquivo','arquivo']]},
  foco:{title:'3 • A escolha da luz',text:'O farol desperta. Você escolhe como usar a energia reunida.',choices:[['Guiar a matilha para um refúgio','final_refugio'],['Restaurar o rio e as plantas','final_floresta'],['Compartilhar o conhecimento','final_alianca']]},
};
const FINALS={
 final_refugio:['Guardião do Vale','Você acendeu uma rota segura e levou a matilha ao refúgio.',true,55],
 final_floresta:['Semente do Amanhã','A água voltou a fluir. O bosque guardará a memória das suas escolhas.',true,55],
 final_alianca:['Vozes do Cristal','Você abriu o arquivo para todos. Uma nova aliança protege o farol.',true,55],
 final_retorno:['Retorno Prudente','A noite chegou. Você preservou a expedição e voltou para se preparar.',false,5],
};
function start(){return {campaign:'cristais',node:'entrada',moves:0,inventory:[],flags:{}};}
function view(state,prefix){const node=CHAPTERS[state.node];return `📖 *${node.title}*\n_${node.text}_\n🎒 *Objetos:* ${state.inventory.join(', ')||'nenhum'}\n${node.choices.map(([label,,effects],i)=>`▸ ${mono(i+1)} ${label}${effects?.requires&&!state.inventory.includes(effects.requires)?' 🔒 requer '+effects.requires:''}`).join('\n')}\n> ${command(prefix+'aventura 1/2/3')}`;}
function advance(original,input){
 const state=structuredClone(original);
 if(!/^[1-3]$/.test(input))throw Error('Escolha uma opção de 1 a 3.');
 const [,destination,effects={}]=CHAPTERS[state.node].choices[Number(input)-1];
 if(effects.requires&&!state.inventory.includes(effects.requires))throw Error('Você precisa de '+effects.requires+' para essa decisão. Volte e explore outras trilhas.');
 if(effects.item&&!state.inventory.includes(effects.item))state.inventory.push(effects.item);
 if(effects.flag)state.flags[effects.flag]=true;
 state.moves++;
 state.node=state.moves>=24&&!FINALS[destination]?'final_retorno':destination;
 if(FINALS[state.node]){const [title,text,won,points]=FINALS[state.node];state.ending=title;return {state,finished:true,won,points,text:`📖 *${title}*\n_${text}_\n*Decisões preservadas:* ${Object.keys(state.flags).length} • *Objetos:* ${state.inventory.length}`};}
 return {state,text:'🐺 Sua decisão abriu uma nova passagem.'};
}
module.exports={CHAPTERS,FINALS,start,view,advance};
