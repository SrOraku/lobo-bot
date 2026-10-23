'use strict';
// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — SISTEMA DE PLUGINS
// ============================================================

const fs   = require('fs');
const path = require('path');
const { logger } = require('../config/logger');
const { bus, EVENTS } = require('./eventBus');
const db   = require('../utils/database');

const PLUGINS_DIR = path.join(__dirname, '../../plugins');
const loadedPlugins = new Map();

// Estrutura que um plugin deve exportar:
// module.exports = {
//   name: 'meu-plugin',
//   description: 'Descrição do plugin',
//   version: '1.0.0',
//   commands: { 'cmd': async (sock, ctx) => {} },
//   onLoad: async (sock) => {},
//   onUnload: async () => {},
// }

async function loadPlugin(pluginPath, sock) {
  try {
    const plugin = require(pluginPath);
    require('./plugin-contract').validatePlugin(plugin);
    const previous=loadedPlugins.get(plugin.name);
    if(previous) {
      if(previous.onUnload) await previous.onUnload();
      loadedPlugins.delete(plugin.name);
    }

    // Verificar se está habilitado no banco
    const record = db.db.prepare(`SELECT enabled FROM plugins WHERE name = ?`).get(plugin.name);
    if (record && !record.enabled) {
      logger.info(`🔌 Plugin "${plugin.name}" desabilitado — pulando`);
      return null;
    }

    // Registrar no banco
    db.db.prepare(`
      INSERT INTO plugins (name, enabled) VALUES (?, 1)
      ON CONFLICT(name) DO UPDATE SET updated_at = datetime('now')
    `).run(plugin.name);

    if (plugin.onLoad) await plugin.onLoad(sock);

    try {
      require('./plugin-contract').validatePlugin(plugin);
      require('./plugin-contract').mergeCommands([...loadedPlugins.values(),plugin],new Set(require('./commandRegistry').registry.keys()));
    } catch(error) { if(plugin.onUnload) await plugin.onUnload();throw error; }
    loadedPlugins.set(plugin.name, plugin);
    bus.emit(EVENTS.PLUGIN_LOADED, plugin.name);
    logger.info(`🌹 Plugin carregado: ${plugin.name} v${plugin.version || '?'}`);
    return plugin;
  } catch (err) {
    logger.error(`❌ Erro ao carregar plugin ${pluginPath}: ${err.message}`);
    return null;
  }
}

async function loadAllPlugins(sock) {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    logger.info('📂 Pasta plugins/ criada. Adicione seus plugins lá!');
    return;
  }

  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
  if (!files.length) { logger.info('📂 Nenhum plugin encontrado.'); return; }

  for (const file of files) {
    await loadPlugin(path.join(PLUGINS_DIR, file), sock);
  }
  logger.info(`🔌 ${loadedPlugins.size} plugin(s) carregado(s)`);
}

function getPluginCommands() {
  return require('./plugin-contract').mergeCommands(loadedPlugins.values());
}

function listPlugins() {
  return [...loadedPlugins.values()].map(p => ({
    name: p.name, version: p.version || '?', description: p.description || '',
  }));
}

module.exports = { loadAllPlugins, loadPlugin, getPluginCommands, listPlugins, loadedPlugins };
