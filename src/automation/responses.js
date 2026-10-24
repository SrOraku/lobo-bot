'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const imported=new WeakSet();
function validate(rule){if(!['contains','starts','ends','exact','regex'].includes(rule.mode)||typeof rule.trigger!=='string'||!rule.trigger.trim()||rule.trigger.length>100||!['text','audio','image','video','sticker'].includes(rule.type))throw Error('Regra de resposta inválida.');if(!Number.isInteger(rule.cooldown)||rule.cooldown<1000||rule.cooldown>86400000||!Number.isFinite(rule.chance)||rule.chance<0||rule.chance>1)throw Error('Cooldown ou chance inválidos.');if(rule.mode==='regex'){if(/[(){}|+*]|\\[1-9]/.test(rule.trigger))throw Error('Regex aceita somente padrões simples, sem grupos, repetições ou referências.');try{new RegExp(rule.trigger,'iu');}catch{throw Error('Regex inválida.');}}if(typeof rule.content!=='string'||!rule.content||rule.content.length>3500)throw Error('Conteúdo inválido.');return rule;}
function match(rule,text){const a=text.toLowerCase(),b=rule.trigger.toLowerCase();return rule.mode==='contains'?a.includes(b):rule.mode==='starts'?a.startsWith(b):rule.mode==='ends'?a.endsWith(b):rule.mode==='exact'?a===b:new RegExp(rule.trigger,'iu').test(text);}
function createResponses(api,{root=path.resolve(__dirname,'../../storage/autorespostas'),random=Math.random,now=Date.now}={}){
 const db=api.db;
 function add(chat,rule){validate(rule);if(rule.type!=='text'&&!/^[a-f0-9-]+\.(mp3|mp4|webp|jpg)$/.test(rule.content))throw Error('Mídia deve ser cadastrada respondendo à mensagem.');return db.prepare('INSERT INTO smart_responses(chat_jid,trigger,mode,response_type,content,cooldown,chance,enabled) VALUES(?,?,?,?,?,?,?,?)').run(chat,rule.trigger,rule.mode,rule.type,rule.content,rule.cooldown,rule.chance,rule.enabled===false?0:1).lastInsertRowid;}
 if(!imported.has(db)){
  const sync=require('node:fs'),file=path.resolve(__dirname,'../../data/autorespostas.json');
  if(sync.existsSync(file)){
   const bytes=sync.readFileSync(file);if(bytes.length>256000)throw Error('Arquivo de autorespostas muito grande.');
   const rules=JSON.parse(bytes.toString()),hash=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
   if(!Array.isArray(rules)||rules.length>100)throw Error('Use uma lista de até 100 autorespostas.');
   if(!db.prepare('SELECT 1 FROM expansion_settings WHERE key=?').get('responses-import:'+hash))db.transaction(()=>{for(const rule of rules){const chat=rule.chat||'*';if(chat!=='*')require('../isolation/context').chatId(chat);add(chat,{cooldown:30000,chance:1,...rule});}db.prepare('INSERT INTO expansion_settings VALUES(?,?)').run('responses-import:'+hash,'true');})();
  }
  imported.add(db);
 }
 async function run(sock,msg,{jid,body}){if(msg.key.fromMe||!body||body.length>2000)return false;const rules=db.prepare('SELECT * FROM smart_responses WHERE chat_jid IN (?,?) AND enabled=1 ORDER BY CASE WHEN chat_jid=? THEN 0 ELSE 1 END,id LIMIT 100').all(jid,'*',jid);
 for(const row of rules){const rule=validate({...row,type:row.response_type});if(!match(rule,body)||random()>=rule.chance)continue;
 const claimed=db.transaction(()=>{const old=db.prepare('SELECT last_at FROM response_cooldowns WHERE chat_jid=? AND rule_id=?').get(jid,row.id);if(old&&now()-old.last_at<rule.cooldown)return false;db.prepare('INSERT INTO response_cooldowns VALUES(?,?,?) ON CONFLICT(chat_jid,rule_id) DO UPDATE SET last_at=excluded.last_at').run(jid,row.id,now());return true;})();if(!claimed)continue;
 let payload;
 try{if(rule.type==='text')payload={text:rule.content};else{const realRoot=await fs.realpath(root),file=await fs.realpath(path.join(root,rule.content));if(!file.startsWith(realRoot+path.sep)||!(await fs.stat(file)).isFile()||(await fs.stat(file)).size>8*1024*1024)throw Error('Mídia automática inválida.');payload={[rule.type]:await fs.readFile(file)};if(rule.type==='audio')Object.assign(payload,{mimetype:'audio/mpeg',ptt:false});}await sock.sendMessage(jid,payload,{quoted:msg});return true;}catch(error){db.prepare('DELETE FROM response_cooldowns WHERE chat_jid=? AND rule_id=? AND last_at=?').run(jid,row.id,now());throw error;}}
 return false;}
 return {add,run,list:chat=>db.prepare('SELECT id,trigger,mode,response_type,enabled,cooldown,chance FROM smart_responses WHERE chat_jid=? ORDER BY id').all(chat),remove:(chat,id)=>db.prepare('DELETE FROM smart_responses WHERE chat_jid=? AND id=?').run(chat,id),toggle:(chat,id,on)=>db.prepare('UPDATE smart_responses SET enabled=? WHERE chat_jid=? AND id=?').run(on?1:0,chat,id),root};
}
module.exports={validate,match,createResponses};
