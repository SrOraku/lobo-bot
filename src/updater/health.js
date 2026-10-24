'use strict';
const fs=require('node:fs'),path=require('node:path');
const {write,target,recover}=require('./recovery');
function read(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
function createHealth(root,{now=Date.now,period=180000,maxCrashes=3}={}){
 const pendingFile=path.join(root,'updates/pending-release.json');
 function pending(){return read(pendingFile);}
 function rollback(reason='startup_crash'){
  const state=pending();if(!state)return false;
  const lease=require('./lock').acquireLock(root,{action:'rollback'});
  try {
  if(!/^backup-[\w-]+$/.test(state.backup||''))throw Error('HEALTH_INVALID_BACKUP');
  const record=read(target(root,`updates/${state.backup}/release.json`));if(!record||!Array.isArray(record.saved))throw Error('HEALTH_INVALID_BACKUP');
  const badFile=path.join(root,'updates/bad-releases.json'),bad=read(badFile,[]);
  write(path.join(root,'updates/apply-journal.json'),JSON.stringify(record));recover(root,{lease});
  write(badFile,JSON.stringify([...bad,{sha:state.sha,version:state.toVersion,reason,at:now()}].slice(-20)));
  write(path.join(root,'updates/rollback.json'),JSON.stringify({...state,reason,at:now()}));
  fs.rmSync(pendingFile,{force:true});return true;
  } finally {lease.release();}
 }
 return {pending,rollback,
  ready(){const state=pending();if(state){state.readyAt=now();write(pendingFile,JSON.stringify(state));}return !!state;},
  confirm(){const state=pending();if(!state?.readyAt||now()-state.readyAt<period)return false;fs.rmSync(pendingFile,{force:true});
      const directory=path.join(root,'updates');
      fs.rmSync(target(root,`updates/${state.backup}/node_modules`),{recursive:true,force:true});
      const backups=fs.readdirSync(directory).filter(name=>/^backup-[\w-]+$/.test(name)).map(name=>({name,at:fs.statSync(target(root,'updates/'+name)).mtimeMs})).sort((a,b)=>b.at-a.at);
      for(const old of backups.slice(5))if(old.name!==state.backup)fs.rmSync(target(root,'updates/'+old.name),{recursive:true,force:true});
      write(path.join(root,'updates/health.json'),JSON.stringify({...state,confirmed:true,confirmedAt:now()}));return true;},
  crash(){const state=pending();if(!state)return false;state.crashCount=(state.crashCount||0)+1;delete state.readyAt;write(pendingFile,JSON.stringify(state));return state.crashCount>=maxCrashes?rollback():false;},
  period,
 };
}
module.exports={createHealth};
