'use strict';
const SHORT = Object.freeze({
  m:'menu', alc:'alcateia', fam:'familia', inv:'inventario', cart:'carteira', transf:'transferir',
  trab:'trabalhar', prof:'profissao', profs:'profissoes', ac:'acao', ljrp:'rploja', cmprp:'rpcomprar',
  pf:'perfilalcateia', tr:'treino', atq:'ataque', form:'formacao', rk:'rank', ev:'evento',
  ljw:'lojaalcateia', cmpw:'compraralcateia', cla:'clan', ini:'start',
  qz:'quiz', fc:'forca', advn:'adivinhar', av:'aventura', pj:'placarjogos', aki:'akinator',
  ati:'ativacoes', st:'setores', up:'atualizar', ds:'donos', capa:'fotomenu', dw:'doarwok',
  al:'antilink', alg:'antilinkgrupo', af:'antiflood', bv:'bemvindo', bye:'despedida',
  ad:'advertir', avis:'advertencias', radv:'resetadvertencias', li:'limparinatividade',
  pr:'promover', rb:'rebaixar', abr:'abrirgrupo', fec:'fechargrupo',
  aud:'play_audio', vid:'play_video', stk:'sticker', sa:'stickeranim', img:'toimg',
  sl:'gold', dl:'daily', lj:'loja', cmp:'comprar',
  pi:'ping', ut:'uptime', plg:'plugins', atal:'atalhos',
  es:'estrategia', atk:'atacar', rl:'ranklobos', clobos:'curarlobos', rstl:'resetarlobos', il:'infolobos',
  eg:'enviargold', rkg:'rankgold', vip:'premiun', lv:'level', prf:'perfil', rkgp:'ranking', stats:'estatisticas',
  aa:'addadmin', ra:'removeadmin', bc:'broadcast', ag:'agendarmensagem', ar:'autoreply', rr:'removeautoreply',
  mt:'marcartodos', tt:'tiktok', sp:'spotify', '8b':'8ball', pd:'piada', ft:'fato', srt:'sorteio', esc:'escolher', sh:'ship',
  acont:'anticontato', am:'antimarcacao', ai:'antiinatividade', aimg:'antiimagem', avd:'antivideo',
  aaudio:'antiaudio', adoc:'antidocumento', aloc:'antilocalizacao', ast:'antisticker', avo:'antiviewonce',
  arp:'autoresposta', ativ:'ativar', des:'desativar',
});
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const ACTIONS = Object.freeze({
  familia:{cr:'criar',p:'perfil',pf:'perfil',cv:'convidar',cs:'casar',ok:'aceitar',nao:'recusar',rec:'recusar',s:'sair',div:'divorciar',dep:'depositar',saq:'retirar'},
  clan:{cr:'criar',en:'entrar',p:'perfil',pf:'perfil'},
  rp:{ini:'iniciar',p:'perfil',pf:'perfil',m:'menu'},
  donos:{ls:'lista',add:'adicionar',rm:'remover'},
  fotomenu:{v:'ver',rm:'remover'},
  adm:{p:'perm',n:'nome',desc:'descricao'},
  atualizar:{b:'bot',bl:'baileys',st:'status'},
});
function resolveInput(input, originalArgs, exists) {
  const normalized=fold(input);
  let command=exists(input)?input:exists(normalized)?normalized:SHORT[normalized] && exists(SHORT[normalized])?SHORT[normalized]:input;
  let args=[...(originalArgs || [])];
  const actions=(name,values)=>{
    if(!values.length) return values;
    const first=fold(values[0]);
    return [ACTIONS[name]?.[first] || first,...values.slice(1)];
  };
  if(command==='familia' && ['alcateia','rp'].includes(fold(args[0]))) args.shift();
  if(command==='alcateia' && args.length) {
    const sub=fold(args[0]), target=SHORT[sub] || sub;
    if(['familia','clan','rp'].includes(target)) args=[target,...actions(target,args.slice(1))];
    else if(exists(target) && ['start','treino','ataque','formacao','rank','evento'].includes(target)) args=[target,...args.slice(1)];
  } else if(ACTIONS[command]) args=actions(command,args);
  if(command==='adm' && args[0]==='perm' && args[1]) args[1]=({lib:'permitir',rev:'revogar',st:'status'})[fold(args[1])] || fold(args[1]);
  return {command,args};
}
async function shortcuts(sock,ctx) {
  const registry=require('../core/commandRegistry').registry,plugins=require('../core/pluginLoader').getPluginCommands();
  const exists=name=>registry.has(name)||!!plugins[name],p=require('../config').get('PREFIX');
  const lines=Object.entries(SHORT).filter(([alias,target])=>!exists(alias)&&exists(target)).map(([alias,target])=>`*${p}${alias}* → ${p}${target}`);
  return sock.sendMessage(ctx.jid,{text:require('../menus/render').frameMenu('⚡ ATALHOS DA MATILHA',[
    '_Comandos completos continuam funcionando. Os atalhos usam as mesmas permissões e limites._',
    lines.join('\n'),
    `👨‍👩‍👧 ${p}fam cr Nome → criar família\n📜 ${p}fam pf → perfil\n🏙️ ${p}rp ini → iniciar RP\n🐺 ${p}cla cr Nome → criar clã\n👑 ${p}ds add número → cadastrar dono`,
    '_Também aceita família, clã e outros nomes com acentos, quando não houver conflito com um comando existente._',
  ])},{quoted:ctx.msg});
}
module.exports={SHORT,resolveInput,shortcuts};
