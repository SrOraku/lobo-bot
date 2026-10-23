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
    ...feature,
  });
  for (const alias of [item.id, ...item.aliases]) {
    const key = String(alias).toLowerCase();
    if (aliases.has(key)) throw Error('Alias duplicado de ativação.');
    aliases.set(key, item.id);
  }
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
  ['antilink', 'AntiLink', 'antilink', ['anti-link']],
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
  ['antilinkgrupo', 'AntiLink de grupos', ['anticonvite']],
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
  { aliases: ['welcome', 'bem-vindo'], legacyColumn: 'welcome', default: true, bulkSafe: true },
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
module.exports = { registerFeature, feature, list };
