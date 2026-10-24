'use strict';
const { CATEGORIES } = require('../menus/catalog');
const features = new Map(),
  aliases = new Map();
function registerFeature(feature) {
  if (
    !/^[a-z][a-z0-9_-]*$/.test(feature.id) ||
    features.has(feature.id) ||
    typeof feature.handler !== 'function'
  )
    throw Error('Registro de ativação inválido/duplicado.');
  const item = Object.freeze({
    aliases: [],
    default: false,
    adminOnly: true,
    botAdminRequired: false,
    bulkSafe: false,
    groupOnly: true,
    dependencies: [],
    incompatibilities: [],
    ...feature,
  });
  const keys = [item.id, ...item.aliases].map(alias => String(alias).trim().toLowerCase());
  if (new Set(keys).size !== keys.length || keys.some(key => !key || aliases.has(key)))
    throw Error('Alias duplicado de ativação.');
  // Validate the complete registration before mutating either index.
  for (const key of keys) aliases.set(key, item.id);
  features.set(item.id, item);
  return item;
}
function feature(name) {
  return features.get(
    aliases.get(
      String(name || '')
        .trim()
        .toLowerCase(),
    ),
  );
}
function list() {
  return [...features.values()];
}
function add(id, name, category, handler, options = {}) {
  return registerFeature({ id, name, description: name, category, handler, ...options });
}
const protection = (...args) => require('../handlers/protection').handleProtection(...args);
for (const [id, name, column, aka] of [
  ['antilink', 'AntiLink geral', 'antilink', ['anti-link', 'antilinkgeral']],
  ['antifake', 'AntiFake brasileiro', 'antifake', []],
  ['anticontato', 'AntiContato', 'anticontact', ['anticontact']],
  ['antimarcacao', 'AntiMarcação excessiva', 'antitag', ['antitag']],
])
  add(id, name, 'moderação', protection, {
    legacyColumn: column,
    aliases: aka,
    botAdminRequired: true,
  });
for (const [id, name, aka] of [
  ['antilinkgrupo', 'AntiLink de grupos WhatsApp', ['anticonvite', 'antilinkwhatsapp']],
  ['antilinkexterno', 'AntiLink externo', []],
  ['antispam', 'AntiMensagem repetida', ['antirepeticao']],
  ['antiflood', 'AntiFlood de mensagens', []],
  ['antilocalizacao', 'AntiLocalização', []],
  ['antidocumento', 'AntiDocumento', []],
  ['antiaudio', 'AntiÁudio', []],
  ['antivideo', 'AntiVídeo', []],
  ['antiimagem', 'AntiImagem', []],
  ['antisticker', 'AntiFigurinha', ['antifigurinha']],
  ['antiviewonce', 'AntiViewOnce', []],
])
  add(id, name, 'moderação', protection, { aliases: aka, botAdminRequired: true });
add(
  'antiinatividade',
  'Limpeza manual de inativos',
  'moderação',
  (...a) => require('../commands/moderation').limparInatividade(...a),
  {
    legacyColumn: 'antiinactivity',
    botAdminRequired: true,
    description: 'Habilita a limpeza por comando; não expulsa pessoas em segundo plano.',
  },
);
add(
  'bemvindo',
  'Bem-vindo com imagem',
  'grupo',
  (...a) => require('../handlers/groupEvents').handleGroupParticipantsUpdate(...a),
  { aliases: ['welcome', 'bem-vindo','boasvindas','boas-vindas'], legacyColumn: 'welcome', default: true, bulkSafe: true },
);
add(
  'despedida',
  'Despedida',
  'grupo',
  (...a) => require('../handlers/groupEvents').handleGroupParticipantsUpdate(...a),
  { aliases: ['goodbye', 'bye'], legacyColumn: 'goodbye', default: true, bulkSafe: true },
);
add(
  'autoresposta',
  'AutoResposta',
  'grupo',
  (...a) => require('../handlers/autoReply').handleAutoReply(...a),
  { aliases: ['autoreply'], legacyColumn: 'auto_reply', default: true, bulkSafe: true },
);
add('xp', 'Ganho de XP', 'sistemas', (...a) => require('../handlers/xp').handleXP(...a), {
  default: true,
  bulkSafe: true,
});
add('level', 'Aviso de nível', 'sistemas', (...a) => require('../handlers/xp').handleXP(...a), {
  legacyColumn: 'level_up_msg',
  default: true,
  bulkSafe: true,
  dependencies: ['xp'],
});
add('autodownload', 'Download automático de redes sociais', 'sistemas',
  (...args) => require('../handlers/autoDownload').handleAutoDownload(...args), {
    default: false, bulkSafe: false, aliases: ['autodl', 'autobaixar'],
    description: 'Baixa links públicos das redes suportadas pela API Bronxys.',
    isConfigured: () => !!require('../integrations/bronxys/key').getKey(),
  });
for (const id of [
  'jogos',
  'alcateia',
  'rp',
  'economia',
  'midia',
  'figurinhas',
  'pesquisa',
  'diversao',
  'grupo',
  'info',
  'util',
])
  add(id, CATEGORIES[id], 'setores', (...a) => require('../core/commandRegistry').execute(...a), {
    source: 'sector',
    default: true,
    bulkSafe: true,
    permission: 'delegated',
  });
for(const[id,name]of [['antiroubo','Anti-Roubo administrativo'],['antipromote','Anti-Promote'],['antidemote','Anti-Demote'],['antimasskick','Anti-remoção em massa'],['antimasspromote','Anti-promoção em massa'],['lockname','Nome protegido'],['lockdesc','Descrição protegida'],['lockpic','Foto protegida'],['antiedit','Anti-Edit'],['somenteadmins','Comandos somente para admins']])add(id,name,'LOBO SECURITY',(...args)=>require('../security/groups/service').security().engine.process(...args),{security:true,default:false,bulkSafe:false});
module.exports = { registerFeature, feature, list };
