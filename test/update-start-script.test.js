'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {boot}=require('../scripts/update-and-start');
const logger={log(){},warn(){}};
function options(extra={}) {const calls=[];return {calls,args:{recover:()=>calls.push('recover'),prepare:()=>{calls.push('prepare');return true;},check:async()=>({sha:'test'}),update:async()=>calls.push('update'),start:()=>calls.push('start'),log:logger,nodeVersion:'22.23.3',...extra}};}
test('launcher recovers, prepares, updates and starts supervisor in order',async()=>{const f=options();assert.deepEqual(await boot(f.args),{updated:true,started:true});assert.deepEqual(f.calls,['recover','prepare','update','start']);});
test('up-to-date code does not download again',async()=>{const f=options({check:async()=>null});await boot(f.args);assert.deepEqual(f.calls,['recover','prepare','start']);});
test('network failure starts preserved local version after recovery',async()=>{const f=options({check:async()=>{throw Error('network');}});assert.equal((await boot(f.args)).updated,false);assert.deepEqual(f.calls,['recover','prepare','recover','start']);});
test('unsafe updater state never starts runtime',async()=>{for(const code of ['BUSY','STALE_LOCK','ROLLBACK_FAILED','LOCK_INVALID','LOCK_UNSAFE','LOCK_LOST']){const f=options({update:async()=>{throw Object.assign(Error('failed'),{code});}});await assert.rejects(boot(f.args),error=>error.code===code);assert.ok(!f.calls.includes('start'));}});

test('launcher automatically recovers an abandoned lock even when GitHub is unavailable', async t => {
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-launch-stale-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'updates'));fs.mkdirSync(path.join(root,'sessions'));fs.mkdirSync(path.join(root,'data'));
 fs.writeFileSync(path.join(root,'sessions/creds.json'),'private-session');fs.writeFileSync(path.join(root,'data/lobo.db'),'private-db');
 const child=require('node:child_process').spawnSync(process.execPath,['-e','']);assert.equal(child.status,0);
 fs.writeFileSync(path.join(root,'updates/update.lock'),JSON.stringify({pid:child.pid,at:1}));
 const f=options({recover:()=>require('../src/updater/recovery').recover(root),check:async()=>{throw Error('offline');}});
 assert.deepEqual(await boot(f.args),{updated:false,started:true});assert.ok(f.calls.includes('start'));
 assert.equal(fs.readFileSync(path.join(root,'sessions/creds.json'),'utf8'),'private-session');
 assert.equal(fs.readFileSync(path.join(root,'data/lobo.db'),'utf8'),'private-db');
 assert.equal(fs.existsSync(path.join(root,'updates/update.lock')),false);
});
test('failed recovery, dependencies or incompatible Node prevents startup',async()=>{for(const extra of [{recover:()=>{throw Error('RECOVERY_HASH_MISMATCH');}},{prepare:()=>false},{nodeVersion:'20.0.0'}]){const f=options(extra);await assert.rejects(boot(f.args));assert.ok(!f.calls.includes('start'));}});
test('partial protected backup is reported before starting preserved session',async()=>{
 const warnings=[];const f=options({update:async()=>({protectedBackup:{complete:false,links:1}}),log:{log(){},warn:message=>warnings.push(message)}});
 assert.equal((await boot(f.args)).updated,true);assert.ok(f.calls.includes('start'));
 assert.equal(warnings.length,1);assert.match(warnings[0],/Backup parcial/);
});

for (const sameCommit of [false, true]) test(`fixed version startup ${sameCommit ? 'skips identical commit' : 'detects new commit with the same version'}`, async t => {
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const releaseRoot=await fs.mkdtemp(path.join(os.tmpdir(),'lobo-fixed-version-'));
 t.after(()=>fs.rm(releaseRoot,{recursive:true,force:true}));
 await fs.mkdir(path.join(releaseRoot,'updates'));
 const available={sha:'a'.repeat(40),version:'1.0.0',files:[]};
 await fs.writeFile(path.join(releaseRoot,'package.json'),JSON.stringify({version:'1.0.0'}));
 await fs.writeFile(path.join(releaseRoot,'updates/state.json'),JSON.stringify({version:'1.0.0',sha:sameCommit?available.sha:'b'.repeat(40)}));
 const snapshot=await require('../scripts/update-and-start').checkRelease({releaseRoot,snapshotSource:async()=>available});
 assert.equal(snapshot,sameCommit?null:available);
});
