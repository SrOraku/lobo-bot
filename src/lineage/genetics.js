'use strict';

// Pure Mendelian model: no I/O. Every random draw comes from the injected rng().
const HOUR = 3_600_000, DAY = 24 * HOUR;
const GENES = Object.freeze({
  K: Object.freeze({ dominant: 'K', recessive: 'k', wild: 0.25 }),
  A: Object.freeze({ dominant: 'A', recessive: 'a', wild: 0.6 }),
  D: Object.freeze({ dominant: 'D', recessive: 'd', wild: 0.65 }),
  G: Object.freeze({ dominant: 'G', recessive: 'g', wild: 0.5 }),
  L: Object.freeze({ dominant: 'L', recessive: 's', wild: 0.5 }),
});
const MARKS = Object.freeze({
  lunar: Object.freeze({ emoji: '🌙', name: 'Marca Lunar' }),
  hetero: Object.freeze({ emoji: '👁️', name: 'Heterocromia' }),
  estrela: Object.freeze({ emoji: '⭐', name: 'Estrela na testa' }),
});
const MUTATION_CHANCE = 0.03, WILD_MARK_CHANCE = 0.01;
const STAGES = Object.freeze([
  Object.freeze({ id: 'filhote', name: 'Filhote', emoji: '🐾', from: 0 }),
  Object.freeze({ id: 'jovem', name: 'Jovem', emoji: '🐺', from: 2 * DAY }),
  Object.freeze({ id: 'adulto', name: 'Adulto', emoji: '🐺', from: 5 * DAY }),
  Object.freeze({ id: 'anciao', name: 'Ancião', emoji: '🌕', from: 40 * DAY }),
]);
const TALENTS = Object.freeze({
  cacar: 'caçadas', plantar: 'plantios', patrulhar: 'patrulhas',
});
const NAMES = Object.freeze(['Luar', 'Nevasca', 'Brasa', 'Orvalho', 'Trovão', 'Aurora', 'Sombra', 'Eclipse', 'Cinza', 'Ventania', 'Estrela', 'Bruma', 'Raio', 'Seiva', 'Granizo', 'Crepúsculo', 'Fagulha', 'Garoa', 'Ônix', 'Íris']);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const draw = rng => clamp(Number(rng()) || 0, 0, 0.999999);

function ordered(gene, pair) {
  const { dominant } = GENES[gene];
  return [...pair].sort((left, right) => (right === dominant) - (left === dominant));
}
function wildGenome(rng) {
  return Object.fromEntries(Object.entries(GENES).map(([gene, spec]) =>
    [gene, ordered(gene, [0, 1].map(() => draw(rng) < spec.wild ? spec.dominant : spec.recessive))]));
}
function validGenome(value) {
  return value && typeof value === 'object' && Object.entries(GENES).every(([gene, spec]) =>
    Array.isArray(value[gene]) && value[gene].length === 2 && value[gene].every(allele => allele === spec.dominant || allele === spec.recessive));
}
function inheritMark(markA, markB, rng) {
  if (markA && markA === markB && draw(rng) < 0.5) return markA;
  for (const mark of [markA, markB]) if (mark && MARKS[mark] && draw(rng) < 0.25) return mark;
  if (draw(rng) < MUTATION_CHANCE) return Object.keys(MARKS)[Math.floor(draw(rng) * Object.keys(MARKS).length)];
  return null;
}
function inherit(a, b, rng) {
  const genome = Object.fromEntries(Object.keys(GENES).map(gene =>
    [gene, ordered(gene, [a.genome[gene][Math.floor(draw(rng) * 2)], b.genome[gene][Math.floor(draw(rng) * 2)]])]));
  return { genome, mark: inheritMark(a.mark, b.mark, rng) };
}
function wild(rng) {
  return { genome: wildGenome(rng), mark: draw(rng) < WILD_MARK_CHANCE ? Object.keys(MARKS)[Math.floor(draw(rng) * Object.keys(MARKS).length)] : null };
}

const count = (pair, allele) => pair.filter(item => item === allele).length;
function coatOf(K, A) {
  if (count(K, 'K')) return { id: 'negro', name: 'Negro', emoji: '🖤' };
  if (count(A, 'A')) return { id: 'cinzento', name: 'Cinzento', emoji: '🩶' };
  return { id: 'branco', name: 'Branco ártico', emoji: '🤍' };
}
const eyesOf = (D, mark) => mark === 'hetero' ? { id: 'hetero', name: 'Heterocromia', emoji: '🟠🔵' }
  : count(D, 'D') ? { id: 'ambar', name: 'Âmbar', emoji: '🟠' } : { id: 'azul', name: 'Azul', emoji: '🔵' };
