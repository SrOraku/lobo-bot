'use strict';
// Run inference in a child so its model memory is released after each job.
const fs=require('node:fs');
(async()=>{
 const {removeBackground}=require('@imgly/background-removal-node');
 const blob=await removeBackground(new Blob([fs.readFileSync(process.argv[2])],{type:'image/png'}),{model:'small',debug:false,output:{format:'image/png'}});
 fs.writeFileSync(process.argv[3],Buffer.from(await blob.arrayBuffer()));
 process.exit(0);
})().catch(error=>{const missing=error.code==='MODULE_NOT_FOUND';process.stderr.write(missing?'BACKGROUND_DEPENDENCY_MISSING\n':'LOCAL_BACKGROUND_FAILED\n');process.exit(missing?78:1);});
