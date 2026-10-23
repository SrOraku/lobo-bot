'use strict';
function installQuietConsole(target = console) {
  const original = Object.fromEntries(['log','info','debug','warn','error'].map(name => [name, target[name].bind(target)]));
  for (const name of ['log','info','debug','warn']) target[name] = () => {};
  target.error = (...args) => original.error(...args.map(value => {
    if (value instanceof Error) return value.stack || value.message;
    if (value && typeof value === 'object') return '[detalhes internos omitidos]';
    return value;
  }));
  return {
    interactive: (...args) => original.log(...args),
    restore: () => { for (const name of Object.keys(original)) target[name] = original[name]; },
  };
}
module.exports = { installQuietConsole };
