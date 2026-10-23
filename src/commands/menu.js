'use strict';
const config = require('../config');
const { CATEGORIES, CATEGORY_ALIASES, buildCatalog } = require('../menus/catalog');
const { IDENTITY, frameMenu, clean, uptime } = require('../menus/render');
const { version } = require('../../package.json');
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
} = {}) {
  return async function menu(sock, ctx) {
    const p = prefix(),
      all = catalog();
    const raw = String(ctx.args?.[0] || '').toLowerCase();
    const category = CATEGORY_ALIASES[raw] || raw;
    const categoryLines = Object.entries(CATEGORIES).map(
      ([key, title]) => `┃ ${title.split(' ')[0]} *${p}menu ${key}*`,
    );
    let title, sections;
    if (!category) {
      title = 'MENU PRINCIPAL DA MATILHA';
      sections = [
        `👤 *Usuário:* ${clean(ctx.pushName || IDENTITY.developer)}`,
        `╭─── ❖ *CATEGORIAS* ❖ ───╮\n${categoryLines.join('\n')}\n╰────────────────────╯`,
        `📖 _Use ${p}menu + categoria para visualizar seus comandos._`,
      ];
    } else if (!CATEGORIES[category]) {
      title = 'CATEGORIA NÃO ENCONTRADA';
      sections = ['🐾 Escolha uma das categorias válidas:', categoryLines.join('\n')];
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
        return `┃ 🐾 *${usage}* — _${c.description}_${flags ? ` [${flags}]` : ''}${c.aliases?.length ? `\n┃ ↳ ${c.aliases.map((a) => '*' + p + a + '*').join(' • ')}` : ''}${c.details?.length ? '\n' + c.details.map((row) => '┃ ↳ *' + p + c.name + ' ' + row + '*').join('\n') : ''}`;
      });
      sections = [
        lines.length ? lines.join('\n') : '🐾 Nenhum comando desta categoria está instalado.',
      ];
      if (category === 'jogos')
        sections.push(
          `🐺 100 Lobisomens — estratégia e batalhas\n↳ ${p}menu alcateia\n🏙️ Cidade RP — profissões e família\n↳ ${p}menu rp`,
        );
      if (category === 'alcateia') {
        sections = [
          `🐺 *ALCATEIA WOK COIN*\n${lines.filter((_, i) => entries[i].source !== 'core').join('\n')}`,
          `⚔️ *100 LOBOS ORIGINAIS*\n${lines.filter((_, i) => entries[i].source === 'core').join('\n')}`,
          `💰 Gold original e WOK Coin são separados.\n👑 Administração dos jogos: ${p}menu dono`,
        ];
      }
      if (category === 'rp') sections.push(`💰 Compras e transferências: ${p}menu economia`);
      if (category === 'economia')
        sections.push(
          `💎 WOK Coin: RP e nova alcateia compartilham a carteira.\n💰 Gold: saldo original separado.\n🐺 Boosts exclusivos: ${p}menu alcateia`,
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
          `⭐ Versão: ${version}\n⏱️ Uptime: ${uptime(online())}\n📜 Comandos: ${all.length}\n👑 Dono: +${config.get('BOT_OWNER')}\n📞 +5543920030769`,
        );
      sections = [`👤 *Usuário:* ${clean(ctx.pushName || IDENTITY.developer)}`, `╭─── ❖ *COMANDOS* ❖ ───╮\n${sections.join('\n\n')}\n╰────────────────────╯`, `📖 _Digite ${p}menu para voltar ao Menu Principal._`];
    }
    return sock.sendMessage(ctx.jid, { text: frameMenu(title, sections) }, { quoted: ctx.msg });
  };
}
const menu = createMenu();
module.exports = { menu, createMenu, getCatalog };
