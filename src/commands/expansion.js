'use strict';
const {frameMenu,frameNotice}=require('../menus/render');
const definitions=[
 ['conquistas',['conquista','trofeus'],'conquistas','Conquistas e recompensas','[ID]'],
 ['carreira',['emprego','salario'],'trabalho','Progressão da profissão RP',''],
 ['streak',['sequencia'],'rp','Dias de atividade consecutivos',''],
 ['atividadegrupo',[],'grupo','Atividade coletiva e bônus de XP',''],
 ['eventos',[],'rp','Eventos ativos por horário',''],
 ['investir',[],'economia','Aplicar moeda fictícia','quantidade'],
 ['investimentos',[],'economia','Posição e regras dos investimentos',''],
 ['sacarinvestimento',[],'economia','Resgatar aplicação virtual',''],
 ['banco',[],'economia','Banco virtual e histórico',''],
 ['emprestimo',[],'economia','Solicitar empréstimo virtual','quantidade'],
 ['divida',[],'economia','Consultar dívida virtual',''],
 ['pagardivida',[],'economia','Quitar dívida virtual','quantidade'],
 ['escudo',[],'economia','Ver Escudo Wolf econômico',''],
 ['comprarescudo',[],'economia','Comprar Escudo Wolf econômico',''],
 ['boost',['boosts'],'rp','Catálogo e boosts ativos',''],
 ['comprarboost',[],'economia','Comprar boost temporário','ID'],
 ['perfildivertido',[],'diversao','Perfil fictício separado do RP',''],
 ['versao',[],'info','Versão real do pacote',''],
];
function handler(command,{api,progress,finance}={}){return async(sock,ctx)=>{
 const db=api||require('../utils/database'),p=progress||require('../progression/service').progression(),f=finance||require('../economy/finance').createFinance(db);
 const chat=ctx.jid,user=ctx.sender,args=ctx.args||[],event=ctx.msg.key.id,prefix=require('../config').get('PREFIX');
 const reply=(title,lines)=>sock.sendMessage(chat,{text:frameMenu(title,lines)},{quoted:ctx.msg});
 const quantity=()=>{if(args.length!==1||!/^\d{1,15}$/.test(args[0]))throw Error('Informe uma quantidade inteira positiva.');return Number(args[0]);};
 try{
 if(command==='versao')return reply('📡 VERSÃO',[require('../../package.json').version]);
 if(command==='conquistas'){const list=p.list(chat,user);if(args[0]){const a=list.find(item=>item.id===args[0]);if(!a)throw Error('Conquista inexistente.');return reply(a.emoji+' '+a.name,[a.description,`ID: ${a.id} • Recompensa: ${a.reward} WoK coin`,a.unlockedAt?`✅ ${new Date(a.unlockedAt).toISOString()}`:'🔒 Bloqueada']);}return reply('🏆 CONQUISTAS',list.map(a=>`${a.unlockedAt?'✅':'🔒'} ${a.emoji} *${a.name}* (${a.id})\n_${a.description}_ • ${a.reward} WoK coin`));}
 if(command==='streak'){const id=p.identity(chat,user),s=p.state(chat,id),row=db.db.prepare('SELECT state FROM universal_game_states WHERE chat_jid=?').get(chat),player=row?JSON.parse(row.state).players?.[id]:null;return reply('🔥 SEQUÊNCIA',[`${s.streak} dias consecutivos • ${s.days} dias ativos`,`Último dia: ${s.lastDay||'nenhum'}`,`Treinos: ${player?.activityStreaks?.training?.current||0} dias • Eventos: ${player?.activityStreaks?.events?.current||0} dias`,`Vitórias consecutivas: ${player?.winStreak||0} • Recorde: ${player?.bestWinStreak||0}`,'Use um comando em cada dia para manter a sequência.']);}
 if(['atividadegrupo','eventos'].includes(command)){const m=p.multipliers(chat,user);return reply('🐺 MATILHA E EVENTOS',[`👥 ${m.count} jogadores ativos hoje`,`Bônus coletivo: ${m.pack}× XP • Sequência: ${m.streak}×`,`Eventos: ${m.events.map(e=>`${e.name} (${e.xp}×)`).join(', ')||'nenhum neste horário'}`,`Multiplicador de progressão: ${m.xp}× (limite ${p.config.maxMultiplier}×)`]);}
 if(command==='carreira'){const id=p.identity(chat,user),row=db.db.prepare('SELECT state FROM universal_game_states WHERE chat_jid=?').get(chat),player=row?JSON.parse(row.state).players[id]:null,rp=player?.rp;if(!rp)throw Error(`Crie seu personagem com ${prefix}rp iniciar e escolha uma profissão.`);const c=rp.career||{},level=1+Math.floor(Math.sqrt(rp.experience||0)/10),tiers=require('../progression/career'),tier=tiers.current(c,level),next=tiers.TIERS[tiers.TIERS.indexOf(tier)+1];return reply('💼 CARREIRA',[`Profissão: ${rp.jobId||'escolha com '+prefix+'profissao'}`,`Cargo: ${tier.name} • Nível RP: ${level}`,`Dias: ${c.days||0} • Sequência: ${c.streak||0} • Expedientes: ${c.shifts||0}`,`Recebido na carreira: ${c.total||0} WoK coin`,`Bônus por expediente: ${tier.bonus} + até 50 WoK coin de sequência`,next?`Próximo: ${next.name} • ${next.days} dias • nível ${next.level}`:'👑 Cargo máximo',`Trabalhe com ${prefix}trabalhar. Salário-base depende da profissão; cooldown e necessidades RP continuam obrigatórios.`]);}
 if(command==='boost'){const active=p.effects(chat,user);return reply('🚀 BOOSTS',[...p.config.boosts.map(b=>`${b.id} — ${b.name} • ${b.price} WoK coin • ${Math.round(b.durationMs/3600000)}h`),`Ativos:\n${active.map(e=>`${e.type} ${e.multiplier}× até ${new Date(e.expires_at).toISOString()}`).join('\n')||'Nenhum'}`,`${prefix}comprarboost ID`]);}
 if(command==='comprarboost'){if(args.length!==1)throw Error('Informe o ID do boost.');const r=p.buyBoost(chat,user,args[0],event);return reply('🚀 BOOST ATIVADO',[r.item.name,r.item.type==='resetDaily'?'Daily liberado; outro reset somente após 24h.':`Válido até ${new Date(r.until).toISOString()}`]);}
 if(command==='comprarescudo'){const until=p.shield(chat,user,event);return reply('🛡️ ESCUDO WOLF',[`Válido até ${new Date(until).toISOString()}`,'Protege perdas de moeda em batalhas. Compras, pagamentos e investimentos continuam voluntários.']);}
 if(command==='escudo'){const active=p.effects(chat,user).find(e=>e.type==='economicShield');return reply('🛡️ ESCUDO WOLF',[active?`✅ Ativo até ${new Date(active.expires_at).toISOString()}`:'🔴 Inativo',`Preço: ${p.config.shield.price} WoK coin • ${p.config.shield.durationMs/3600000}h`,`${prefix}comprarescudo`]);}
 if(command==='investir'){const r=f.invest(chat,user,quantity(),event);return reply('📈 INVESTIMENTO VIRTUAL',[`${r.principal} WoK coin aplicadas.`,`${prefix}investimentos para consultar regras e rendimento.`]);}
 if(command==='sacarinvestimento'){const r=f.withdraw(chat,user,event);return reply('📈 RESGATE VIRTUAL',[`Crédito: ${r.net} WoK coin • Rendimento: ${r.yieldAmount} • Taxa: ${r.fee}`]);}
 if(command==='emprestimo'){if(!args.length)return reply('🏦 EMPRÉSTIMO VIRTUAL',[`${prefix}emprestimo QUANTIDADE`,`Limite: ${p.config.loan.min}–${p.config.loan.max} WoK coin • Taxa única: ${p.config.loan.interestBps/100}% • Prazo: ${p.config.loan.termDays} dias`]);const r=f.borrow(chat,user,quantity(),event);return reply('🏦 EMPRÉSTIMO RECEBIDO',[`Dívida: ${r.remaining} WoK coin • Vence: ${new Date(r.due).toISOString()}`]);}
 if(command==='pagardivida'){const remaining=f.pay(chat,user,quantity(),event);return reply('🏦 PAGAMENTO',[`Dívida restante: ${remaining} WoK coin`]);}
 if(['banco','divida','investimentos'].includes(command)){const r=f.status(chat,user),i=r.investment,l=r.loan;return reply('🏦 BANCO VIRTUAL',[i?`Aplicação: ${i.principal} • Dias: ${i.days} • Rendimento: ${i.yieldAmount} • Taxa: ${i.fee} • Resgate líquido: ${i.net}`:'Sem investimento.',`Regras: ${p.config.investment.min}–${p.config.investment.max} • ${p.config.investment.dailyBps/100}% por dia completo, até ${p.config.investment.maxDays} dias • Saque ${p.config.investment.feeBps/100}%`,l?`Dívida: ${l.remaining} • Pago: ${l.paid} • Prazo: ${new Date(l.due_at).toISOString()}`:'Sem empréstimo.',`Histórico:\n${r.history.map(x=>`${x.kind}: ${x.amount}`).join('\n')||'Sem operações.'}`,'Moeda fictícia. Sem depósitos, saques ou dinheiro real.']);}
 if(command==='perfildivertido'){const pick=a=>a[require('node:crypto').randomInt(a.length)];return reply('🎭 PERFIL DIVERTIDO',[`Hobby: ${pick(['observar a lua','desenhar','explorar trilhas'])}`,`Superpoder: ${pick(['uivo supersônico','teletransporte lunar','conversar com árvores'])}`,`Mascote: ${pick(['coruja','raposa','lobo de pelúcia'])}`,`Habilidade: ${pick(['estratégia','humor','criatividade'])}`,`Objetivo: proteger a matilha • Sorte: ${require('node:crypto').randomInt(101)}%`,`Profissão fictícia: guardião da lua • Título: explorador`,`Frase: A aventura começa com respeito. • Nível de aventura: ${require('node:crypto').randomInt(1,101)}`,'Perfil recreativo temporário. Não altera o RP.']);}
 }catch(error){if(error.code)throw error;return sock.sendMessage(chat,{text:frameNotice('⚠️ CONFIRA A OPERAÇÃO',[error.message])},{quoted:ctx.msg});}
 };}
