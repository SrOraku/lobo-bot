'use strict';

// Pure ecological model: no I/O, no clocks. Every function receives the instant it simulates.
const { moonPhase } = require('../wolves/moon-phase');

const HOUR = 3_600_000;
const MAX_STEPS = 24 * 21;
const BRASILIA_OFFSET = 3 * HOUR;
const LEGEND = Object.freeze({ health: 86, calmHours: 12, duration: 3 * HOUR, cooldown: 24 * HOUR });
const SEASONS = Object.freeze({
  verao: Object.freeze({ id: 'verao', name: 'Verão', emoji: '☀️', growth: 1.1 }),
  outono: Object.freeze({ id: 'outono', name: 'Outono', emoji: '🍂', growth: 0.95 }),
  inverno: Object.freeze({ id: 'inverno', name: 'Inverno', emoji: '❄️', growth: 0.75 }),
  primavera: Object.freeze({ id: 'primavera', name: 'Primavera', emoji: '🌸', growth: 1.2 }),
});
const ACTIONS = Object.freeze({
  cacar: Object.freeze({ cooldown: 2 * HOUR }),
  plantar: Object.freeze({ cooldown: HOUR }),
  patrulhar: Object.freeze({ cooldown: 3 * HOUR }),
});
const SIGHTING_REWARD = Object.freeze({ coins: 120, xp: 60, karma: 25 });

const clamp = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const round3 = value => Math.round(value * 1000) / 1000;

function seasonAt(at) {
  const month = new Date(at - BRASILIA_OFFSET).getUTCMonth();
  return SEASONS[month === 11 || month <= 1 ? 'verao' : month <= 4 ? 'outono' : month <= 7 ? 'inverno' : 'primavera'];
}

function initialState(at) {
  return { v: 0.7, p: 0.5, w: 0.4, h: 0.1, calm: 0, famine: false, invaded: false, season: seasonAt(at).id, legend: null, lastLegendAt: 0 };
}

function normalize(input, at) {
  const base = initialState(at), state = { ...base, ...(input && typeof input === 'object' ? input : {}) };
  for (const key of ['v', 'p', 'w', 'h']) state[key] = clamp(Number(state[key]));
  state.calm = Number.isSafeInteger(state.calm) && state.calm >= 0 ? state.calm : 0;
  state.famine = state.famine === true;
  state.invaded = state.invaded === true;
  if (!SEASONS[state.season]) state.season = base.season;
  state.lastLegendAt = Number.isSafeInteger(state.lastLegendAt) ? state.lastLegendAt : 0;
  const legend = state.legend;
  state.legend = legend && typeof legend.id === 'string' && Number.isSafeInteger(legend.until)
    ? { id: legend.id, until: legend.until, by: typeof legend.by === 'string' ? legend.by : null } : null;
  return state;
}

function health(state) {
  const score = 0.25 * state.v
    + 0.30 * (1 - Math.abs(state.p - 0.55) / 0.55)
    + 0.25 * (1 - Math.abs(state.w - 0.55) / 0.55)
    + 0.20 * (1 - state.h);
  return Math.round(100 * clamp(score));
}

function status(score) {
  if (score >= 85) return { emoji: '🌳', label: 'Exuberante' };
  if (score >= 70) return { emoji: '🌲', label: 'Equilibrada' };
  if (score >= 50) return { emoji: '🍂', label: 'Frágil' };
  if (score >= 30) return { emoji: '🥀', label: 'Em crise' };
  return { emoji: '💀', label: 'Colapso' };
}

function rainBoost(drops) {
  return Number.isSafeInteger(drops) && drops > 0 ? Math.min(0.03, drops * 0.0015) : 0;
}

// Threshold crossings become chronicle pages. Mutates only the given copy.
function detect(state, at) {
  const events = [];
  if (!state.famine && state.p < 0.15) { state.famine = true; events.push({ kind: 'fome', at }); }
  else if (state.famine && state.p > 0.35) { state.famine = false; events.push({ kind: 'recuperacao', at }); }
  if (!state.invaded && state.h > 0.6) { state.invaded = true; events.push({ kind: 'invasao', at }); }
  else if (state.invaded && state.h < 0.3) { state.invaded = false; events.push({ kind: 'libertacao', at }); }
  if (state.legend && at >= state.legend.until) {
    if (!state.legend.by) events.push({ kind: 'lenda_partiu', at });
    state.legend = null;
  }
  return events;
}

