'use strict';
const {fork}=require('node:child_process');
const path=require('node:path');
function start({spawn=fork,exit=code=>process.exit(code),ask=question=>require('../utils/terminal-input').localAsk(question),root=path.resolve(__dirname,'../..'),health=require('./health').createHealth(root),schedule=setTimeout,cancel=clearTimeout,now=Date.now,log=(kind,data)=>{try{require('../utils/file-log').record(kind,data);}catch{process.stderr.write('Não foi possível gravar o log do supervisor.\n');}}}={}){
 let child,stopping=false,restart=false,killTimer,relaunchTimer,healthTimer,failures=[];
 function launch(){require('./recovery').recover(root);restart=false;const launched=now();child=spawn(path.join(root,'src/runtime.js'),[],{stdio:['inherit','inherit','inherit','ipc'],env:{...process.env,LOBO_SUPERVISED:'1'}});
 child.on('message',message=>{
  if(!stopping&&message?.type==='lobo:prompt'&&typeof message.id==='string'&&typeof message.question==='string'){const requester=child;Promise.resolve().then(()=>ask(message.question)).then(answer=>{if(requester.connected)requester.send({type:'lobo:prompt-answer',id:message.id,answer});}).catch(()=>process.stderr.write('Erro ao ler o console de pareamento.\n'));return;}
  if(message?.type==='lobo:ready'&&!stopping){if(health.ready()){healthTimer=schedule(()=>{try{health.confirm();}catch(error){log('crash',{code:error.code||error.message});}},health.period);healthTimer?.unref?.();}return;}
  if(stopping||restart||message?.type!=='lobo:restart')return;restart=true;child.kill('SIGTERM');killTimer=schedule(()=>child.kill('SIGKILL'),15000);killTimer?.unref?.();
 });
 child.once('error',error=>{stopping=true;log('crash',{code:error.code||'SPAWN_FAILED'});exit(1);});
 child.once('exit',(code,signal)=>{cancel(killTimer);cancel(healthTimer);if(stopping){exit(Number.isInteger(code)?code:0);return;}if(restart){launch();return;}const trial=health.pending();if(code===0&&!trial){exit(0);return;}
 log('crash',{code,signal,uptime:now()-launched,version:trial?.toVersion});
 let rolledBack=false;try{rolledBack=health.crash();}catch(error){log('crash',{code:error.code||error.message});exit(1);return;}
 failures=failures.filter(time=>now()-time<600000);failures.push(now());if(rolledBack)failures=[];
 if(failures.length>5){log('crash',{code:'RESTART_LIMIT'});exit(1);return;}
 const delay=rolledBack?1000:Math.min(60000,1000*2**Math.max(0,failures.length-1));relaunchTimer=schedule(launch,delay);
 });}
 const stop=()=>{stopping=true;cancel(relaunchTimer);cancel(healthTimer);child?.kill('SIGTERM');};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);launch();return {stop};
}
function canRestart(){return process.env.LOBO_SUPERVISED==='1'&&process.connected&&typeof process.send==='function';}
function requestRestart(){if(!canRestart())return false;process.send({type:'lobo:restart'});return true;}
module.exports={start,canRestart,requestRestart};
