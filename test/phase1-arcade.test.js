'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Database=require('better-sqlite3');
const {runMigrations}=require('../src/config/migrations');
const engine=require('../src/games/engine');
const {WORDS,WORD_THEMES,ROUTES,ENDINGS}=require('../src/games/content');
const {CHARACTERS,QUESTIONS,nextQuestion}=require('../src/games/characters');
const {createArcade}=require('../src/games/service');
const {createHistory}=require('../src/games/history');
const {createCoopForca}=require('../src/games/forca-coop');
const {createExpandedArcade,register}=require('../src/commands/arcade-expanded');
const CHAT='123@g.us',OTHER='456@g.us',A='5511999999999@s.whatsapp.net',B='5511888888888@s.whatsapp.net',C='5511777777777@s.whatsapp.net';
function database(t,file=':memory:'){const db=new Database(file);runMigrations(db);t.after(()=>{if(db.open)db.close();});return db;}

test('forca themes and difficulties use appended words while old word indexes stay valid',()=>{
 assert.ok(WORDS.length>=56);assert.equal(WORDS[0][0],'alcateia');assert.equal(WORDS[15][0],'nascente');
 for(const [theme,pool]of Object.entries(WORD_THEMES)){
  assert.ok(pool.length>0);
  for(const difficulty of ['facil','normal','dificil']){
   const s=engine.start('forca',()=>0,engine.startOptions('forca','iniciar '+theme+' '+difficulty));
   assert.ok(pool.includes(s.word));assert.equal(s.theme,theme);assert.equal(s.maxMistakes,{facil:8,normal:6,dificil:4}[difficulty]);
  }
 }
 for(const input of ['iniciar constructor','iniciar __proto__','iniciar ciencia impossivel'])assert.throws(()=>engine.startOptions('forca',input),/inválid/);
 assert.throws(()=>engine.start('forca',()=>0,{theme:'constructor'}),/inválid/);
 let old={word:2,letters:[],mistakes:0};
 for(const letter of 'uivo')old=engine.advance('forca',old,letter).state;
 assert.deepEqual(old.letters,['u','i','v','o']);
});

test('forca hint is earned by two misses, can be used once and lowers the final reward',()=>{
 let s=engine.start('forca',()=>0),r;
 assert.throws(()=>engine.advance('forca',s,'pista'),/dois erros/);
 for(const letter of ['b','d'])s=engine.advance('forca',s,letter).state;
 s=engine.advance('forca',s,'pista').state;
 assert.equal(s.pistasUsed,1);assert.equal(s.letters.includes('a'),true);
 assert.throws(()=>engine.advance('forca',s,'pista'),/uma vez/);
 for(const letter of new Set(WORDS[s.word][0]))if(!s.letters.includes(letter)){r=engine.advance('forca',s,letter);s=r.state;}
 assert.equal(r.finished,true);assert.equal(r.points,20);
});

test('offline Akinator catalogue has unique hypotheses and chooses a balanced first question',()=>{
 assert.ok(CHARACTERS.length>=56);assert.equal(CHARACTERS[0][0],'Naruto Uzumaki');
 assert.equal(new Set(CHARACTERS.map(([,traits])=>[...traits].sort().join('|'))).size,CHARACTERS.length);
 const initial=engine.start('akinator'),first=nextQuestion(initial),yes=initial.candidates.filter(i=>CHARACTERS[i][1].includes(QUESTIONS[first][0])).length;
 const best=Math.min(...QUESTIONS.map(([trait])=>Math.abs(CHARACTERS.length-2*CHARACTERS.filter(([,traits])=>traits.includes(trait)).length)));
 assert.equal(Math.abs(CHARACTERS.length-2*yes),best);
 for(let target=0;target<CHARACTERS.length;target++){
  let s=engine.start('akinator'),steps=0;
  while(s.candidates.length>1&&nextQuestion(s)!==-1){const q=nextQuestion(s);s=engine.advance('akinator',s,CHARACTERS[target][1].includes(QUESTIONS[q][0])?'sim':'nao').state;assert.ok(++steps<QUESTIONS.length);}
  assert.deepEqual(s.candidates,[target],CHARACTERS[target][0]);
 }
});

test('crystal adventure uses persistent objects and preserves all original routes and endings',()=>{
 assert.equal(Object.keys(ENDINGS).length,8);assert.deepEqual(ROUTES.inicio[2],['floresta','montanha','rio']);
 let s=engine.start('aventura',undefined,{campaign:'cristais'}),r;
 s=engine.advance('aventura',s,'2').state;s=engine.advance('aventura',s,'2').state;
 const before=structuredClone(s);assert.throws(()=>engine.advance('aventura',s,'1'),/corda/);assert.deepEqual(s,before);
 // Return, gather rope and inscription, then choose the knowledge ending.
 for(const choice of ['3','1','1','3','3','1','1','1','3']){
  r=engine.advance('aventura',s,choice);s=JSON.parse(JSON.stringify(r.state));
 }
 assert.equal(r.finished,true);assert.equal(r.won,true);assert.equal(s.ending,'Vozes do Cristal');
 assert.ok(s.inventory.includes('corda'));assert.ok(s.inventory.includes('inscricao'));assert.equal(s.flags.abriuComConhecimento,true);
 assert.equal(r.points,55);
});

