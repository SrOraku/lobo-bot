'use strict';

// New moon reference: January 6, 2000 at 18:14 UTC
// Synodic period: 29.53058867 days
const EPOCH_MS = 947182440000;
const PERIOD_MS = 29.53058867 * 86400000;

const PHASES = [
  { id: 'nova', name: 'Lua Nova', emoji: '🌑', range: [0, 0.0625] },
  { id: 'quarto_crescente', name: 'Quarto Crescente', emoji: '🌒', range: [0.0625, 0.4375] },
  { id: 'cheia', name: 'Lua Cheia', emoji: '🌕', range: [0.4375, 0.5625] },
  { id: 'quarto_minguante', name: 'Quarto Minguante', emoji: '🌘', range: [0.5625, 0.9375] },
  { id: 'nova', name: 'Lua Nova', emoji: '🌑', range: [0.9375, 1.0] },
];

const EFFECTS = {
  nova: {
    attackMult: 1.0,
    counterMult: 1.0,
    xpMult: 1.2,
    battleLabel: null,
    description: 'Magia lunar no ar — XP das batalhas +20%.',
  },
  quarto_crescente: {
    attackMult: 0.9,
    counterMult: 1.0,
    xpMult: 1.0,
    battleLabel: '🌒 Quarto Crescente — dano de ataque −10%.',
    description: 'A lua cresce e reforça as defesas — dano de ataque −10%.',
  },
  cheia: {
    attackMult: 1.2,
    counterMult: 1.0,
    xpMult: 1.0,
    battleLabel: '🌕 Lua Cheia — dano de ataque +20%!',
    description: 'A Lua Cheia desperta os instintos — dano de ataque +20%!',
  },
  quarto_minguante: {
    attackMult: 1.0,
    counterMult: 1.15,
    xpMult: 1.0,
    battleLabel: '🌘 Quarto Minguante — contra-ataque +15%.',
    description: 'Os sobreviventes tornam-se ferozes — contra-ataque +15%.',
  },
};

function moonFraction(now) {
  return ((now - EPOCH_MS) % PERIOD_MS + PERIOD_MS) % PERIOD_MS / PERIOD_MS;
}

function moonPhase(now = Date.now()) {
  const frac = moonFraction(now);
  const entry = PHASES.find(p => frac >= p.range[0] && frac < p.range[1]) || PHASES[0];
  return { id: entry.id, name: entry.name, emoji: entry.emoji, fraction: frac };
}

function moonEffects(now = Date.now()) {
  const phase = moonPhase(now);
  return { ...phase, ...EFFECTS[phase.id] };
}

// Apply moon phase and optional item multipliers to a calculateBattle result.
// base: { atkDamage, defDamage, atkWolvesAfter, defWolvesAfter, winner }
// attackerWolves / defenderWolves: pre-battle wolf counts (for recalc)
function applyBattleEffects(base, { attackerWolves, defenderWolves, moon, atkPower = 1, defArmor = 1 }) {
  const atkDmg = Math.max(1, Math.round(base.atkDamage * moon.attackMult * atkPower * defArmor));
  const defDmg = Math.max(0, Math.round(base.defDamage * moon.counterMult));
  const atkWolvesAfter = Math.max(0, attackerWolves - defDmg);
  const defWolvesAfter = Math.max(0, defenderWolves - atkDmg);
  const winner =
    defWolvesAfter < atkWolvesAfter ? 'attacker' :
    atkWolvesAfter < defWolvesAfter ? 'defender' : 'draw';
  return { atkDamage: atkDmg, defDamage: defDmg, atkWolvesAfter, defWolvesAfter, winner };
}

module.exports = { moonPhase, moonEffects, applyBattleEffects };
