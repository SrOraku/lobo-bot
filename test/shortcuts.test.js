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
test('prefixos automáticos são inequívocos e não substituem comandos registrados',()=>{
  const {availableShortcuts}=require('../src/commands/shortcuts');
  const names=['investigar','inventar','recompensa','abc'];
  const exists=name=>names.includes(name);
  const routes=availableShortcuts(exists,names);
  assert.equal(routes.has('inv'),false);
  assert.equal(routes.get('rec'),'recompensa');
  assert.deepEqual(resolveInput('rec',['Texto','Árvore'],exists,names),{command:'recompensa',args:['Texto','Árvore']});
  assert.equal(availableShortcuts(name=>exists(name)||name==='rec',names).has('rec'),false);
});
test('argumentos livres e comandos completos são preservados',()=>{
  assert.deepEqual(resolve('adm',['n','Árvore','DA','Lua']),{command:'adm',args:['nome','Árvore','DA','Lua']});
  assert.deepEqual(resolve('rp',['Um','Nome']),{command:'rp',args:['Um','Nome']});
  assert.deepEqual(resolve('play',['AC/DC','Thunderstruck']),{command:'play',args:['AC/DC','Thunderstruck']});
  assert.deepEqual(resolve('família',['criar','Lua','Azul']),{command:'familia',args:['criar','Lua','Azul']});
});
test('atalhos de operações e recursos convergem para os comandos originais',()=>{
  assert.deepEqual(resolve('ati',['diag']),{command:'ativacoes',args:['diagnostico']});
  assert.deepEqual(resolve('ativ',['al']),{command:'ativar',args:['antilink']});
  assert.deepEqual(resolve('des',['alg']),{command:'desativar',args:['antilinkgrupo']});
  assert.deepEqual(resolve('alc',['admin','bk']),{command:'alcateia',args:['admin','backup']});
});
