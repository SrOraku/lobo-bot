'use strict';
const { register } = require('../core/commandRegistry');
const { LEVELS }   = require('../middlewares/permissions');
const wolf  = require('../commands/wolf');
const mod   = require('../commands/moderation');
const gold  = require('../commands/gold');
const stats = require('../commands/stats');
const media = require('../commands/media');
const stick = require('../commands/stickers');
const fun   = require('../commands/fun');
const admin = require('../commands/admin');
const menu  = require('../commands/menu');
const updater = require('../commands/update');

function loadAllCommands() {
  const r = (def) => register(def);

  // Menu
  r({name:'menu',    aliases:['ajuda','help'], description:'Menu principal',     category:'geral',  usage:'!menu [categoria]', example:'!menu gold', handler:menu.menu});

  for (const category of Object.keys(require('../menus/catalog').CATEGORIES)) {
    if (['rp','alcateia'].includes(category)) continue; // rotas existentes do plugin
    if (require('../core/commandRegistry').registry.has(category)) continue;
    r({name:category, menuShortcut:true, category:'geral', description:'Abrir menu '+category, handler:(sock,ctx)=>menu.menu(sock,{...ctx,args:[category]})});
  }

  // 100 Lobisomens
  r({name:'estrategia',aliases:['strategy'],  description:'Ver estratégia',      category:'lobo',   usage:'!estrategia',                            example:'!estrategia',                 handler:wolf.verEstrategia});
  r({name:'mudar',                             description:'Mudar estratégia',   category:'lobo',   usage:'!mudar estrategia ataque:X defesa:Y contra:Z', example:'!mudar estrategia ataque:40 defesa:35 contra:25', handler:wolf.mudarEstrategia});
  r({name:'atacar',                            description:'Atacar guerreiro',   category:'lobo',   usage:'!atacar @usuário',                       example:'!atacar @membro',             handler:wolf.atacar,    groupOnly:true});
  r({name:'lobos',   aliases:['matilha'],      description:'Ver sua matilha',    category:'lobo',   usage:'!lobos',                                 example:'!lobos',                      handler:wolf.meusLobos});
  r({name:'ranklobos',                         description:'Ranking batalhas',   category:'lobo',   usage:'!ranklobos',                             example:'!ranklobos',                  handler:wolf.rankLobos});
  r({name:'curarlobos',aliases:['curar'],      description:'Curar lobos (200💰)',category:'lobo',   usage:'!curarlobos',                            example:'!curarlobos',                 handler:wolf.curarLobos});
  r({name:'resetarlobos',                      description:'Resetar lobos',      category:'lobo',   usage:'!resetarlobos [@usuário]',               example:'!resetarlobos',               handler:wolf.resetarLobos, minLevel:LEVELS.BOT_ADMIN});
  r({name:'infolobos',aliases:['lobosinfo'],   description:'Guia do jogo',       category:'lobo',   usage:'!infolobos',                             example:'!infolobos',                  handler:wolf.infoJogo});

  // Gold
  r({name:'gold',                              description:'Ver gold',           category:'gold',   usage:'!gold [@usuário]',                       example:'!gold',                       handler:gold.verGold});
  r({name:'enviargold',aliases:['pay','pagar'],description:'Transferir gold',    category:'gold',   usage:'!enviargold @usuário [valor]',            example:'!enviargold @amigo 100',      handler:gold.enviarGold});
  r({name:'rankgold', aliases:['topgold'],     description:'Top mais ricos',     category:'gold',   usage:'!rankgold',                              example:'!rankgold',                   handler:gold.rankGold});
  r({name:'daily',    aliases:['diario'],      description:'Recompensa diária',  category:'gold',   usage:'!daily',                                 example:'!daily',                      handler:gold.daily});
  r({name:'loja',     aliases:['shop'],        description:'Loja da matilha',    category:'gold',   usage:'!loja',                                  example:'!loja',                       handler:gold.loja});
  r({name:'comprar',  aliases:['buy'],         description:'Comprar item',       category:'gold',   usage:'!comprar [ID]',                           example:'!comprar 2',                  handler:gold.comprar});
  r({name:'premiun',  aliases:['premium'],     description:'Info premium',       category:'gold',   usage:'!premiun',                               example:'!premiun',                    handler:gold.premiumInfo});

  // Stats
  r({name:'level',    aliases:['lvl','xp'],    description:'Ver nível e XP',     category:'stats',  usage:'!level [@usuário]',                      example:'!level',                      handler:stats.verLevel});
  r({name:'perfil',   aliases:['profile'],     description:'Ficha completa',     category:'stats',  usage:'!perfil [@usuário]',                     example:'!perfil',                     handler:stats.perfil});
  r({name:'ranking',  aliases:['top'],         description:'Ranking geral',      category:'stats',  usage:'!ranking',                               example:'!ranking',                    handler:stats.rankGeral});
  r({name:'estatisticas',aliases:['stats'],    description:'Stats do grupo',     category:'stats',  usage:'!stats',                                 example:'!stats',                      handler:stats.estatisticasGrupo, groupOnly:true});

  // Moderação
  r({name:'ban',                               description:'Banir do bot',       category:'mod',    usage:'!ban @usuário',                          example:'!ban @membro',                handler:mod.ban,              minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'unban',                             description:'Desbanir',           category:'mod',    usage:'!unban @usuário',                        example:'!unban @membro',              handler:mod.unban,            minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'mute',                              description:'Silenciar',          category:'mod',    usage:'!mute @usuário',                         example:'!mute @membro',               handler:mod.mute,             minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'unmute',                            description:'Desmutar',           category:'mod',    usage:'!unmute @usuário',                       example:'!unmute @membro',             handler:mod.unmute,           minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'kick',     aliases:['remover'],     description:'Remover do grupo',   category:'mod',    usage:'!kick @usuário',                         example:'!kick @membro',               handler:mod.kick,             minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'add',                               description:'Adicionar ao grupo', category:'mod',    usage:'!add [número]',                          example:'!add 5543999999999',           handler:mod.add,              minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'promover', aliases:['promote'],     description:'Tornar admin',       category:'mod',    usage:'!promover @usuário',                     example:'!promover @membro',           handler:mod.promover,         minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'rebaixar', aliases:['demote'],      description:'Remover admin',      category:'mod',    usage:'!rebaixar @usuário',                     example:'!rebaixar @membro',           handler:mod.rebaixar,         minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'abrirgrupo',aliases:['abrir'],      description:'Abrir grupo',        category:'mod',    usage:'!abrirgrupo',                            example:'!abrirgrupo',                 handler:mod.abrirGrupo,       minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'fechargrupo',aliases:['fechar'],    description:'Fechar grupo',       category:'mod',    usage:'!fechargrupo',                           example:'!fechargrupo',                handler:mod.fecharGrupo,      minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'antilink',                          description:'Toggle anti-link',   category:'mod',    usage:'!antilink [modo]',                       example:'!antilink delete',            handler:mod.toggleAntilink,   minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'antifake',                          description:'Toggle anti-fake',   category:'mod',    usage:'!antifake',                              example:'!antifake',                   handler:mod.toggleAntifake,   minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'anticontato',                       description:'Toggle anti-contato',category:'mod',    usage:'!anticontato',                           example:'!anticontato',                handler:mod.toggleAnticontato,minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'antimarcacao',                      description:'Anti-marcação',      category:'mod',    usage:'!antimarcacao',                          example:'!antimarcacao',               handler:mod.toggleAntitag,    minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'antiinatividade',                   description:'Anti-inatividade',   category:'mod',    usage:'!antiinatividade [dias]',                example:'!antiinatividade 7',          handler:mod.toggleAntiInatividade,minLevel:LEVELS.GROUP_ADMIN,groupOnly:true});
  r({name:'limparinatividade',                 description:'Remover inativos',   category:'mod',    usage:'!limparinatividade',                     example:'!limparinatividade',          handler:mod.limparInatividade,minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});
  r({name:'marcartodos',aliases:['todos','all'],description:'Marcar todos',      category:'mod',    usage:'!marcartodos [msg]',                     example:'!marcartodos Atenção!',       handler:mod.marcarTodos,      minLevel:LEVELS.GROUP_ADMIN, groupOnly:true});

  // Mídia
  r({name:'play',                              description:'Baixar MP3; use play video para MP4',       category:'midia',  usage:'!play [audio|video] nome/url',                      example:'!play Shape of You',          handler:media.play});
  r({name:'ytmp3',    aliases:['playmp3','play_audio'],     description:'Baixar MP3',          category:'midia',  usage:'!ytmp3 [nome/url]',                     example:'!ytmp3 Bohemian Rhapsody',    handler:media.playMp3});
  r({name:'ytmp4',    aliases:['playmp4','play_video'],     description:'Baixar MP4',          category:'midia',  usage:'!ytmp4 [nome/url]',                     example:'!ytmp4 tutorial Node.js',     handler:media.playMp4});
  r({name:'tiktok',   aliases:['tk'],          description:'Baixar TikTok',       category:'midia',  usage:'!tiktok [url]',                         example:'!tiktok https://vm.tiktok.com/...',handler:media.tiktok});
  r({name:'ig',       aliases:['instagram'],   description:'Baixar Instagram',    category:'midia',  usage:'!ig [url]',                             example:'!ig https://www.instagram.com/p/...', handler:media.instagram});
  r({name:'spotify',  aliases:['spot'],        description:'Buscar Spotify',      category:'midia',  usage:'!spotify [nome]',                       example:'!spotify Blinding Lights',    handler:media.spotify});

  // Figurinhas
  r({name:'sticker',  aliases:['s'],           description:'Criar figurinha',     category:'midia',  usage:'!sticker [pack]',                       example:'!sticker',                    handler:stick.criarSticker});
  r({name:'stickeranim',aliases:['sanim'],     description:'Sticker animado',     category:'midia',  usage:'!stickeranim',                          example:'!stickeranim',                handler:stick.criarStickerAnimado});
  r({name:'toimg',    aliases:['stickertoimg'],description:'Sticker → imagem',    category:'midia',  usage:'!toimg',                                example:'!toimg',                      handler:stick.stickerParaImagem});

  // Diversão
  r({name:'dado',     aliases:['dice'],        description:'Rolar dado',          category:'fun',    usage:'!dado [faces]',                         example:'!dado 20',                    handler:fun.dado});
  r({name:'moeda',    aliases:['coin','flip'],  description:'Cara ou coroa',       category:'fun',    usage:'!moeda',                                example:'!moeda',                      handler:fun.moeda});
  r({name:'8ball',    aliases:['bola8'],        description:'Bola mágica',         category:'fun',    usage:'!8ball [pergunta]',                     example:'!8ball Vou ganhar?',           handler:fun.bola8});
  r({name:'piada',    aliases:['joke'],         description:'Piada do lobo',       category:'fun',    usage:'!piada',                                example:'!piada',                      handler:fun.piada});
  r({name:'fato',     aliases:['fact'],         description:'Fato sobre lobos',    category:'fun',    usage:'!fato',                                 example:'!fato',                       handler:fun.fato});
  r({name:'sorteio',  aliases:['sortear'],      description:'Sortear número',      category:'fun',    usage:'!sorteio [min] [max]',                  example:'!sorteio 1 100',              handler:fun.sorteio});
  r({name:'azar',     aliases:['sorte'],        description:'Sorte do dia',        category:'fun',    usage:'!azar',                                 example:'!azar',                       handler:fun.azar});
  r({name:'escolher', aliases:['choose'],       description:'Escolha aleatória',   category:'fun',    usage:'!escolher op1, op2',                    example:'!escolher pizza, hamburguer', handler:fun.escolher});
  r({name:'ship',                               description:'Compatibilidade',     category:'fun',    usage:'!ship @p1 @p2',                         example:'!ship @joao @maria',          handler:fun.ship});
  r({name:'akinator',                           description:'Akinator dos lobos',  category:'fun',    usage:'!akinator',                             example:'!akinator',                   handler:fun.akinator});

  // Admin do bot
  // O handler confirma PN/LID do dono pelo Baileys; nunca usa senderNumber como autorização.
  r({name:'atualizar', description:'Atualizar bot e Baileys (dono)', category:'admin', usage:'!atualizar [status|bot|baileys]', example:'!atualizar status', handler:updater.update});
  r({name:'addadmin',   aliases:['botadmin'],   description:'Add admin do bot',    category:'admin',  usage:'!addadmin @usuário',                    example:'!addadmin @pessoa',           handler:admin.addAdmin,    minLevel:LEVELS.OWNER});
  r({name:'removeadmin',                        description:'Remover admin do bot',category:'admin',  usage:'!removeadmin @usuário',                 example:'!removeadmin @pessoa',        handler:admin.removeAdmin, minLevel:LEVELS.OWNER});
  r({name:'broadcast',   aliases:['bc'],        description:'Broadcast para todos',category:'admin',  usage:'!broadcast [msg]',                      example:'!broadcast Olá matilha!',     handler:admin.broadcast,   minLevel:LEVELS.OWNER});
  r({name:'agendarmensagem',aliases:['agendar'],description:'Agendar mensagem',    category:'admin',  usage:'!agendarmensagem "cron" msg',            example:'!agendarmensagem "0 8 * * *" Bom dia!', handler:admin.agendarMensagem, minLevel:LEVELS.BOT_ADMIN});
  r({name:'autoreply',  aliases:['addreply'],   description:'Adicionar auto-reply',category:'admin',  usage:'!autoreply gatilho | resposta',          example:'!autoreply oi | Olá! 🐺',    handler:admin.addAutoReply,   minLevel:LEVELS.GROUP_ADMIN});
  r({name:'removeautoreply',                    description:'Remover auto-reply',  category:'admin',  usage:'!removeautoreply [ID]',                  example:'!removeautoreply 3',          handler:admin.removeAutoReply,minLevel:LEVELS.GROUP_ADMIN});
  r({name:'ping',                               description:'Latência do bot',     category:'admin',  usage:'!ping',                                 example:'!ping',                       handler:admin.ping});
  r({name:'uptime',                             description:'Tempo online',        category:'admin',  usage:'!uptime',                               example:'!uptime',                     handler:admin.uptime});
  r({name:'plugins',                            description:'Listar plugins',      category:'admin',  usage:'!plugins',                              example:'!plugins',                    handler:admin.plugins});
}

module.exports = { loadAllCommands };
