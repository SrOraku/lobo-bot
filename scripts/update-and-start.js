'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..');
async function checkRelease() {
  const snapshot=await require('../src/updater/source').githubSnapshot();
  let state;
  try {state=JSON.parse(await fs.readFile(path.join(root,'updates/state.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return state?.sha===snapshot.sha ? null : snapshot;
}
async function boot({
  recover=()=>require('../src/updater/recovery').recover(root),
  prepare=()=>{if(!require('../src/bootstrap').ensureDependencies())return false;require('dotenv').config({path:path.join(root,'.env')});return true;},
  check=checkRelease,
  update=snapshot=>new (require('../src/updater/service').UpdateService)({root,snapshot:async()=>snapshot}).update('bot'),
  start=()=>require('../src/updater/supervisor').start(),
  log=console,
  nodeVersion=process.versions.node,
}={}) {
  const [major,minor]=nodeVersion.split('.').map(Number);
  if(!Number.isInteger(major)||major<22||(major===22&&minor<12))throw Error('NODE_INCOMPATIBLE');
  // Recovery must finish before dependency checks or loading the WhatsApp runtime.
  recover();
  if(!await prepare())throw Error('DEPENDENCIES_FAILED');
  let updated=false;
  try {
    log.log('🌹 Verificando atualização do Lobo Bot… 🐺');
    const snapshot=await check();
    if(snapshot){
      const result=await update(snapshot);updated=true;
      if(result?.protectedBackup?.complete===false)log.warn('⚠️ Backup parcial: atalhos externos/quebrados foram registrados sem copiar seus destinos. Preserve o backup dos volumes externos.');
      log.log('✅ Atualização aplicada. Iniciando o bot com a sessão existente.');
    }
    else log.log('✅ Código já atualizado. Iniciando o bot.');
  } catch(error) {
    // These states cannot safely start a second runtime or partially restored code.
    if(['BUSY','STALE_LOCK','ROLLBACK_FAILED','LOCK_INVALID','LOCK_UNSAFE','LOCK_LOST'].includes(error.code))throw error;
    recover();
    log.warn('⚠️ Atualização indisponível. Iniciando a versão local preservada. Consulte updates/last-error.json se existir.');
  }
  await start();
  return {updated,started:true};
}
if(require.main===module)boot().catch(error=>{
  const code=error.code||(/^[A-Z_]+$/.test(error.message)?error.message:'START_UPDATE_FAILED');
  console.error(`❌ Inicialização interrompida (${code}). Verifique o log e a pasta updates; não apague sessões ou banco.`);
  if(code==='BUSY')console.error('⚠️ Outra atualização está ativa. Aguarde sua conclusão e confira se há outra instância usando esta instalação.');
  if(code==='LOCK_INVALID')console.error('⚠️ A trava está incompleta ou corrompida. Preserve updates/ para diagnóstico; não apague backups ou apply-journal.json.');
  process.exitCode=1;
});
module.exports={boot,checkRelease};
