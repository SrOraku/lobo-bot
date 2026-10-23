'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
function chatId(value) {
  if (typeof value === 'string')
    value = value.replace(/:\d+@/, '@').replace(/@c\.us$/, '@s.whatsapp.net');
  if (typeof value !== 'string' || !/^\d+(?:-\d+)?@(?:g\.us|s\.whatsapp\.net|lid)$/.test(value))
    throw Error('Chat inválido para isolamento.');
  return value;
}
function run(chat, callback) {
  return context.run(chatId(chat), callback);
}
function current() {
  return context.getStore() || null;
}
function cacheKey(key) {
  return current() ? current() + ':' + key : key;
}
module.exports = { run, current, cacheKey, chatId };
