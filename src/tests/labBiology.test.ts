/**
 * Tests for the Biology lab engine (cell-membrane transport).
 *
 * Run with:  bun src/tests/labBiology.test.ts
 * Exit code 0 = all assertions passed.
 *
 * Every assertion is deterministic: the transport animation derives particle
 * positions from exactly these functions, so whatever is proven here is what
 * the student watches — a sealed membrane holds its gradient, a permeable one
 * relaxes down it, and the same seed always traces the same walk.
 */

import {
  STEP_S,
  WORLD,
  advanceTransport,
  clampParams,
  contactProbability,
  initTransport,
  netDirection,
  sideCounts,
  stepTransport,
  transportRng,
} from "../lib/lab/transport";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

const BASE = {
  left: 40,
  right: 10,
  permeability: 0.6,
  temperature: 1,
  channels: false,
  seed: 42,
} as const;

/* -------------------------------------------------------------------------- */
/* Seeding & geometry                                                         */
/* -------------------------------------------------------------------------- */

const initial = initTransport(BASE);
assert(initial.particles.length === 50, "a 40 + 10 setup seeds exactly 50 particles");
assert(sideCounts(initial).left === 40 && sideCounts(initial).right === 10,
  "seeded counts match the sliders");
assert(
  initial.particles.every((particle) => particle.x >= WORLD.wall && particle.x <= WORLD.width - WORLD.wall),
  "every seeded particle starts inside the chamber walls",
);
assert(
  initial.particles.slice(0, 40).every((particle) => particle.x < WORLD.membraneX) &&
    initial.particles.slice(40).every((particle) => particle.x > WORLD.membraneX),
  "left-seeded particles start left of the membrane, right-seeded right of it",
);

const empty = initTransport({ ...BASE, left: 0, right: 0 });
assert(empty.particles.length === 0 && sideCounts(empty).left === 0,
  "zero particles on both sides is a valid (empty) chamber");

/* -------------------------------------------------------------------------- */
/* Parameter clamping — sliders can never break the model                     */
/* -------------------------------------------------------------------------- */

const clamped = clampParams({ left: 999, right: -5, permeability: 7, temperature: 0, channels: true, seed: -3 });
assert(clamped.left === 60 && clamped.right === 0, "counts clamp to 0…60");
assert(clamped.permeability === 1 && clamped.temperature === 0.4, "permeability clamps to 0…1, temperature to 0.4…2");
assert(clamped.seed >= 0, "seed stays non-negative");
assert(close(contactProbability({ ...BASE, permeability: 1, channels: true }), 0.8),
  "channels raise the per-contact crossing chance");
assert(close(contactProbability({ ...BASE, permeability: 1, channels: false }), 0.3),
  "without channels only some contacts cross");

