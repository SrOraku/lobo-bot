'use strict';
const PERMISSIONS=new Set(['database','send_messages','filesystem','network','events']);
function validatePlugin(plugin) {
 if(!plugin || typeof plugin.name!=='string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(plugin.name)) throw Error('Nome de plugin inválido.');
 if(plugin.version && !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(plugin.version)) throw Error('Versão de plugin inválida.');
 if(plugin.permissions && (!Array.isArray(plugin.permissions)||plugin.permissions.some(p=>!PERMISSIONS.has(p)))) throw Error('Permissões de plugin inválidas.');
 for(const hook of ['onLoad','onUnload']) if(plugin[hook]!=null && typeof plugin[hook]!=='function') throw Error('Hook inválido: '+hook);
 if(plugin.commands!=null && (typeof plugin.commands!=='object'||Array.isArray(plugin.commands))) throw Error('Comandos do plugin inválidos.');
 for(const [name,handler] of Object.entries(plugin.commands || {})) if(!/^[a-z0-9][a-z0-9_-]*$/i.test(name)||typeof handler!=='function') throw Error('Comando de plugin inválido: '+name);
 return {legacy:!plugin.permissions};
}
function mergeCommands(plugins, official=new Set()) {
 const commands=Object.create(null),owners=new Map();
 for(const plugin of plugins) for(const [name,handler] of Object.entries(plugin.commands || {})) {
   if(official.has(name) || owners.has(name)) throw Error('Colisão de comando: '+name+' ('+(owners.get(name)||'oficial')+' / '+plugin.name+')');
   commands[name]=handler;owners.set(name,plugin.name);
 }
 return commands;
}
module.exports={validatePlugin,mergeCommands};
