'use strict';
// Registry validation needs real modules but never opens WhatsApp.
const {loadAllCommands}=require('../src/handlers/commands');
loadAllCommands();
const registry=require('../src/core/commandRegistry').registry;
for(const command of ['conquistas','carreira','investir','banco','escudo','boosts','streak','atividadegrupo','surpresa','2048','gartic','antipv','lastfm','transcrever','atualizarbot'])if(typeof registry.get(command)?.handler!=='function')throw Error('Comando essencial ausente: '+command);
console.log('✅ Registro de comandos da expansão validado. Não houve conexão ao WhatsApp.');
