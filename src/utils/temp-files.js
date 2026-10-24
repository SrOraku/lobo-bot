'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function cleanup({root=os.tmpdir(),now=Date.now(),maxAge=86400000}={}){let count=0;for(const entry of await fs.readdir(root,{withFileTypes:true})){if(!entry.isDirectory()||!/^lobo-(?:media|bronxys)-[a-zA-Z0-9]+$/.test(entry.name))continue;const file=path.join(root,entry.name),stat=await fs.lstat(file);if(stat.isSymbolicLink()||now-stat.mtimeMs<maxAge)continue;await fs.rm(file,{recursive:true,force:true});count++;}return count;}
let timer;function start(){if(timer)return;const run=()=>cleanup().catch(error=>require('../config/logger').logger.error({code:error.code||'TEMP_CLEANUP'},'Falha na limpeza de temporários.'));run();timer=setInterval(run,3600000);timer.unref();}
module.exports={cleanup,start};
