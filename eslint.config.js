'use strict';
module.exports=[{
  files:['src/services/economy.js','src/core/keyed-queue.js','src/core/plugin-contract.js','src/middlewares/command-limits.js'],
  languageOptions:{ecmaVersion:2022,sourceType:'commonjs',globals:{require:'readonly',module:'readonly'}},
  rules:{'no-undef':'error','no-unused-vars':'error','no-dupe-keys':'error','no-unreachable':'error','eqeqeq':['error','always',{null:'ignore'}]},
}];
