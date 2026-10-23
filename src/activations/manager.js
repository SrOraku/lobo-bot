'use strict';
const registry = require('./registry');
function groupId(value) {
  if (typeof value !== 'string' || !/^\d+(?:-\d+)?@g\.us$/.test(value))
    throw Error('Grupo inválido.');
  return value;
}
function createManager(store) {
  const repository = () => store || require('./store').getStore();
  function states(jid) {
    const p = repository().get(jid);
    return registry.list().filter(f => f.source !== 'sector').map((f) => ({
      ...f,
      enabled:
        f.source === 'sector'
          ? !['off'].includes(p.sectors[f.id])
          : Object.hasOwn(p.features, f.id)
            ? !!p.features[f.id]
            : f.default,
      mode: f.source === 'sector' ? p.sectors[f.id] || 'membros' : null,
    }));
  }
  function isEnabled(jid, name) {
    if (!jid?.endsWith('@g.us')) return true;
    const f = registry.feature(name);
    if (!f) return false;
    if (f.source === 'sector') return true;
    const p = repository().get(jid);
    return f.source === 'sector'
      ? p.bot && p.sectors[f.id] !== 'off'
      : Object.hasOwn(p.features, f.id)
        ? !!p.features[f.id]
        : f.default;
  }
  async function set(jid, names, enabled, { actor, botAdmin = false, options = {} } = {}) {
    groupId(jid);
    if (typeof enabled !== 'boolean') throw Error('Estado de ativação inválido.');
    for (const [key, value] of Object.entries(options)) {
      if (['antilink_mode', 'antilinkgrupo_mode', 'antilinkexterno_mode'].includes(key)) {
        if (!['delete', 'warn', 'kick'].includes(value)) throw Error('Modo de moderação inválido.');
      } else if (key !== 'inactivity_days') throw Error('Opção de ativação desconhecida.');
    }
    if (Object.hasOwn(options, 'inactivity_days') && (!Number.isInteger(options.inactivity_days) || options.inactivity_days < 1 || options.inactivity_days > 90))
      throw Error('Informe um número inteiro de 1 a 90 dias.');
    if (!actor?.owner && !actor?.admin)
      throw Error('Somente administradores do grupo ou donos podem alterar ativações.');
    const defs = names.map((name) => {
      const f = registry.feature(name);
      if (!f) throw Error('Ativação não encontrada. Use o painel de ativações.');
      if (f.source === 'sector') throw Error('Setores são informativos e não podem ser alterados. Use o comando setores.');
      return f;
    });
    const changed = [],
      unchanged = [];
    const result = repository().update(jid, actor.phone || actor.jid || 'administrador', (current) => {
      for (const f of defs) {
        if (enabled && f.botAdminRequired && !botAdmin)
          throw Error('Esta função exige que o bot seja administrador do grupo.');
        const previous =
          f.source === 'sector' ? current.sectors[f.id] !== 'off' : !!current.features[f.id];
        if (enabled && typeof f.handler !== 'function') throw Error('Handler indisponível: ' + f.id);
        if (enabled && f.ownerOnly && !actor.owner) throw Error('Somente o dono pode ativar: ' + f.id);
        for (const other of enabled ? f.incompatibilities || [] : [])
          if (current.features[other]) throw Error('Desative primeiro o recurso incompatível: ' + other);
        current.features[f.id] = enabled;
        if (!enabled) {
          const disabled = new Set([f.id]);
          let expanded;
          do {
            expanded = false;
            for (const dependent of registry.list())
              if (!disabled.has(dependent.id) && dependent.dependencies?.some(id => disabled.has(id))) {
                current.features[dependent.id] = false;
                disabled.add(dependent.id);
                expanded = true;
              }
          } while (expanded);
        }
        for (const dependency of enabled ? f.dependencies || [] : [])
          if (!current.features[dependency])
            throw Error('Ative primeiro a dependência: ' + dependency);
        (previous === enabled ? unchanged : changed).push(f);
      }
      current.options = { ...current.options, ...options };
      return current;
    });
    return { changed, unchanged, policy: result };
  }
  return {
    diagnostics(jid, { botAdmin = false } = {}) {
      groupId(jid);
      return states(jid).map(f => ({ id: f.id, name: f.name, enabled: f.enabled,
        issues: [
          ...(typeof f.handler !== 'function' ? ['HANDLER_AUSENTE'] : []),
          ...(f.enabled && f.botAdminRequired && !botAdmin ? ['BOT_NAO_ADMIN'] : []),
          ...(f.enabled ? (f.dependencies || []).filter(id => !registry.feature(id) || !isEnabled(jid, id)).map(id => 'DEPENDENCIA:' + id) : []),
          ...(f.enabled ? (f.incompatibilities || []).filter(id => isEnabled(jid, id)).map(id => 'INCOMPATIVEL:' + id) : []),
        ],
      }));
    },
    isEnabled,
    getGroupFeatures: states,
    getEnabledFeatures: (jid) => states(jid).filter((f) => f.enabled),
    getDisabledFeatures: (jid) => states(jid).filter((f) => !f.enabled),
    enableFeature: (jid, name, ctx) => set(jid, [name], true, ctx),
    disableFeature: (jid, name, ctx) => set(jid, [name], false, ctx),
    toggleFeature: (jid, name, ctx) => set(jid, [name], !isEnabled(jid, name), ctx),
    set,
    bulk: (jid, enabled, ctx) =>
      set(
        jid,
        registry
          .list()
          .filter((f) => (enabled ? f.bulkSafe : true))
          .filter((f) => f.source !== 'sector')
          .map((f) => f.id),
        enabled,
        ctx,
      ),
  };
}
module.exports = { createManager, manager: createManager(), groupId };
