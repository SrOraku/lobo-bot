'use strict';

const { bus, EVENTS } = require('../src/core/eventBus');
const { controlCenter } = require('../src/integrations/control-center');
const config = require('../src/config');

let messageListener = null;
let readyListener = null;

module.exports = {
  name: 'control-center',
  description: 'Integra o Lobo Bot à central de instalações, licenças, heartbeat e auditoria.',
  version: '1.0.0',
  permissions: ['network', 'events'],
  commands: {},

  async onLoad(sock) {
    const service = controlCenter();
    await service.start(sock);

    readyListener = () => service.start(sock).catch(() => {});
    messageListener = ({ jid, isGroup, body }) => {
      if (!isGroup || typeof body !== 'string') return;
      const prefix = config.get('PREFIX') || '!';
      if (!body.startsWith(prefix)) return;
      const command = body.slice(prefix.length).trim().split(/\s+/, 1)[0]?.toLowerCase();
      if (command) service.recordCommand(jid, command, 'attempt');
    };

    bus.on(EVENTS.BOT_READY, readyListener);
    bus.on(EVENTS.MESSAGE_RECEIVED, messageListener);
  },

  async onUnload() {
    const service = controlCenter();
    if (readyListener) bus.off(EVENTS.BOT_READY, readyListener);
    if (messageListener) bus.off(EVENTS.MESSAGE_RECEIVED, messageListener);
    readyListener = null;
    messageListener = null;
    service.stop();
  },
};
