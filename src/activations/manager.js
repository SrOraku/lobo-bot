'use strict';
const registry = require('./registry');
const { change } = require('./policy');
function groupId(value) {
  if (typeof value !== 'string' || !/^\d+(?:-\d+)?@g\.us$/.test(value))
    throw Error('Grupo inválido.');
  return value;
}
function createManager(store) {
  const repository = () => store || require('./store').getStore();
  function states(jid) {
    const p = repository().get(jid);
    return registry.list().map((f) => ({
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
    const p = repository().get(jid);
    return f.source === 'sector'
      ? p.bot && p.sectors[f.id] !== 'off'
      : Object.hasOwn(p.features, f.id)
        ? !!p.features[f.id]
        : f.default;
  }
  async function set(jid, names, enabled, { actor, botAdmin = false, options = {} } = {}) {
    groupId(jid);
    if (Object.hasOwn(options, 'inactivity_days') && (!Number.isInteger(options.inactivity_days) || options.inactivity_days < 1 || options.inactivity_days > 90))
      throw Error('Informe um número inteiro de 1 a 90 dias.');
    if (!actor?.owner && !actor?.admin)
      throw Error('Somente administradores do grupo ou donos podem alterar ativações.');
    const defs = names.map((name) => {
      const f = registry.feature(name);
      if (!f) throw Error('Ativação não encontrada. Use o painel de ativações.');
      return f;
    });
    const changed = [],
      unchanged = [];
    const result = repository().update(jid, actor.phone || actor.jid || 'administrador', (current) => {
      for (const f of defs) {
        if (!actor.owner && ['off', 'dono'].includes(current.sectors.adm))
          throw Error('O dono restringiu as configurações administrativas deste grupo.');
        if (enabled && f.botAdminRequired && !botAdmin)
          throw Error('Esta função exige que o bot seja administrador do grupo.');
        const previous =
          f.source === 'sector' ? current.sectors[f.id] !== 'off' : !!current.features[f.id];
        if (f.source === 'sector') {
          const oldMode = current.sectors[f.id] || 'membros';
          const remembered = current.options?.sector_modes?.[f.id] || 'membros';
          const next = change(current, {
            action: 'set',
            target: f.id,
            value: enabled ? (previous ? oldMode : remembered) : 'off',
            ...actor,
          });
          if (previous !== enabled) {
            if (!enabled)
              next.options = {
                ...next.options,
                sector_modes: { ...next.options?.sector_modes, [f.id]: oldMode },
              };
            current = next;
          }
        } else {
          current.features[f.id] = enabled;
          if (!enabled)
            for (const dependent of registry.list())
              if (dependent.dependencies?.includes(f.id)) current.features[dependent.id] = false;
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
          .filter((f) => ctx.actor.owner || f.source !== 'sector')
          .map((f) => f.id),
        enabled,
        ctx,
      ),
  };
}
module.exports = { createManager, manager: createManager(), groupId };
