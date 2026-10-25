'use strict';
const {command:formatCommand,mono}=require('../ui/text');
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
  md:'mudar', lb:'lobos', mu:'mute', um:'unmute', ub:'unban',
  dad:'dado', moe:'moeda', az:'azar', afe:'antifake', aspm:'antispam', ale:'antilinkexterno',
  pl:'play', yta:'ytmp3', ytv:'ytmp4', pa:'play_audio', pv:'play_video', ol:'olamundo',
  mj:'jogos', ma:'alcateia', mm:'midia', mad:'adm', mdo:'dono', mut:'util',
  mf:'figurinhas', mp:'pesquisa', mia:'ia', mdiv:'diversao', mg:'grupo',
  mi:'info', mfer:'ferramentas', mrp:'rp', mec:'economia',
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
  ativacoes:{st:'status',diag:'diagnostico',hist:'historico'},
  admin:{st:'status',bk:'backup',bc:'broadcast',addm:'addmoedas',rmm:'removemoedas',rcd:'resetcooldown',addl:'addlobos'},
});
// Recomputed from the loaded registry: never invent a route without a real target.
function availableShortcuts(exists, names = []) {
  const routes = new Map(Object.entries(SHORT).filter(([alias,target]) => !exists(alias) && exists(target)));
  const candidates = [...new Set(names.map(fold))].sort();
  for (const target of candidates) {
    if (target.length <= 3 || !exists(target) || [...routes.values()].includes(target)) continue;
    for (let length = 3; length < target.length; length++) {
      const alias = target.slice(0, length);
      if (exists(alias) || routes.has(alias) || candidates.some(other => other !== target && other.startsWith(alias))) continue;
      routes.set(alias, target);
      break;
    }
  }
  return routes;
}
function resolveInput(input, originalArgs, exists, names = []) {
  const normalized=fold(input);
  let command=exists(input)?input:exists(normalized)?normalized:availableShortcuts(exists, names).get(normalized) || input;
  let args=[...(originalArgs || [])];
  const actions=(name,values)=>{
    if(!values.length) return values;
    const first=fold(values[0]);
    const known = ACTIONS[name] || {};
    // Unrecognized arguments are names, titles or text; preserve them byte for byte.
    return [known[first] || (Object.values(known).includes(first) ? first : values[0]),...values.slice(1)];
  };
  if(command==='familia' && ['alcateia','rp'].includes(fold(args[0]))) args.shift();
  if(command==='alcateia' && args.length) {
    const sub=fold(args[0]), target=SHORT[sub] || sub;
    if(['familia','clan','rp','admin'].includes(target)) args=[target,...actions(target,args.slice(1))];
    else if(exists(target) && ['start','treino','ataque','formacao','rank','evento'].includes(target)) args=[target,...args.slice(1)];
  } else if(ACTIONS[command]) args=actions(command,args);
  if (['ativar','desativar'].includes(command) && args[0]) {
    const target = SHORT[fold(args[0])];
    if (target && (target.startsWith('anti') || ['bemvindo','despedida','autoresposta','level'].includes(target))) args[0] = target;
  }
  if(command==='adm' && args[0]==='perm' && args[1]) args[1]=({lib:'permitir',rev:'revogar',st:'status'})[fold(args[1])] || fold(args[1]);
  return {command,args};
}
async function shortcuts(sock,ctx) {
  const registry=require('../core/commandRegistry').registry,plugins=require('../core/pluginLoader').getPluginCommands();
  const exists=name=>registry.has(name)||!!plugins[name],p=require('../config').get('PREFIX');
  const names=[...new Set([...registry.values()].map(cmd=>cmd.name).concat(Object.keys(plugins)))];
  const routes=availableShortcuts(exists,names);
  const lines=[...routes].map(([alias,target])=>`${formatCommand(p + alias)} → ${formatCommand(p + target)}`);
  const requested=fold(ctx.args?.[0]);
  const filtered=requested ? [...routes].filter(([alias,target])=>target===requested || alias===requested).map(([alias,target])=>`${formatCommand(p + alias)} → ${formatCommand(p + target)}`) : lines;
  const sections=[
    '_Comandos completos continuam funcionando. Mesmas permissões e limites._',
    ...filtered,
    `👨‍👩‍👧 ${formatCommand(p + 'fam cr Nome')} → _Criar família_`,
    `📜 ${formatCommand(p + 'fam pf')} → _Perfil_ • ${formatCommand(p + 'fam dep 100')} → _Depositar_`,
    `🏙️ ${formatCommand(p + 'rp ini')} → _Iniciar RP_ • ${formatCommand(p + 'cla cr Nome')} → _Criar clã_`,
    `🛡️ ${formatCommand(p + 'ativ al')} → _Ativar AntiLink_ • ${formatCommand(p + 'ati diag')} → _Diagnóstico_`,
    `👑 ${formatCommand(p + 'ds add número')} → _Cadastrar dono_ • ${formatCommand(p + 'up b')} → _Atualizar bot_`,
    `> Use ${formatCommand(p + 'atalhos nome')} para consultar um comando.`,
  ];
  if (requested && !filtered.length) sections.splice(1,0,'Nenhum atalho alternativo para esse nome; use o comando completo.');
  // Keep the catalogue readable on mobile even with new plugin commands.
  const pages=[];
  let page=[];
  for(const line of sections) {
    if(page.join('\n').length+line.length>2800) { pages.push(page); page=[]; }
    page.push(line);
  }
  if(page.length) pages.push(page);
  for(let index=0;index<pages.length;index++)
    await sock.sendMessage(ctx.jid,{text:require('../menus/render').frameMenu('⚡ ATALHOS', [`*Página:* ${mono(index+1)}/${mono(pages.length)}`, pages[index].join('\n')])},{quoted:ctx.msg});

}
module.exports={SHORT,ACTIONS,availableShortcuts,resolveInput,shortcuts};
