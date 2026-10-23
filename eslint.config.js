'use strict';
module.exports=[{
  files:['src/integrations/bronxys/*.js','src/commands/bronxys-config.js','src/services/economy.js','src/core/keyed-queue.js','src/core/plugin-contract.js','src/middlewares/command-limits.js'],
  languageOptions:{ecmaVersion:2022,sourceType:'commonjs',globals:{require:'readonly',module:'readonly',process:'readonly',Buffer:'readonly',URL:'readonly',AbortController:'readonly',setTimeout:'readonly',clearTimeout:'readonly',__dirname:'readonly'}},
  rules:{'no-undef':'error','no-unused-vars':'error','no-dupe-keys':'error','no-unreachable':'error','eqeqeq':['error','always',{null:'ignore'}]},
}];
