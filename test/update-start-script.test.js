'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {boot}=require('../scripts/update-and-start');
const logger={log(){},warn(){}};
function options(extra={}) {const calls=[];return {calls,args:{recover:()=>calls.push('recover'),prepare:()=>{calls.push('prepare');return true;},check:async()=>({sha:'test'}),update:async()=>calls.push('update'),start:()=>calls.push('start'),log:logger,nodeVersion:'22.23.3',...extra}};}
test('launcher recovers, prepares, updates and starts supervisor in order',async()=>{const f=options();assert.deepEqual(await boot(f.args),{updated:true,started:true});assert.deepEqual(f.calls,['recover','prepare','update','start']);});
test('up-to-date code does not download again',async()=>{const f=options({check:async()=>null});await boot(f.args);assert.deepEqual(f.calls,['recover','prepare','start']);});
test('network failure starts preserved local version after recovery',async()=>{const f=options({check:async()=>{throw Error('network');}});assert.equal((await boot(f.args)).updated,false);assert.deepEqual(f.calls,['recover','prepare','recover','start']);});
test('unsafe updater state never starts runtime',async()=>{for(const code of ['BUSY','STALE_LOCK','ROLLBACK_FAILED']){const f=options({update:async()=>{throw Object.assign(Error('failed'),{code});}});await assert.rejects(boot(f.args),error=>error.code===code);assert.ok(!f.calls.includes('start'));}});
test('failed recovery, dependencies or incompatible Node prevents startup',async()=>{for(const extra of [{recover:()=>{throw Error('RECOVERY_HASH_MISMATCH');}},{prepare:()=>false},{nodeVersion:'20.0.0'}]){const f=options(extra);await assert.rejects(boot(f.args));assert.ok(!f.calls.includes('start'));}});
