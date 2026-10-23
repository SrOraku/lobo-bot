'use strict';
// Inspeciona os contratos reais de registro sem abrir sessão ou bancos de dados.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildCatalog, CATEGORIES } = require('../src/menus/catalog');
const root = path.join(__dirname, '..'),
  registry = new Map();
function register(def) {
  def = { aliases: [], minLevel: 0, groupOnly: false, ...def };
  registry.set(def.name, def);
  for (const alias of def.aliases || []) registry.set(alias, def);
}
const exported = { exports: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(root, 'src/handlers/commands.js'), 'utf8'),
  {
    module: exported,
    require(id) {
      if (id === '../core/commandRegistry') return { register, registry };
      if (id === '../middlewares/permissions')
        return { LEVELS: { USER: 0, GROUP_ADMIN: 1, BOT_ADMIN: 2, OWNER: 3 } };
      if (id === '../menus/catalog') return { CATEGORIES };
      if (id === '../activations/registry') return require('../src/activations/registry');
      if (id === '../commands/arcade') return { createArcadeCommand: () => Object.assign(async () => {}, {auditFile:'src/commands/arcade.js',auditExport:'createArcadeCommand'}) };
      if (id === '../commands/warnings') return { createWarningCommand: () => Object.assign(async () => {}, {auditFile:'src/commands/warnings.js',auditExport:'createWarningCommand'}) };
      if (id === '../commands/activations') {
        const handler=()=>Object.assign(async()=>{}, {auditFile:'src/commands/activations.js',auditExport:'activations'});
        return {activations:handler(),createActivationHandler:handler};
      }
      return new Proxy(
        {},
        {
          get: (_, name) =>
            Object.assign(async () => {}, {
              auditFile: 'src/' + id.replace('../', '') + '.js',
              auditExport: String(name),
            }),
        },
      );
    },
  },
  { filename: 'commands-audit.js' },
);
exported.exports.loadAllCommands();
const commands = [...new Set(registry.values())].map((c) => ({
  ...c,
  file: c.handler.auditFile || 'src/commands/menu.js',
  export: c.handler.auditExport || 'menu',
}));
const plugins = {
  ...require('../plugins/alcateia-rp').commands,
  ...require('../plugins/exemplo-plugin').commands,
};
const catalog = buildCatalog(commands, plugins).map(({ handler, ...c }) => {
  const file = c.file || (c.name === 'olamundo' ? 'plugins/exemplo-plugin.js' : 'plugins/alcateia-rp.js');
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const dependencies = [...new Set([...text.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1]))];
  return {...c, file, dependencies};
});
const report = {
  totalCommands: catalog.length,
  totalAliases: catalog.reduce((n, c) => n + c.aliases.length, 0),
  navigationCommands: commands.filter((c) => c.menuShortcut).map((c) => c.name),
  categories: Object.keys(CATEGORIES),
  runtimeDependencies: require('../package.json').dependencies,
  commands: catalog,
};
if (require.main === module) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
module.exports = report;