test('memory, mathematics and anagram difficulties change actual boards, expressions and words',()=>{
 const memory=engine.start('memoria',()=>0,{difficulty:'dificil'});assert.equal(memory.cards.length,12);
 let m=memory,r;for(const symbol of new Set(m.cards)){const ids=m.cards.flatMap((value,i)=>value===symbol?[i+1]:[]);r=engine.advance('memoria',m,ids.join(' '));m=r.state;}
 assert.equal(r.points,60);assert.equal(r.won,true);
 let math=engine.start('matematica',()=>2,{difficulty:'dificil'});
 for(let i=0;i<5;i++){const answer=math.op==='×'?math.a*math.b:math.a-math.b;r=engine.advance('matematica',math,String(answer));math=r.state;}
 assert.equal(r.points,60);assert.equal(r.finished,true);
 const easy=engine.start('anagrama',()=>0,{difficulty:'facil'}),hard=engine.start('anagrama',()=>0,{difficulty:'dificil'});
 assert.ok(easy.word.length<=5);assert.ok(hard.word.length>=10);assert.notEqual(hard.word,hard.scrambled);
 assert.throws(()=>engine.advance('anagrama',hard,'x'),/letras/);
});

test('reaction and typing use the provided clock, enforce difficulty windows and expose measured times',()=>{
 let time=1000;const now=()=>time;
 const reaction=engine.start('reacao',()=>0,{difficulty:'dificil',now});
 time=reaction.ready+1500;let r=engine.advance('reacao',reaction,'ja',{now});assert.equal(r.won,true);assert.equal(r.state.reactionMs,1500);
 time++;assert.equal(engine.advance('reacao',reaction,'ja',{now}).won,false);
 const typing=engine.start('digitacao',()=>0,{difficulty:'dificil',now});time+=45001;
 assert.equal(engine.advance('digitacao',typing,typing.text,{now}).won,false);
});

test('finished games preserve history and records after SQLite closes and reject old duplicate events permanently',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lobo-arcade-phase1-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'games.sqlite');let db=database(t,file),time=Date.parse('2026-11-18T15:00:00Z');
 let game=createArcade(db,{now:()=>time,pick:()=>0});
 game.play(CHAT,A,'Lobo','adivinhar','','start','!');time+=1000;game.play(CHAT,A,'Lobo','adivinhar','1','finish','!');
 game.play(OTHER,A,'Outro','adivinhar','','other-start','!');
 assert.equal(createHistory(db).list(CHAT,A).total,1);assert.equal(createHistory(db).list(OTHER,A).total,0);
 db.close();db=database(t,file);game=createArcade(db,{now:()=>time,pick:()=>0});
 assert.equal(createHistory(db).records(CHAT,A)[0].best_points,37);
 time+=8*86400000;assert.equal(game.play(CHAT,A,'Lobo','adivinhar','1','finish','!'),null);
 assert.equal(game.profile(CHAT,A).points,37);assert.equal(createHistory(db).list(CHAT,A).total,1);
 // Legacy sessions expire after one day. Replaying a completed message must
 // neither revive an expired game nor change another chat's saved state.
 const other=db.prepare('SELECT state FROM arcade_sessions WHERE chat_jid=? AND user_jid=?').get(OTHER,A).state;
 assert.equal(JSON.parse(other).attempts,0);
 assert.throws(()=>game.play(OTHER,A,'Outro','adivinhar','status','other-status','!'),/Inicie com/);
 assert.equal(db.prepare('SELECT state FROM arcade_sessions WHERE chat_jid=? AND user_jid=?').get(OTHER,A).state,other);
});

test('history failure rolls back game completion, score and mission progress as one transaction',t=>{
 const db=database(t),g=createArcade(db,{now:()=>1000,pick:()=>0});
 g.play(CHAT,A,'Lobo','adivinhar','','start','!');
 const before=db.prepare('SELECT state FROM arcade_sessions WHERE chat_jid=? AND user_jid=?').get(CHAT,A).state;
 db.exec("CREATE TRIGGER phase1_history_fail BEFORE INSERT ON phase1_arcade_results BEGIN SELECT RAISE(ABORT,'history failed'); END");
 assert.throws(()=>g.play(CHAT,A,'Lobo','adivinhar','1','win','!'),/history failed/);
 assert.equal(g.profile(CHAT,A),undefined);assert.equal(db.prepare('SELECT state FROM arcade_sessions WHERE chat_jid=? AND user_jid=?').get(CHAT,A).state,before);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM mission_events').get().n,0);
 db.exec('DROP TRIGGER phase1_history_fail');g.play(CHAT,A,'Lobo','adivinhar','1','win','!');
 assert.equal(g.profile(CHAT,A).points,37);assert.equal(createHistory(db).list(CHAT,A).total,1);
});

