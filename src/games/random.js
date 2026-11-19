'use strict';
// Sorteio com semente para os minijogos.
//
// O motor injeta `pick` só no início da partida. Jogos que sorteiam durante a
// partida (2048, contas da matemática) guardam uma semente no próprio estado:
// a partida segue aleatória, sobrevive a reinícios (o estado é salvo em JSON)
// e os testes continuam determinísticos.

const MAX = 0x7fffffff;

/** Semente inicial a partir do sorteio do motor. */
function seed(pick) { return Number(pick(MAX)) >>> 0; }

// Partidas salvas antes desta versão não têm semente: deriva uma do estado.
function ensureSeed(state) {
  if (!Number.isInteger(state.seed)) {
    let hash = 2166136261;
    for (const char of JSON.stringify(state)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    state.seed = hash >>> 0;
  }
  return state;
}

/** Próximo número em [0, 1) (mulberry32); avança a semente do estado. */
function next(state) {
  ensureSeed(state);
  const t = (state.seed + 0x6d2b79f5) >>> 0;
  state.seed = t;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

/** Inteiro em [0, n) a partir da semente do estado. */
function int(state, n) { return Math.floor(next(state) * n); }

/** Embaralha (Fisher–Yates) usando `pick(n)`. Devolve uma cópia. */
function shuffle(list, pick) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = pick(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

module.exports = { seed, next, int, shuffle, ensureSeed };
