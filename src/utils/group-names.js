'use strict';
// Nomes dos grupos para o console.
//
// O banco só recebe o nome quando o grupo é renomeado, então a maioria dos
// grupos apareceria pelo identificador numérico. Este cache guarda os nomes em
// memória: uma listagem logo após conectar, os eventos de grupo e, para um
// grupo ainda desconhecido, uma consulta em segundo plano que nunca atrasa o
// comando. Nada aqui é obrigatório para o bot funcionar: qualquer falha só
// faz o console mostrar o final do identificador.

const isGroup = jid => typeof jid === 'string' && jid.endsWith('@g.us');

function createGroupNames({ now = Date.now, primeEvery = 10 * 60_000, retryEvery = 5 * 60_000, max = 5000 } = {}) {
  const names = new Map(), asked = new Map();
  let primedAt = null, priming = null;

  function remember(jid, subject) {
    if (!isGroup(jid)) return false;
    const name = String(subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!name) return false;
    if (!names.has(jid) && names.size >= max) names.delete(names.keys().next().value);
    names.set(jid, name);
    return true;
  }

  function nameOf(jid) { return names.get(jid) || null; }

  // Uma única consulta lista todos os grupos da conta. Reconexões em sequência
  // não repetem a listagem antes de `primeEvery`.
  function prime(sock) {
    if (typeof sock?.groupFetchAllParticipating !== 'function') return Promise.resolve(names.size);
    if (priming) return priming;
    if (primedAt !== null && now() - primedAt < primeEvery) return Promise.resolve(names.size);
    primedAt = now();
    priming = Promise.resolve()
      .then(() => sock.groupFetchAllParticipating())
      .then(groups => { for (const [jid, meta] of Object.entries(groups || {})) remember(jid, meta?.subject); })
      .catch(() => { primedAt = null; })
      .then(() => { priming = null; return names.size; });
    return priming;
  }

  // Grupo sem nome conhecido: busca em segundo plano para as próximas linhas.
  function lookup(sock, jid) {
    if (!isGroup(jid) || names.has(jid) || typeof sock?.groupMetadata !== 'function') return false;
    const last = asked.get(jid);
    if (last !== undefined && now() - last < retryEvery) return false;
    if (!asked.has(jid) && asked.size >= max) asked.delete(asked.keys().next().value);
    asked.set(jid, now());
    Promise.resolve().then(() => sock.groupMetadata(jid)).then(meta => { remember(jid, meta?.subject); }).catch(() => {});
    return true;
  }

  return { remember, nameOf, prime, lookup, size: () => names.size };
}

module.exports = { createGroupNames, groupNames: createGroupNames() };
