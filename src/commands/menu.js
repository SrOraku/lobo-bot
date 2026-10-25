'use strict';
const config = require('../config');
const { CATEGORIES, CATEGORY_ALIASES, buildCatalog } = require('../menus/catalog');
const { IDENTITY, frameMenu, clean, uptime } = require('../menus/render');
const { version } = require('../../package.json');
const { block, command, mono, greeting, clock, center } = require('../ui/text');
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
      ([key, title]) => `${title.split(' ')[0]} ${command(p + 'menu ' + key)}`,
    );
    let title, sections;
    if (!category) {
      title = 'MENU PRINCIPAL DA MATILHA';
      sections = [
        `${center('_' + greeting(instant) + ', lobo(a)!_')}\n👤 *Usuário:* ${clean(ctx.pushName || 'Lobo')}\n${[ctx.senderLevelName || ['Membro', 'Admin do grupo', 'Admin do bot', 'Dono'][ctx.senderLevel], ctx.user?.level !== undefined ? '*Nível:* ' + mono(ctx.user.level) : null, ctx.user?.gold !== undefined ? '*WoK coin:* ' + mono(ctx.user.gold) : null, ctx.user?.xp !== undefined ? '*XP:* ' + mono(ctx.user.xp) : null].filter(Boolean).join(' • ')}\n🕒 *Hora:* ${mono(clock(instant))}${ctx.ping !== undefined ? ' • *Ping:* ' + mono(ctx.ping + ' ms') : ''}`,
        block('CATEGORIAS', categoryLines),
        `> 📖 _Escolha uma categoria com_ ${command(p + 'menu categoria')}.\n> ⚡ ${command(p + 'atalhos')} — _versões abreviadas._`,
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
          `🐺 100 Lobisomens — estratégia e batalhas\n↳ ${p}menu alcateia\n🏙️ Cidade RP — profissões e família\n↳ ${p}menu rp`,
        );
      if (category === 'alcateia') {
        sections = [
          `🐺 *ALCATEIA • WoK coin*\n${lines.filter((_, i) => entries[i].source !== 'core').join('\n')}`,
          `⚔️ *100 LOBOS ORIGINAIS*\n${lines.filter((_, i) => entries[i].source === 'core').join('\n')}`,
          `💰 WoK coin é a moeda única de todos os sistemas.\n👑 Administração dos jogos: ${p}menu dono`,
        ];
      }
      if (category === 'rp') sections.push(`💰 Compras e transferências: ${p}menu economia`);
      if (category === 'economia')
        sections.push(
          `💎 WoK coin: uma carteira para economia, RP e Alcateia.\n🐺 Boosts exclusivos: ${p}menu alcateia`,
        );
      if (category === 'dono')
        sections.push(
          '👑 A lista não concede acesso: cada comando mantém sua verificação de dono.',
        );
      if (category === 'grupo')
        sections.push(
          '🌙 Bem-vindo com imagem e despedida são automáticos quando habilitados; não possuem comando próprio.',
        );
      if (category === 'info')
        sections.push(
          `⭐ *Versão:* ${mono(version)}\n⏱️ *Uptime:* ${mono(uptime(online()))}\n📜 *Comandos:* ${mono(all.length)}\n👑 *Dono:* ${mono('+' + config.get('BOT_OWNER'))}\n📞 ${mono('+5543920030769')}`,
        );
      sections = [`${center('_' + greeting(instant) + ', lobo(a)!_')}\n👤 *Usuário:* ${clean(ctx.pushName || 'Lobo')}\n${[ctx.senderLevelName || ['Membro', 'Admin do grupo', 'Admin do bot', 'Dono'][ctx.senderLevel], ctx.user?.level !== undefined ? '*Nível:* ' + mono(ctx.user.level) : null, ctx.user?.gold !== undefined ? '*WoK coin:* ' + mono(ctx.user.gold) : null, ctx.user?.xp !== undefined ? '*XP:* ' + mono(ctx.user.xp) : null].filter(Boolean).join(' • ')}\n🕒 *Hora:* ${mono(clock(instant))}${ctx.ping !== undefined ? ' • *Ping:* ' + mono(ctx.ping + ' ms') : ''}`, block('COMANDOS', sections), `> 📖 _Volte à matilha com_ ${command(p + 'menu')}.`];
    }
    return require('../menus/media').sendMenu(sock,ctx,frameMenu(title,sections));
  };
}
const menu = createMenu();
module.exports = { menu, createMenu, getCatalog };
