'use strict';
// Aviso de "bot no ar" no console da hospedagem.
//
// Primeira conexão do processo: cabeçalho com o resumo da instalação.
// Reconexões: uma linha só. Antes disso, uma listagem dos grupos alimenta os
// nomes mostrados no console, sem segurar o início além de `wait`.
function createOnlineNotice({ print, logConnection, groupNames, config, commandsCount = () => null,
  ui = require('../ui/console'), wait = 4000, now = Date.now, color = () => ui.colorEnabled() }) {
  let shown = false;
  return async function announceOnline(sock, user) {
    let timer;
    const listed = await Promise.race([
      Promise.resolve().then(() => groupNames.prime(sock)),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), wait); }),
    ]).catch(() => null);
    clearTimeout(timer);
    if (shown) { logConnection('ONLINE — WhatsApp conectado.'); return false; }
    shown = true;
    let commands = null;
    try { commands = commandsCount(); } catch { /* O total de comandos é só informativo. */ }
    const name = config.get('BOT_NAME');
    print(ui.createConsoleStyle({ color: color() === true }).banner({
      // O nome padrão usa símbolos que o painel não desenha; só um nome próprio aparece.
      name: name && name !== config.DEFAULTS?.BOT_NAME ? name : null,
      account: user?.id, groups: Number.isInteger(listed) ? listed : null, commands,
      prefix: config.get('PREFIX'), startedAt: now(),
    }));
    // O cabeçalho já diz ONLINE no console; o registro vai só para o arquivo de log.
    logConnection('ONLINE — WhatsApp conectado.', { silent: true });
    return true;
  };
}

module.exports = { createOnlineNotice };
