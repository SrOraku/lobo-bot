'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {KeyedQueue}=require('../src/core/keyed-queue');
test('same chat serializes while another chat runs; failure releases queue',async()=>{
 const queue=new KeyedQueue();let release;const gate=new Promise(r=>release=r),events=[];
 const a=queue.run('a',async()=>{events.push('a1');await gate;throw Error('failed');});
 const b=queue.run('a',async()=>events.push('a2'));await queue.run('b',()=>events.push('b'));
 assert.deepEqual(events,['a1','b']);release();await assert.rejects(a,/failed/);await b;assert.deepEqual(events,['a1','b','a2']);assert.equal(queue.entries.size,0);
});