test('unconfirmed LID cannot create results and a confirmed alias continues its unfinished legacy session',t=>{
 const db=database(t),lid='123456789012345@lid',g=createArcade(db,{now:()=>1000,pick:()=>0});
 assert.throws(()=>g.play(CHAT,lid,'Lobo','adivinhar','','bad','!'),/confirmar/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM arcade_sessions').get().n,0);
 db.prepare('INSERT INTO universal_wallet_aliases VALUES(?,?,?)').run(CHAT,lid,A);
 db.prepare('INSERT INTO arcade_sessions VALUES(?,?,?,?,?,?)').run(CHAT,lid,'adivinhar',JSON.stringify({secret:9,attempts:0,low:1,high:100}),1000,0);
 g.play(CHAT,lid,'Lobo','adivinhar','9','legacy-finish','!');
 assert.equal(createHistory(db).list(CHAT,A).total,1);assert.equal(g.profile(CHAT,A).points,37);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM arcade_sessions WHERE user_jid=?').get(lid).n,0);
});

test('cooperative forca requires voluntary entry, persists progress and only rewards actual contributors once',t=>{
 const db=database(t);let time=1000,id=0,coop=createCoopForca(db,{now:()=>time,pick:()=>0});
 const play=(user,args,event=String(++id),chat=CHAT)=>coop.play({chat,user,name:user===A?'Alfa':'Companheiro',args,event,prefix:'!'});
 play(A,['iniciar','matilha','normal']);
 assert.throws(()=>play(B,['a']),/voluntariamente/);play(B,['entrar']);play(C,['entrar']);
 play(A,['a']);time+=2100;coop=createCoopForca(db,{now:()=>time,pick:()=>0});
 const letters=[...new Set(WORDS[coop.read(CHAT).state.game.word][0])].filter(c=>c!=='a');
 let final;for(const letter of letters){time+=2100;final=play(B,[letter],'letter-'+letter);}
 assert.match(final,/20 pontos/);assert.equal(coop.read(CHAT).state,null);
 const result=db.prepare('SELECT user_jid,points FROM arcade_scores WHERE chat_jid=? ORDER BY user_jid').all(CHAT);
 assert.deepEqual(result.map(row=>row.points),[20,20]);assert.ok(!result.some(row=>row.user_jid===C));
 assert.equal(createHistory(db).list(CHAT,C).total,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM mission_events WHERE user_jid=?').get(C).n,0);
 assert.equal(play(B,[letters.at(-1)],'letter-'+letters.at(-1)),null);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM arcade_scores WHERE chat_jid=?').get(OTHER).n,0);
});

test('cooperative failure rolls back the last letter and every participant reward',t=>{
 const db=database(t);let time=1000,id=0;const coop=createCoopForca(db,{now:()=>time,pick:()=>0});
 const play=(args,event=String(++id))=>coop.play({chat:CHAT,user:A,name:'Alfa',args,event,prefix:'!'});
 play(['iniciar','matilha']);const letters=[...new Set(WORDS[coop.read(CHAT).state.game.word][0])];
 for(const letter of letters.slice(0,-1)){time+=2100;play([letter]);}
 const before=JSON.stringify(coop.read(CHAT).state);
 db.exec("CREATE TRIGGER fail_coop BEFORE INSERT ON arcade_scores BEGIN SELECT RAISE(ABORT,'coop rollback'); END");time+=2100;
 assert.throws(()=>play([letters.at(-1)],'final'),/coop rollback/);assert.equal(JSON.stringify(coop.read(CHAT).state),before);
 assert.equal(createHistory(db).list(CHAT,A).total,0);
 db.exec('DROP TRIGGER fail_coop');play([letters.at(-1)],'final');assert.equal(createHistory(db).list(CHAT,A).total,1);
});

test('expanded wrappers preserve old handlers and aliases while reporting actual themes and inventory',async t=>{
 const db=database(t);let legacy=0;const old={name:'forca',aliases:['hangman'],handler:async()=>{legacy++;}},registry=new Map([['forca',old]]);
 register(def=>{registry.set(def.name,def);for(const alias of def.aliases||[])registry.set(alias,def);},registry);
 // Global registration uses the real API; standalone command tests inject an isolated database.
 assert.equal(registry.get('forca'),registry.get('hangman'));
 const commands=createExpandedArcade({api:{db},prefix:()=> '$$'}),sent=[],sock={sendMessage:async(jid,payload)=>{sent.push(payload.text);}};
 const ctx={jid:CHAT,sender:A,args:['temas'],msg:{key:{id:'view'}}};
 assert.equal(await commands.handle('forca',sock,ctx),true);assert.match(sent[0],/ciencia/);assert.match(sent[0],/\$\$forca/);
 assert.equal(await commands.handle('forca',sock,{...ctx,args:[]}),false);
 assert.equal(legacy,0);
 await commands.handle('aventura',sock,{...ctx,args:['inventario']});assert.match(sent.at(-1),/Nenhuma jornada/);
 await commands.handle('historicojogos',sock,{...ctx,args:[]});assert.match(sent.at(-1),/atualização/);
});
