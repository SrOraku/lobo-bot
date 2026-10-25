'use strict';
const CATEGORIES = Object.freeze({
  jogos: '🎮 JOGOS',
  alcateia: '🐺 100 LOBISOMENS',
  midia: '🎬 MÍDIA & DOWNLOADS',
  adm: '🛡️ ADMINISTRAÇÃO',
  seguranca: '🛡️ LOBO SECURITY',
  dono: '👑 DONO',
  util: '🧰 UTILIDADES',
  figurinhas: '✨ FIGURINHAS MÍSTICAS',
  pesquisa: '🔎 PESQUISAS',
  ia: '🧠 INTELIGÊNCIA ARTIFICIAL',
  diversao: '🎭 DIVERSÃO & INTERAÇÃO',
  grupo: '👥 GRUPO',
  info: '📡 INFORMAÇÕES',
  ferramentas: '⚙️ FERRAMENTAS',
  rp: '🏙️ ROLEPLAY',
  economia: '💰 ECONOMIA',
  trabalho: '💼 TRABALHO',
  conquistas: '🏆 CONQUISTAS',
  gartic: '🎨 GARTIC',
});
const CATEGORY_ALIASES = {
  gold: 'economia',
  wok: 'economia',
  wokcoin: 'economia',
  lobos: 'alcateia',
  lobo: 'alcateia',
  mod: 'adm',
  moderacao: 'adm',
  media: 'midia',
  fun: 'diversao',
};
const GROUPS = {
  alcateia: 'estrategia mudar atacar lobos ranklobos curarlobos infolobos',
  adm: 'ativacoes ban unban mute unmute kick add promover rebaixar abrirgrupo fechargrupo antilink antifake anticontato antimarcacao antiinatividade limparinatividade marcartodos resetarlobos agendarmensagem autoreply removeautoreply',
  economia: 'gold enviargold rankgold daily loja comprar premiun',
  rp: 'level perfil ranking',
  grupo: 'estatisticas',
  pesquisa: 'spotify',
  midia: 'play ytmp3 ytmp4 tiktok ig',
  figurinhas: 'sticker stickeranim toimg',
  diversao: 'dado moeda 8ball piada fato sorteio azar escolher ship',
  jogos: 'akinator',
  dono: 'atualizar addadmin removeadmin broadcast',
  info: 'ping uptime plugins',
};
const ADDON = {
  alcateia: ['alcateia', 'menu / start / treino / ataque…', 'Central de comandos da alcateia'],
  start: ['alcateia', '', 'Cadastro manual opcional; entrada automática'],
  perfilalcateia: ['alcateia', '', 'Perfil dos lobisomens'],
  treino: ['alcateia', '', 'Treinar; intervalo de 1 hora'],
  formacao: ['alcateia', 'A/D/C quantidade', 'Distribuir lobisomens'],
  ataque: ['alcateia', '@jogador', 'Batalha imediata'],
  rank: ['alcateia', '', 'Top 10'],
  lojaalcateia: ['alcateia', '', 'Loja de boosts • WoK coin'],
  compraralcateia: ['alcateia', '1/2/3/4', 'Comprar boost ou treino'],
  clan: ['alcateia', 'criar Nome | entrar Nome | perfil', 'Clãs e liderança'],
  evento: ['alcateia', '', 'Evento lunar diário'],
  admin: [
    'dono',
    'status | addmoedas | removemoedas | ban | unban | backup | broadcast | resetcooldown | sethp | addlobos',
    'Administração dos jogos; donos do jogo',
  ],
  rp: ['rp', 'perfil | menu | iniciar', 'Personagem automático; início manual opcional'],
  profissoes: ['rp', '[categoria] [página]', 'Catálogo de 64 profissões'],
  profissao: ['rp', 'ID/nome', 'Escolher carreira'],
  trabalhar: ['rp', '', 'Trabalhar e ganhar WoK coin'],
  acao: ['rp', '[@jogador]', 'Exercer profissão'],
  carteira: ['economia', '', 'Saldo universal de WoK coin'],
  transferir: ['economia', '@jogador quantidade', 'Transferir WoK coin'],
  rploja: ['economia', '[página]', 'Loja RP; alimentos, casas e veículos'],
  rpcomprar: ['economia', 'ITEM [quantidade]', 'Comprar na loja RP'],
  usar: ['rp', 'ITEM [@destinatário]', 'Usar item ou entregar presente'],
  inventario: ['rp', '', 'Pertences RP'],
  familia: [
    'rp',
    'criar | convidar | casar | aceitar | recusar | perfil | sair | divorciar | depositar | retirar',
    'Família, casamento e tesouro',
  ],
  olamundo: ['util', '', 'Saudação do plugin'],
};
const DETAILS = {
  admin: [
    'status',
    'addmoedas NUMERO quantidade',
    'removemoedas NUMERO quantidade',
    'ban NUMERO',
    'unban NUMERO',
    'backup',
    'broadcast mensagem',
    'resetcooldown NUMERO',
    'sethp NUMERO 0–100',
    'addlobos NUMERO quantidade',
  ],
  familia: [
    'criar Nome',
    'perfil',
    'convidar @jogador parente/filho/irmao',
    'casar @jogador',
    'aceitar ID',
    'recusar ID',
    'sair',
    'divorciar',
    'depositar quantidade',
    'retirar quantidade',
  ],
  clan: ['criar Nome', 'entrar Nome', 'perfil'],
  rp: ['iniciar', 'perfil', 'menu'],
};
function categoryOf(command) {
  if (command.minLevel === 3) return 'dono';
  for (const [category, names] of Object.entries(GROUPS))
    if (names.split(' ').includes(command.name)) return category;
  if (command.minLevel > 0) return 'adm';
  return CATEGORIES[command.category] ? command.category : 'util';
}
function buildCatalog(commands, pluginCommands = {}) {
  const catalog = commands
    .filter((c) => !c.menuShortcut && c.name !== 'menu')
    .map((c) => ({
      ...c,
      category: categoryOf(c),
      source: 'core',
      status: 'registrado',
      permission:
        c.name === 'atualizar'
          ? 'dono (identidade verificada)'
          : c.activationControl ? 'dono/admin do grupo; controle delegado' : ['usuário', 'admin do grupo', 'admin do bot', 'dono'][c.minLevel || 0],
    }));
  const occupied = new Set(commands.flatMap((c) => [c.name, ...(c.aliases || [])]));
  for (const name of Object.keys(pluginCommands)) {
    if (occupied.has(name)) continue;
    const [category, args, description] = ADDON[name] || ['util', '', 'Comando de plugin'];
    catalog.push({
      name,
      category,
      description,
      details: DETAILS[name],
      usage: `!${name}${DETAILS[name] ? '' : args ? ' ' + args : ''}`,
      aliases: [],
      minLevel: 0,
      groupOnly: false,
      source: name === 'olamundo' ? 'plugin exemplo' : 'plugin alcateia/RP',
      status: 'carregado',
      permission: name === 'admin' ? 'donos do jogo' : 'usuário; regras do jogo',
    });
  }
  return catalog;
}
module.exports = { CATEGORIES, CATEGORY_ALIASES, ADDON, buildCatalog, categoryOf };