function close(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/* -------------------------------------------------------------------------- */
/* A sealed membrane holds its gradient (permeability = 0)                    */
/* -------------------------------------------------------------------------- */

let sealed = initTransport({ ...BASE, permeability: 0 });
let rand = transportRng(BASE.seed);
sealed = advanceTransport(sealed, { ...BASE, permeability: 0 }, 20, rand);
const sealedCounts = sideCounts(sealed);
assert(sealedCounts.left === 40 && sealedCounts.right === 10,
  "with permeability 0 no particle ever crosses — the gradient is held");
assert(
  sealed.particles.every((particle) => particle.grant === 0),
  "no crossing grants survive when the membrane is sealed",
);

/* -------------------------------------------------------------------------- */
/* A permeable membrane relaxes down the gradient                             */
/* -------------------------------------------------------------------------- */

let open = initTransport(BASE);
rand = transportRng(BASE.seed);
const countsOverTime: { t: number; left: number }[] = [{ t: 0, left: 40 }];
for (let seconds = 5; seconds <= 60; seconds += 5) {
  open = advanceTransport(open, BASE, 5, rand);
  countsOverTime.push({ t: seconds, left: sideCounts(open).left });
}
const finalLeft = sideCounts(open).left;
assert(finalLeft < 40, "net transport leaves the crowded side (40 → below 40)");
assert(finalLeft > 10, "the crowded side does not drain completely — it approaches balance");
assert(Math.abs(finalLeft - 25) <= 8, `counts relax toward 25/25 (landed at ${finalLeft}/25±)`);
assert(
  countsOverTime.every((point, index) => index === 0 || point.t > countsOverTime[index - 1].t),
  "the probe samples time in order",
);
assert(netDirection({ left: finalLeft, right: 50 - finalLeft }).length > 0,
  "net direction reads out for any balance");

const drifting = countsOverTime.filter((point) => point.left < 40).length;
assert(drifting >= 8, "the gradient relaxes progressively across the run, not in one jump");

/* -------------------------------------------------------------------------- */
/* Determinism — same seed, same walk                                          */
/* -------------------------------------------------------------------------- */

const runA = advanceTransport(initTransport(BASE), BASE, 10, transportRng(7));
const runB = advanceTransport(initTransport(BASE), BASE, 10, transportRng(7));
assert(
  runA.particles.every((particle, index) =>
    particle.x === runB.particles[index].x && particle.y === runB.particles[index].y,
  ),
  "the same seed and the same elapsed time produce identical positions",
);
const runC = advanceTransport(initTransport(BASE), BASE, 10, transportRng(8));
assert(
  runA.particles.some((particle, index) => particle.x !== runC.particles[index].x),
  "a different seed traces a different walk",
);

/* -------------------------------------------------------------------------- */
/* One tick at a time (the step button the UI uses)                           */
/* -------------------------------------------------------------------------- */

let stepped = initTransport(BASE);
const before = stepped.particles[0].x;
stepped = stepTransport(stepped, BASE, transportRng(BASE.seed));
assert(stepped.particles[0].x !== before || stepped.particles[0].y !== initTransport(BASE).particles[0].y,
  "a single step moves at least one particle");
assert(stepped.particles.length === 50, "stepping never changes the particle count");
assert(close(STEP_S, 0.02), "the integration tick is a fixed 0.02 s");

const neverLeaves = advanceTransport(initTransport(BASE), BASE, 15, transportRng(3));
assert(
  neverLeaves.particles.every(
    (particle) =>
      particle.x >= WORLD.wall - 1e-9 && particle.x <= WORLD.width - WORLD.wall + 1e-9 &&
      particle.y >= WORLD.wall - 1e-9 && particle.y <= WORLD.height - WORLD.wall + 1e-9,
  ),
  "no particle ever escapes the chamber walls during a run",
);

const total = sideCounts(neverLeaves).left + sideCounts(neverLeaves).right;
assert(total === 50, "particles are conserved — transport only moves them between sides");

/* -------------------------------------------------------------------------- */
/* Channels speed equilibration up (same seed, same schedule)                */
/* -------------------------------------------------------------------------- */

function meanDistanceFromBalance(channels: boolean, seed: number): number {
  const params = { ...BASE, channels, seed };
  let state = initTransport(params);
  const rand = transportRng(seed);
  let sum = 0;
  let samples = 0;
  for (let seconds = 5; seconds <= 40; seconds += 5) {
    state = advanceTransport(state, params, 5, rand);
    sum += Math.abs(sideCounts(state).left - 25);
    samples += 1;
  }
  return sum / samples;
}

// One seed is one roll of the dice — average over a fixed set of seeds so
// the assertion reflects the model, not a lucky walk.
const SEEDS = [42, 7, 100, 999, 31337];
const distanceWith =
  SEEDS.reduce((total, seed) => total + meanDistanceFromBalance(true, seed), 0) / SEEDS.length;
const distanceWithout =
  SEEDS.reduce((total, seed) => total + meanDistanceFromBalance(false, seed), 0) / SEEDS.length;
assert(
  distanceWith < distanceWithout,
  `channel proteins equilibrate faster on average (mean distance ${distanceWith.toFixed(2)} vs ${distanceWithout.toFixed(2)})`,
);

/* -------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`labBiology: ${checks} checks passed`);