function register(r){
 r({name:'atualizarbot',category:'dono',description:'Atualizar versão oficial (dono)',ownerOnly:true,handler:(sock,ctx)=>require('./update').update(sock,{...ctx,args:['bot']})});
 r({name:'surpresa',category:'jogos',description:'Desafio diário sem apostas',usage:'!surpresa [resposta]',handler:async(sock,ctx)=>{try{return sock.sendMessage(ctx.jid,{text:require('../events/surprise').createSurprise(require('../utils/database')).run(ctx.jid,ctx.sender,ctx.args.join(' '),ctx.msg.key.id)},{quoted:ctx.msg});}catch(error){return sock.sendMessage(ctx.jid,{text:'🌹 '+error.message+' 🐺'},{quoted:ctx.msg});}}});
 r({name:'gartic',category:'gartic',description:'Desenhos e adivinhação em grupo',groupOnly:true,usage:'!gartic [iniciar|proxima|parar|ranking|resposta]',concurrency:'chat',handler:async(sock,ctx)=>{try{const text=await require('../games/gartic').gartic().command(sock,ctx);if(text)return sock.sendMessage(ctx.jid,{text:frameMenu('🎨 GARTIC',[text])},{quoted:ctx.msg});}catch(error){return sock.sendMessage(ctx.jid,{text:frameNotice('⚠️ GARTIC',[error.code?'Não foi possível iniciar a rodada; confira se o bot pode enviar sua palavra no privado.':error.message])},{quoted:ctx.msg});}}});

 for(const game of require('../games/registry').values())r({name:game.id,aliases:game.aliases||[],category:'jogos',description:game.description,usage:'!'+game.id+' [resposta|status|parar]',handler:require('./arcade').createArcadeCommand(game.id)});
 r({name:'jogar',category:'jogos',description:'Escolher um minijogo',usage:'!jogar NOME [resposta]',handler:async(sock,ctx)=>{const [game,...args]=ctx.args;if(!game||!require('../games/registry').has(game)&&!['quiz','forca','adivinhar','aventura','akinator'].includes(game))return sock.sendMessage(ctx.jid,{text:'🐺 Jogos: '+[...require('../games/registry').keys()].join(', ')},{quoted:ctx.msg});return require('./arcade').createArcadeCommand(game)(sock,{...ctx,args});}});
 r({name:'rankingjogos',category:'jogos',description:'Ranking dos minijogos',handler:require('./arcade').createArcadeCommand('placarjogos')});
 for(const[name,aliases,category,description,usage]of definitions)r({name,aliases,category,description,usage:'!'+name+(usage?' '+usage:''),concurrency:'chat',handler:handler(name)});}
module.exports={register,handler,definitions};
