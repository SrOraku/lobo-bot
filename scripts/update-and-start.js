'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..');
async function checkRelease({releaseRoot=root,snapshotSource=()=>require('../src/updater/source').githubSnapshot()}={}) {
  const snapshot=await snapshotSource();
  let state;
  try {state=JSON.parse(await fs.readFile(path.join(releaseRoot,'updates/state.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return state?.sha===snapshot.sha ? null : snapshot;
}
// Motivo curto mostrado no console quando a atualização não acontece.
function failureCode(error) {
  const code = String(error?.code || '');
  if (/^[A-Z][A-Z0-9_]{1,48}$/.test(code)) return code;
  const status = error?.response?.status;
  return Number.isInteger(status) ? `HTTP_${status}` : 'UPDATE_CHECK_FAILED';
}
function failureHint(error, code) {
  if (code === 'GITHUB_RATE_LIMIT') {
    const at = Number.isFinite(error?.resetAt) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(error.resetAt) : null;
    return ` O GitHub limitou as consultas deste servidor${at ? ` até ${at} (Brasília)` : ''}; a próxima inicialização tenta de novo.`;
  }
  if (['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ERR_NETWORK'].includes(code)) return ' Sem conexão com o GitHub.';
  return '';
}
async function boot({
  recover=()=>require('../src/updater/recovery').recover(root),
  prepare=()=>{if(!require('../src/bootstrap').ensureDependencies())return false;require('dotenv').config({path:path.join(root,'.env')});return true;},
  check=checkRelease,
  update=snapshot=>new (require('../src/updater/service').UpdateService)({root,snapshot:async()=>snapshot}).update('bot'),
  // Mesma inicialização do npm start: licença, cadastro do dono (data/bot-owner.json) e supervisor.
  start=()=>require('../src/startup').launch(),
  log=console,
  nodeVersion=process.versions.node,
}={}) {
  const [major,minor]=nodeVersion.split('.').map(Number);
  if(!Number.isInteger(major)||major<22||(major===22&&minor<12))throw Error('NODE_INCOMPATIBLE');
  // Recovery must finish before dependency checks or loading the WhatsApp runtime.
  recover();
  if(!await prepare())throw Error('DEPENDENCIES_FAILED');
  let updated=false,phase='check';
  try {
    log.log('🌹 Verificando atualização do Lobo Bot… 🐺');
    const snapshot=await check();
    if(snapshot){
      phase='update';
      const result=await update(snapshot);updated=true;
      if(result?.protectedBackup?.complete===false)log.warn('⚠️ Backup parcial: atalhos externos/quebrados foram registrados sem copiar seus destinos. Preserve o backup dos volumes externos.');
      log.log('✅ Atualização aplicada. Iniciando o bot com a sessão existente.');
    }
    else log.log('✅ Código já atualizado. Iniciando o bot.');
  } catch(error) {
    // These states cannot safely start a second runtime or partially restored code.
    if(['BUSY','STALE_LOCK','ROLLBACK_FAILED','LOCK_INVALID','LOCK_UNSAFE','LOCK_LOST'].includes(error.code))throw error;
    recover();
    const code=failureCode(error);
    // Só a aplicação da atualização grava updates/last-error.json; a verificação não grava nada.
    log.warn(`⚠️ Atualização indisponível (${code}).${failureHint(error,code)} Iniciando a versão local preservada.${phase==='update'?' Detalhes em updates/last-error.json.':''}`);
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
module.exports={boot,checkRelease,failureCode};
