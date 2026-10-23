'use strict';
function ownerNumbers(config = require('../config')) {
  const get = (key) => (typeof config.get === 'function' ? config.get(key) : config[key]);
  return [
    ...new Set(
      [get('BOT_OWNER'), get('BOT_OWNERS')]
        .flatMap((value) => String(value || '').split(/[,;\s]+/))
        .filter((value) => /^\+?\d{10,15}$/.test(value))
        .map((value) => value.replace(/^\+/, '')),
    ),
  ];
}
module.exports = { ownerNumbers };