const sizeOf = G => [{ id: 'agil', name: 'Ágil', talent: 'cacar' }, { id: 'medio', name: 'Médio', talent: 'plantar' }, { id: 'grande', name: 'Grande', talent: 'patrulhar' }][count(G, 'G')];
const soulOf = L => [{ id: 'selvagem', name: 'Selvagem' }, { id: 'equilibrado', name: 'Equilibrado' }, { id: 'leal', name: 'Leal' }][count(L, 'L')];

function phenotype({ genome, mark }) {
  const size = sizeOf(genome.G), soul = soulOf(genome.L);
  return {
    coat: coatOf(genome.K, genome.A), eyes: eyesOf(genome.D, mark), size, soul,
    mark: mark ? { id: mark, ...MARKS[mark] } : null,
    talent: { action: size.talent, label: TALENTS[size.talent], bonus: soul.id === 'selvagem' ? 0.3 : 0.2 },
    bondFactor: soul.id === 'leal' ? 1.5 : 1,
  };
}

// Exact Punnett distribution: every allele combination is equally likely.
function predict(a, b) {
  const outcomes = gene => a.genome[gene].flatMap(left => b.genome[gene].map(right => [left, right]));
  const tally = (pairs, describe) => {
    const totals = new Map();
    for (const pair of pairs) {
      const trait = describe(pair);
      const entry = totals.get(trait.id) || { ...trait, p: 0 };
      entry.p += 1 / pairs.length;
      totals.set(trait.id, entry);
    }
    return [...totals.values()].sort((left, right) => right.p - left.p);
  };
  const coatPairs = outcomes('K').flatMap(K => outcomes('A').map(A => ({ K, A })));
  const carriers = [a.mark, b.mark].filter(Boolean).length;
  const inheritedMark = (a.mark && a.mark === b.mark ? 0.5 : 0) + (a.mark && a.mark === b.mark ? 0.5 : 1) * (1 - 0.75 ** carriers);
  return {
    coat: tally(coatPairs, ({ K, A }) => coatOf(K, A)),
    eyes: tally(outcomes('D'), D => eyesOf(D, null)),
    size: tally(outcomes('G'), sizeOf),
    soul: tally(outcomes('L'), soulOf),
    mark: inheritedMark + (1 - inheritedMark) * MUTATION_CHANCE,
  };
}

function stage(bornAt, at) {
  const age = Math.max(0, at - bornAt);
  const current = [...STAGES].reverse().find(item => age >= item.from);
  const next = STAGES[STAGES.indexOf(current) + 1];
  return { ...current, age, nextIn: next ? next.from - age : null, next: next || null, canBreed: ['adulto', 'anciao'].includes(current.id) };
}
const hunger = (fedAt, at) => clamp(Math.round(Math.max(0, at - fedAt) / HOUR * 4), 0, 100);
const joy = (playedAt, at) => clamp(100 - Math.round(Math.max(0, at - playedAt) / HOUR * 3), 0, 100);
function bond(stored, fedAt, playedAt, at) {
  const neglected = Math.max(0, (at - Math.max(fedAt, playedAt)) / HOUR - 24);
  return clamp(stored - Math.floor(neglected / 2), 0, 100);
}
function condition(wolf, at) {
  const fed = hunger(wolf.fed_at, at), happy = joy(wolf.played_at, at), link = bond(wolf.bond, wolf.fed_at, wolf.played_at, at);
  const life = stage(wolf.born_at, at);
  const mood = fed >= 80 ? '😿 Faminto' : happy <= 20 ? '😔 Entediado' : link >= 70 ? '🥰 Devoto' : '🙂 Tranquilo';
  const blocked = life.id === 'filhote' ? 'ainda é filhote' : fed >= 80 ? 'está com fome' : link < 30 ? 'precisa de vínculo 30' : null;
  return { hunger: fed, joy: happy, bond: link, stage: life, mood, talentActive: !blocked, talentBlocked: blocked };
}

function pickName(rng) { return NAMES[Math.floor(draw(rng) * NAMES.length)]; }

module.exports = {
  HOUR, DAY, GENES, MARKS, STAGES, MUTATION_CHANCE,
  wild, inherit, validGenome, phenotype, predict, stage, hunger, joy, bond, condition, pickName, ordered,
};
