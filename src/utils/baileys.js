'use strict';

let baileysModulePromise = null;

function loadBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys');
  }
  return baileysModulePromise;
}

module.exports = {
  loadBaileys
};
