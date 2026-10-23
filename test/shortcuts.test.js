'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveInput,SHORT}=require('../src/commands/shortcuts');
const canonical=new Set([...Object.values(SHORT),'familia','clan','rp','adm']);
const resolve=(command,args=[])=>resolveInput(command,args,name=>canonical.has(name));
test('atalhos e acentos usam comandos existentes sem modificar nomes e argumentos livres',()=>{
  assert.deepEqual(resolve('família',['Alcateia','Criar','Lua','Azul']),{command:'familia',args:['criar','Lua','Azul']});
  assert.deepEqual(resolve('fam',['cr','Família','Rosa']),{command:'familia',args:['criar','Família','Rosa']});
  assert.deepEqual(resolve('alc',['fam','pf']),{command:'alcateia',args:['familia','perfil']});
  assert.deepEqual(resolve('clã',['cr','ÁGUIAS']),{command:'clan',args:['criar','ÁGUIAS']});
  assert.deepEqual(resolve('fam',['saq','100']),{command:'familia',args:['retirar','100']});
  assert.deepEqual(resolve('rp',['ini']),{command:'rp',args:['iniciar']});
});
test('comando/alias real tem prioridade e atalho sem destino não é inventado',()=>{
  assert.deepEqual(resolveInput('fam',['cr'],name=>['fam','familia'].includes(name)),{command:'fam',args:['cr']});
  assert.deepEqual(resolveInput('tr',['1'],()=>false),{command:'tr',args:['1']});
});
test('atalhos administrativos apontam para os mesmos destinos que exigem dono/admin',()=>{
  assert.deepEqual(resolve('ds',['add','5511999999999']),{command:'donos',args:['adicionar','5511999999999']});
  assert.deepEqual(resolve('up',['b']),{command:'atualizar',args:['bot']});
  assert.deepEqual(resolve('adm',['p','lib','@pessoa']),{command:'adm',args:['perm','permitir','@pessoa']});
  for(const [alias,target] of Object.entries(SHORT)) assert.equal(resolve(alias).command,target);
});
