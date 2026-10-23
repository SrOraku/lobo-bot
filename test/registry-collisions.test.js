'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function registry() {
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/core/commandRegistry.js'),'utf8'),{module,require:name=>{
  if(name==='./keyed-queue')return require('../src/core/keyed-queue');
  if(name==='../middlewares/command-limits')return require('../src/middlewares/command-limits');
  if(name==='../middlewares/permissions')return {LEVELS:{USER:0}};
  return {};
 }});return module.exports;
}
test('command and alias collisions fail without mutating the registry',()=>{
 const r=registry(),handler=()=>{};r.register({name:'hello',aliases:['hi'],handler});
 assert.throws(()=>r.register({name:'hello',handler:()=>{}}),/Colisão/);
 assert.throws(()=>r.register({name:'other',aliases:['hi'],handler}),/Colisão/);
 assert.equal(r.registry.has('other'),false);assert.equal(r.registry.get('hi').name,'hello');
});
test('explicit legacy adapter replacement preserves existing alias routing',()=>{
 const r=registry();r.register({name:'hello',aliases:['hi'],handler:()=>{}});
 const handler=()=>{};r.register({name:'hello',aliases:['hi'],replace:true,handler});assert.equal(r.registry.get('hi').handler,handler);
});