function step(input, at, drops = 0) {
  const s = { ...input };
  const season = seasonAt(at), moon = moonPhase(at).id;
  const g = season.growth, hunt = moon === 'cheia' ? 1.3 : 1, poach = moon === 'nova' ? 1.3 : 1;
  const v = s.v + 0.09 * g * s.v * (1 - s.v) - 0.09 * s.p * s.v + 0.004 + rainBoost(drops);
  const p = s.p + 0.10 * g * s.p * (1 - s.p / Math.max(0.05, 0.9 * s.v)) - 0.04 * hunt * s.w * s.p - 0.05 * poach * s.h * s.p + 0.006;
  const w = s.w + 0.04 * s.w * (hunt * s.p - 0.2 - 0.6 * s.w) - 0.03 * s.h * s.w + 0.001;
  const h = s.h + 0.006 * poach * (1 - s.h);
  Object.assign(s, { v: round3(clamp(v)), p: round3(clamp(p)), w: round3(clamp(w)), h: round3(clamp(h)) });
  const events = [];
  if (s.season !== season.id) { s.season = season.id; events.push({ kind: 'estacao', at, detail: season.id }); }
  events.push(...detect(s, at));
  s.calm = health(s) >= LEGEND.health ? s.calm + 1 : 0;
  if (!s.legend && s.calm >= LEGEND.calmHours && at - s.lastLegendAt >= LEGEND.cooldown) {
    s.legend = { id: 'cervo-' + at, until: at + LEGEND.duration, by: null };
    s.lastLegendAt = at;
    s.calm = 0;
    events.push({ kind: 'lenda', at });
  }
  return { state: s, events };
}

// Lazy evaluation: the forest lives between commands; only whole hours are simulated.
function advance(input, from, to, drops = 0) {
  let state = normalize(input, from);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) return { state, events: [], updatedAt: from, steps: 0 };
  let start = from, steps = Math.floor((to - from) / HOUR);
  if (steps > MAX_STEPS) { start = from + (steps - MAX_STEPS) * HOUR; steps = MAX_STEPS; }
  const events = [];
  for (let index = 1; index <= steps; index++) {
    const result = step(state, start + index * HOUR, index === 1 ? drops : 0);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events, updatedAt: start + steps * HOUR, steps };
}

function forecast(input, at, horizons = [6, 24, 72]) {
  const state = normalize(input, at);
  return horizons.map(hours => {
    const future = advance(state, at, at + hours * HOUR).state;
    return { hours, state: future, health: health(future) };
  });
}

function need(state) {
  if (state.h >= 0.35) return { action: 'patrulhar', reason: 'caçadores avançam sobre a floresta' };
  if (state.p < 0.25) return { action: 'descansar', reason: 'as presas precisam de tempo; evite caçar' };
  if (state.v < 0.6) return { action: 'plantar', reason: 'a vegetação está rala' };
  if (state.p > 0.85 * state.v) return { action: 'cacar', reason: 'presas demais estão devorando a vegetação' };
  return { action: 'cacar', reason: 'a caça sustentável está liberada' };
}

function reward(kind, state, at, random = 0.5) {
  const variance = 0.85 + 0.3 * clamp(random);
  if (kind === 'cacar') {
    if (state.p < 0.15) return { coins: 3, xp: 3, karma: -8, scarcity: true };
    const moonBonus = moonPhase(at).id === 'cheia' ? 1.2 : 1;
    const karma = state.p > 0.85 * state.v ? 4 : state.p < 0.3 ? -4 : 1;
    return { coins: Math.round((10 + 35 * state.p) * variance * moonBonus), xp: 12, karma, scarcity: false, moonBonus: moonBonus > 1 };
  }
  if (kind === 'plantar') return { coins: Math.round(8 + 20 * (1 - state.v)), xp: 8, karma: 1 + Math.round(10 * (1 - state.v)) };
  if (kind === 'patrulhar') return { coins: Math.round(10 + 40 * state.h), xp: 15, karma: 1 + Math.round(15 * state.h) };
  throw Error('Ação da floresta desconhecida.');
}

function applyAction(input, kind, at) {
  const state = { ...input };
  if (kind === 'cacar') state.p = round3(clamp(state.p - 0.02));
  else if (kind === 'plantar') state.v = round3(clamp(state.v + 0.05));
  else if (kind === 'patrulhar') state.h = round3(clamp(state.h - 0.15));
  else throw Error('Ação da floresta desconhecida.');
  return { state, events: detect(state, at) };
}

module.exports = {
  HOUR, MAX_STEPS, LEGEND, SEASONS, ACTIONS, SIGHTING_REWARD,
  seasonAt, initialState, normalize, health, status, rainBoost, detect, step, advance, forecast, need, reward, applyAction,
};
