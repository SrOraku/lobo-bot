'use strict';
const config = require('../config');
const { CATEGORIES, CATEGORY_ALIASES, buildCatalog } = require('../menus/catalog');
const { frameMenu, clean, uptime } = require('../menus/render');
const { version } = require('../../package.json');
const { block, command, mono, greeting, clock, center } = require('../ui/text');
const CATEGORY_DESC = {
  jogos: 'Minijogos & torneios',
  alcateia: 'Batalhas & território',
  floresta: 'Ecossistema vivo do grupo',
  midia: 'Músicas & downloads',
  adm: 'Moderação & ordem',
  seguranca: 'Proteção avançada',
  dono: 'Painel do proprietário',
  util: 'Ferramentas úteis',
  figurinhas: 'Stickers & criações',
  pesquisa: 'Busca & descoberta',
  ia: 'IA & conversas',
  diversao: 'Brincadeiras & fun',
  grupo: 'Gestão do grupo',
  info: 'Status & versão',
  ferramentas: 'Conversores & técnicas',
  rp: 'Profissões & família',
  economia: 'WoK coin & loja',
  trabalho: 'Missões & renda',
  conquistas: 'Troféus & títulos',
  gartic: 'Desenho coletivo',
};
function getCatalog() {
  return buildCatalog(
    require('../core/commandRegistry').listAll(),
    require('../core/pluginLoader').getPluginCommands(),
  );
}
function createMenu({
  catalog = getCatalog,
  prefix = () => config.get('PREFIX'),
  online = () => process.uptime(),
  at = () => new Date(),
} = {}) {
  return async function menu(sock, ctx) {
    const p = prefix(),
      all = catalog();
    const instant = at();
    const raw = String(ctx.args?.[0] || '').toLowerCase();
    const category = CATEGORY_ALIASES[raw] || raw;
    const categoryLines = Object.entries(CATEGORIES).map(
      ([key, title]) => `${title.split(' ')[0]} *${p}menu ${key}* › _${CATEGORY_DESC[key] || key}_`,
    );
    let title, sections;
    if (!category) {
      title = 'MENU PRINCIPAL DA MATILHA';
      sections = [
        `${center('_' + greeting(instant) + ', lobo(a)!_')}\n👤 *Usuário:* ${clean(ctx.pushName || 'Lobo')}\n${[ctx.senderLevelName || ['Membro', 'Admin do grupo', 'Admin do bot', 'Dono'][ctx.senderLevel], ctx.user?.level !== undefined ? '*Nível:* ' + mono(ctx.user.level) : null, ctx.user?.gold !== undefined ? '*WoK coin:* ' + mono(ctx.user.gold) : null, ctx.user?.xp !== undefined ? '*XP:* ' + mono(ctx.user.xp) : null].filter(Boolean).join(' • ')}\n🕒 *Hora:* ${mono(clock(instant))}${ctx.ping !== undefined ? ' • *Ping:* ' + mono(ctx.ping + ' ms') : ''}`,
        block('CATEGORIAS', categoryLines),
        `> 🌹 _Escolha uma categoria acima — a alcateia uiva!_ 🐺\n> ⚡ ${command(p + 'atalhos')} — _versões compactas dos comandos._`,
      ];
    } else if (!CATEGORIES[category]) {
      title = 'CATEGORIA NÃO ENCONTRADA';
      sections = ['➤ Escolha uma das categorias válidas:', categoryLines.join('\n')];
    } else {
      title = CATEGORIES[category].replace(' ', ' MENU ');
      const entries = all.filter((c) => c.category === category);
      const lines = entries.map((c) => {
        const usage = (c.usage || `!${c.name}`).replace(/^!\S+/, () => p + c.name);
        const flags = [
          c.permission && !c.permission.startsWith('usuário') ? c.permission : '',
          c.groupOnly ? 'grupo' : '',
        ]
          .filter(Boolean)
          .join(' • ');
        return `     ▸ ${command(usage)}\n       _${c.description}${flags ? ` • ${flags}` : ''}_${c.aliases?.length ? `\n       ↳ ${c.aliases.map((a) => command(p + a)).join(' • ')}` : ''}${c.details?.length ? '\n' + c.details.map((row) => '│   ▸ ' + command(p + c.name + ' ' + row)).join('\n') : ''}`;
      });
      sections = [
        lines.length ? lines.join('\n') : '➤ Nenhum comando desta categoria está instalado.',
      ];
      if (category === 'jogos')
        sections.push(
          `🐺 100 Lobisomens — estratégia, batalhas e guerras\n↳ ${p}menu alcateia\n🌲 Floresta Viva — ecossistema vivo do grupo\n↳ ${p}menu floresta\n🏙️ Cidade RP — profissões, família e riqueza\n↳ ${p}menu rp`,
        );
      if (category === 'alcateia') {
        sections = [
          `🐺 *ALCATEIA • WoK coin*\n${lines.filter((_, i) => entries[i].source !== 'core').join('\n')}`,
          `⚔️ *100 LOBOS ORIGINAIS*\n${lines.filter((_, i) => entries[i].source === 'core').join('\n')}`,
          `💰 WoK coin é a moeda única de todos os sistemas.\n👑 Administração dos jogos: ${p}menu dono\n🌕 Fase lunar atual e efeitos: ${p}lua`,
        ];
      }
      if (category === 'floresta')
        sections.push(
          `🌲 _Um ecossistema que vive sozinho: presas, vegetação, lobos selvagens e caçadores mudam a cada hora._\n💧 _As conversas do grupo são a chuva que rega a floresta._\n${p}floresta • 🦌✨ _Equilíbrio duradouro atrai o Cervo Branco._`,
        );
      if (category === 'rp') sections.push(`💰 Compras e transferências: ${p}menu economia\n🐺 Lobisomens e batalhas: ${p}menu alcateia`);
      if (category === 'economia')
        sections.push(
          `💎 WoK coin: uma carteira para economia, RP e Alcateia.\n🐺 Boosts de batalha: ${p}menu alcateia › ${p}loja batalha`,
        );
      if (category === 'dono')
        sections.push(
          '👑 A lista não concede acesso: cada comando mantém sua verificação de dono.',
        );
      if (category === 'grupo')
        sections.push(
          '🌙 Bem-vindo com imagem e despedida são automáticos quando habilitados; não possuem comando próprio.',
        );
      if (category === 'conquistas')
        sections.push(
          `🏆 _Conquistas são desbloqueadas automaticamente ao jogar._\n⭐ _Equipe um título com_ ${p}equip ID _para exibi-lo no perfil._`,
        );
      if (category === 'gartic')
        sections.push(
          '🎨 _Desenhe e adivinhe em tempo real com o grupo._\n🖌️ _Dicas, palpites e rodadas acontecem automaticamente!_',
        );
      if (category === 'diversao')
        sections.push(
          '🎭 _Brincadeiras leves para animar qualquer conversa._\n🎲 _Sorteios, moeda, 8ball, ship e muito mais!_',
        );
      if (category === 'figurinhas')
        sections.push(
          '✨ _Crie stickers a partir de imagens, vídeos e emojis._\n🎭 _Stickers animados e planos de fundo também!_',
        );
      if (category === 'midia')
        sections.push(
          '🎬 _Download de músicas e vídeos do YouTube, TikTok, Instagram e mais._\n🎵 _Áudio entregue diretamente no grupo!_',
        );
      if (category === 'info')
        sections.push(
          `⭐ *Versão:* ${mono(version)}\n⏱️ *Uptime:* ${mono(uptime(online()))}\n📜 *Comandos:* ${mono(all.length)}\n🧑‍💻 *Criador:* ${p}criador`,
        );
      sections = [`${center('_' + greeting(instant) + ', lobo(a)!_')}\n👤 *Usuário:* ${clean(ctx.pushName || 'Lobo')}\n${[ctx.senderLevelName || ['Membro', 'Admin do grupo', 'Admin do bot', 'Dono'][ctx.senderLevel], ctx.user?.level !== undefined ? '*Nível:* ' + mono(ctx.user.level) : null, ctx.user?.gold !== undefined ? '*WoK coin:* ' + mono(ctx.user.gold) : null, ctx.user?.xp !== undefined ? '*XP:* ' + mono(ctx.user.xp) : null].filter(Boolean).join(' • ')}\n🕒 *Hora:* ${mono(clock(instant))}${ctx.ping !== undefined ? ' • *Ping:* ' + mono(ctx.ping + ' ms') : ''}`, block('COMANDOS', sections), `> 🌹 _Volte ao menu principal:_ ${command(p + 'menu')} 🐺`];
    }
    const menuText = frameMenu(title,sections);
    return require('../menus/media').sendMenu(sock,ctx,menuText);
  };
}
const menu = createMenu();
module.exports = { menu, createMenu, getCatalog };
