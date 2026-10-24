'use strict';
module.exports=[{
  files:['src/security/groups/*.js','src/commands/security.js','src/progression/*.js','src/economy/*.js','src/automation/*.js','src/events/*.js','src/games/modules/*.js','src/games/registry.js','src/services/lastfm.js','src/services/transcription.js','src/updater/health.js','src/updater/integrity.js','src/services/universal-currency.js','src/handlers/autoDownload.js','src/integrations/bronxys/*.js','src/commands/bronxys-config.js','src/services/economy.js','src/core/keyed-queue.js','src/core/plugin-contract.js','src/middlewares/command-limits.js'],
  languageOptions:{ecmaVersion:2022,sourceType:'commonjs',globals:{require:'readonly',module:'readonly',process:'readonly',Buffer:'readonly',URL:'readonly',AbortController:'readonly',setTimeout:'readonly',clearTimeout:'readonly',setInterval:'readonly',clearInterval:'readonly',__dirname:'readonly',structuredClone:'readonly'}},
  rules:{'no-undef':'error','no-unused-vars':'error','no-dupe-keys':'error','no-unreachable':'error','eqeqeq':['error','always',{null:'ignore'}]},
}];
