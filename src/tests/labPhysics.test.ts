/**
 * Tests for the Phase 4 physics engine.
 *
 * Run with:  bun src/tests/labPhysics.test.ts
 * Exit code 0 = all assertions passed.
 *
 * Every assertion is deterministic: the simulation UI draws ONLY from the
 * pure functions below (same inputs → same numbers, in SI units), so
 * whatever these tests prove about the values is exactly what the student
 * sees on the graphs and readouts. No DOM, no network, no randomness.
 */

import {
  CIRCUIT_ASSUMPTIONS,
  DEG,
  FORCES_ASSUMPTIONS,
  G_EARTH,
  MOTION_ASSUMPTIONS,
  OPTICS_ASSUMPTIONS,
  PLOT_SAMPLES,
  PROJECTILE_ASSUMPTIONS,
  WAVE_ASSUMPTIONS,
  circuitResult,
  forcesResult,
  isFiniteNumber,
  lensResult,
  motionAt,
  oscillationAt,
  oscillationResult,
  projectileResult,
  projectileTrajectory,
  round,
  sampleMotion,
  sampleOscillation,
  sampleWave,
  snellResult,
  waveResult,
} from "../lib/lab/physics";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

function close(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/* -------------------------------------------------------------------------- */
/* 0. Shared constants and helpers                                            */
/* -------------------------------------------------------------------------- */

assert(close(DEG, Math.PI / 180), "DEG converts degrees to radians");
assert(G_EARTH === 9.81, "lab gravity is 9.81 m/s²");
assert(PLOT_SAMPLES === 120, "every plotted curve uses 120 samples");
assert(round(3.14159, 2) === 3.14, "round() trims to the requested digits");
assert(round(1.23456) === 1.2346, "round() defaults to 4 decimals");
assert(
  isFiniteNumber(1) &&
    !isFiniteNumber(Infinity) &&
    !isFiniteNumber(Number.NaN) &&
    !isFiniteNumber("5" as unknown as number),
  "isFiniteNumber rejects NaN, Infinity and non-numbers",
);

/* -------------------------------------------------------------------------- */
/* 1. Motion — x(t) = x₀ + ut + ½at²,  v(t) = u + at                          */
/* -------------------------------------------------------------------------- */

const m1 = motionAt({ x0: 5, u: 2, a: 4, t: 3 });
assert(close(m1.x, 29), "motion: x(3) = 5 + 2·3 + ½·4·3² = 29 m");
assert(close(m1.v, 14), "motion: v(3) = 2 + 4·3 = 14 m/s");
assert(m1.a === 4, "motion: acceleration is carried through");
assert(!m1.turned && m1.turnTime === null, "motion: no turning point when v keeps its sign");

const m0 = motionAt({ x0: 7, u: 3, a: 9, t: 0 });
assert(close(m0.x, 7) && close(m0.v, 3), "motion: at t = 0 we are at x₀ with velocity u");

const turn = motionAt({ x0: 0, u: -6, a: 3, t: 5 });
assert(turn.turned && turn.turnTime === 2, "motion: turning point t* = −u/a = 2 s");
assert(close(turn.x, 7.5) && close(turn.v, 9), "motion: position/velocity at t = 5 with the turn");
assert(
  !motionAt({ x0: 0, u: 1, a: 2, t: 10 }).turned,
  "motion: t* = −0.5 s lies outside [0, t] → no turn",
);
assert(
  motionAt({ x0: 0, u: -6, a: 3, t: 2 }).turned,
  "motion: a turn exactly at t = t still counts",
);
assert(
  !motionAt({ x0: 0, u: -6, a: 3, t: 1.9 }).turned,
  "motion: a turn just after t does not count",
);

// Samples are exactly what the x–t and v–t graphs plot.
const motionInput = { x0: 0, u: 1, a: 1, t: 4 };
const { position, velocity } = sampleMotion(motionInput, undefined, 5);
assert(position.length === 5 && velocity.length === 5, "motion: 5 requested samples → 5 points");
assert(position[0].t === 0 && position[4].t === 4, "motion: samples span t = 0…4 s");
assert(close(position[4].y, 12), "motion: x(4) = 0 + 4 + ½·16 = 12 m on the graph");
assert(close(velocity[4].y, 5), "motion: v(4) = 1 + 4 = 5 m/s on the graph");
const direct = motionAt({ ...motionInput, t: position[4].t });
assert(close(position[4].y, direct.x) && close(velocity[4].y, direct.v),
  "motion: plotted endpoints match motionAt() exactly");
assert(
  sampleMotion(motionInput).position.length === PLOT_SAMPLES,
  "motion: default sample count is PLOT_SAMPLES",
);
assert(
  sampleMotion(motionInput, 4, 1).position.length === 2,
  "motion: sample count is clamped to at least 2",
);
assert(
  sampleMotion(motionInput, -3).position.every((p) => p.t === 0),
  "motion: a negative end time collapses to t = 0 (no NaN curve)",
);
assert(
  JSON.stringify(sampleMotion(motionInput)) === JSON.stringify(sampleMotion(motionInput)),
  "motion: sampling is deterministic",
);
assert(MOTION_ASSUMPTIONS.length >= 3, "motion: assumptions are stated in the UI");
assert(
  MOTION_ASSUMPTIONS.some((a) => /constant/i.test(a)),
  "motion: the constant-acceleration limit is stated",
);

/* -------------------------------------------------------------------------- */
/* 2. Projectile motion — R = v²·sin2θ/g, H = v²·sin²θ/(2g), T = 2v·sinθ/g    */
/* -------------------------------------------------------------------------- */

const p30 = projectileResult({ v: 20, angleDeg: 30, g: 10 });
assert(close(p30.vx, 20 * Math.cos(30 * DEG)), "projectile: vx = v·cosθ");
assert(close(p30.vy, 10), "projectile: vy = 20·sin30° = 10 m/s");
assert(close(p30.timeOfFlight, 2), "projectile: T = 2·10/10 = 2 s");
assert(close(p30.timeToApex, 1), "projectile: time to apex is T/2");
assert(close(p30.apexX, p30.vx * p30.timeToApex), "projectile: apex x = vx·t_apex");
assert(close(p30.maxHeight, 5), "projectile: H = 10²/(2·10) = 5 m");
assert(close(p30.range, 400 * Math.sin(60 * DEG) / 10), "projectile: R = v²·sin2θ/g");

const p45 = projectileResult({ v: 20, angleDeg: 45, g: 10 });
assert(p45.isOptimal && p45.optimalAngle === 45, "projectile: 45° is flagged as the optimal angle");
assert(close(p45.range, 40), "projectile: 45° range = 400/10 = 40 m");
assert(close(p45.maxHeight, 10), "projectile: 45° height = 200/20 = 10 m");
const p60 = projectileResult({ v: 20, angleDeg: 60, g: 10 });
assert(close(p30.range, p60.range, 1e-9), "projectile: 30° and 60° share the same range");
assert(p45.range > p30.range, "projectile: 45° beats 30° for the same speed");

const pFlat = projectileResult({ v: 20, angleDeg: 0, g: 10 });
assert(
  close(pFlat.range, 0) && close(pFlat.maxHeight, 0) && close(pFlat.timeOfFlight, 0),
  "projectile: a horizontal launch never leaves the ground",
);
const pUp = projectileResult({ v: 20, angleDeg: 90, g: 10 });
assert(close(pUp.range, 0, 1e-9), "projectile: straight up comes straight down (R ≈ 0)");
assert(close(pUp.maxHeight, 20, 1e-9), "projectile: v²/(2g) = 20 m straight up");

const traj = projectileTrajectory({ v: 20, angleDeg: 30, g: 10 }, 120);
assert(traj.length === 120, "projectile: 120 trajectory samples");
assert(close(traj[0].x, 0) && close(traj[0].y, 0), "projectile: trajectory starts at the origin");
assert(close(traj[traj.length - 1].y, 0, 1e-9), "projectile: trajectory lands back on y = 0");
let increasingX = true;
for (let i = 1; i < traj.length; i += 1) {
  if (!(traj[i].x > traj[i - 1].x)) increasingX = false;
}
assert(increasingX, "projectile: horizontal position only increases");
const maxTrajY = Math.max(...traj.map((p) => p.y));
assert(
  maxTrajY > 0 && close(maxTrajY, p30.maxHeight, 1e-2),
  "projectile: the sampled arc peaks at H (within sampling error)",
);
assert(
  JSON.stringify(traj) === JSON.stringify(projectileTrajectory({ v: 20, angleDeg: 30, g: 10 }, 120)),
  "projectile: the trajectory is deterministic",
);
assert(PROJECTILE_ASSUMPTIONS.length >= 3, "projectile: assumptions are stated in the UI");
assert(
  PROJECTILE_ASSUMPTIONS.some((a) => /No air resistance/i.test(a)),
  "projectile: the no-drag limit is stated",
);

/* -------------------------------------------------------------------------- */
/* 3. Newton's laws — block on a rough surface                                */
/* -------------------------------------------------------------------------- */

const fStatic = forcesResult({ m: 2, F: 5, thetaDeg: 0, mu: 0.5 });
assert(close(fStatic.weight, 19.62), "forces: W = m·g = 19.62 N");
assert(close(fStatic.normal, 19.62), "forces: N = W when the push is horizontal");
assert(close(fStatic.fx, 5) && close(fStatic.fy, 0), "forces: horizontal push splits as Fx = F");
assert(fStatic.frictionKind === "static", "forces: push below μN → static friction");
assert(close(fStatic.friction, -5), "forces: static friction exactly balances the push");
assert(close(fStatic.net, 0) && close(fStatic.acceleration, 0), "forces: static block does not move");

const fKinetic = forcesResult({ m: 2, F: 10, thetaDeg: 0, mu: 0.3 });
assert(fKinetic.frictionKind === "kinetic", "forces: push above μN → kinetic friction");
assert(close(fKinetic.friction, -0.3 * 19.62), "forces: kinetic friction = −μN");
assert(close(fKinetic.net, 4.114), "forces: net = F − μN");
assert(close(fKinetic.acceleration, 2.057), "forces: a = F_net/m");

const fZero = forcesResult({ m: 1, F: 0, thetaDeg: 0, mu: 0.4 });
assert(
  fZero.frictionKind === "static" && close(fZero.net, 0),
  "forces: no push at all → nothing happens",
);
const fSmooth = forcesResult({ m: 2, F: 5, thetaDeg: 0, mu: 0 });
assert(fSmooth.frictionless, "forces: μ = 0 is flagged frictionless");
assert(close(fSmooth.friction, 0) && close(fSmooth.acceleration, 2.5), "forces: a = F/m without friction");

const fLift = forcesResult({ m: 1, F: 100, thetaDeg: 90, mu: 0.5 });
assert(fLift.lifted, "forces: an upward push ≥ W lifts the block (model breaks down)");
assert(close(fLift.normal, 0), "forces: normal reaction clamps at 0 once airborne");

const fDown = forcesResult({ m: 1, F: 10, thetaDeg: -30, mu: 0 });
assert(close(fDown.fx, 10 * Math.cos(30 * DEG)), "forces: downward push keeps Fx = F·cosθ");
assert(close(fDown.fy, -5, 1e-9), "forces: negative angle pushes into the surface");
assert(
  !fDown.lifted && close(fDown.normal, 1 * G_EARTH + 5, 1e-9),
  "forces: pressing down raises the normal reaction",
);
assert(FORCES_ASSUMPTIONS.length >= 3, "forces: assumptions are stated in the UI");
assert(
  FORCES_ASSUMPTIONS.some((a) => /μₛ|static.*kinetic|kinetic.*static/i.test(a)),
  "forces: the single-μ simplification is stated",
);

/* -------------------------------------------------------------------------- */
/* 4. Waves and oscillations — v = fλ, T = 1/f; damped mass–spring            */
/* -------------------------------------------------------------------------- */

const w = waveResult({ f: 4, A: 0.5, lambda: 2 });
assert(close(w.period, 0.25), "wave: T = 1/f = 0.25 s");
assert(close(w.speed, 8), "wave: v = fλ = 8 m/s");
assert(close(w.angularFrequency, 8 * Math.PI), "wave: ω = 2πf");
assert(close(w.waveNumber, Math.PI), "wave: k = 2π/λ");
assert(
  close(waveResult({ f: 2, A: 999, lambda: 1 }).speed, 2),
  "wave: amplitude does not change the wave speed",
);

const waveInput = { f: 4, A: 0.5, lambda: 2 };
const w0 = sampleWave(waveInput, 0, 4, 9);
assert(w0.length === 9, "wave: 9 requested samples → 9 points (t holds the x position)");
assert(close(w0[0].y, 0), "wave: y(0, 0) = 0");
assert(close(w0[1].y, 0.5, 1e-12), "wave: quarter wavelength is at full amplitude");
assert(close(w0[4].y, 0, 1e-12), "wave: one full wavelength returns to zero");
const wLate = sampleWave(waveInput, 0.125, 4, 9);
assert(close(wLate[3].y, 0.5, 1e-9), "wave: after T/2 the crest has travelled λ/2");
assert(
  sampleWave({ f: 4, A: 0, lambda: 2 }, 0, 4, 5).every((p) => p.y === 0),
  "wave: zero amplitude is flat everywhere",
);
assert(
  JSON.stringify(sampleWave(waveInput, 0.3, 4, 17)) ===
    JSON.stringify(sampleWave(waveInput, 0.3, 4, 17)),
  "wave: sampling is deterministic",
);

const undamped = { A: 0.1, k: 100, m: 1, c: 0 };
const r0 = oscillationResult(undamped);
assert(close(r0.omega0, 10), "SHM: ω₀ = √(k/m) = 10 rad/s");
assert(close(r0.naturalPeriod, 2 * Math.PI / 10), "SHM: T₀ = 2π/ω₀");
assert(close(r0.naturalFrequency, 10 / (2 * Math.PI)), "SHM: f₀ = 1/T₀");
assert(r0.mode === "undamped" && close(r0.gamma, 0), "SHM: c = 0 → undamped");
assert(r0.omegaD === null && r0.dampedPeriod === null, "SHM: undamped motion has no damped period");

const under = oscillationResult({ ...undamped, c: 10 });
assert(under.mode === "underdamped" && close(under.gamma, 5), "SHM: γ = c/(2m) < ω₀ → underdamped");
assert(close(under.omegaD ?? 0, Math.sqrt(75)), "SHM: ω_d = √(ω₀² − γ²)");
assert(close(under.dampedPeriod ?? 0, 2 * Math.PI / Math.sqrt(75)), "SHM: damped period = 2π/ω_d");

const critical = oscillationResult({ ...undamped, c: 20 });
assert(critical.mode === "critical" && close(critical.gamma, 10), "SHM: γ = ω₀ → critical damping");
const over = oscillationResult({ ...undamped, c: 40 });
assert(over.mode === "overdamped" && close(over.gamma, 20), "SHM: γ > ω₀ → overdamped");
assert(over.omegaD === null && over.dampedPeriod === null, "SHM: no oscillation once overdamped");

for (const mode of [undamped, { ...undamped, c: 10 }, { ...undamped, c: 20 }, { ...undamped, c: 40 }]) {
  assert(
    close(oscillationAt(mode, 0), mode.A, 1e-15),
    "SHM: every damping mode starts at x = A (released from rest)",
  );
}
const r0again = oscillationResult(undamped);
assert(
  close(oscillationAt(undamped, r0again.naturalPeriod), 0.1, 1e-12),
  "SHM: undamped returns to +A after one period",
);
assert(
  close(oscillationAt(undamped, r0again.naturalPeriod / 4), 0, 1e-12),
  "SHM: undamped passes through x = 0 at T/4",
);
assert(
  Math.abs(oscillationAt({ ...undamped, c: 10 }, 2 * r0.naturalPeriod)) < 0.1 / 2,
  "SHM: underdamped amplitude has decayed after two periods",
);
assert(
  Math.abs(oscillationAt({ ...undamped, c: 40 }, 2) ) < 0.1 / 2,
  "SHM: overdamped returns slowly and never overshoots",
);
const oscSamples = sampleOscillation({ ...undamped, c: 10 }, 3, 64);
assert(oscSamples.length === 64 && oscSamples.every((p) => Number.isFinite(p.y)),
  "SHM: the displacement graph is finite at every sample");
assert(
  JSON.stringify(oscSamples) === JSON.stringify(sampleOscillation({ ...undamped, c: 10 }, 3, 64)),
  "SHM: sampling is deterministic",
);
assert(WAVE_ASSUMPTIONS.length >= 3, "waves/oscillations: assumptions are stated in the UI");

/* -------------------------------------------------------------------------- */
/* 5. Electricity — Ohm's law in series and parallel                          */
/* -------------------------------------------------------------------------- */

const series = circuitResult({ V: 12, R1: 4, R2: 8, mode: "series" });
assert(close(series.rTotal, 12), "circuit: series R = R1 + R2");
assert(close(series.iTotal, 1) && close(series.i1, 1) && close(series.i2, 1),
  "circuit: the same 1 A flows through both resistors");
assert(close(series.v1, 4) && close(series.v2, 8), "circuit: the 12 V splits in proportion to R");
assert(close(series.p1, 4) && close(series.p2, 8) && close(series.pTotal, 12),
  "circuit: P = V·I and the powers add up");

const parallel = circuitResult({ V: 12, R1: 4, R2: 12, mode: "parallel" });
assert(close(parallel.rTotal, 3), "circuit: parallel 1/R = 1/R1 + 1/R2 → 3 Ω");
assert(close(parallel.i1, 3) && close(parallel.i2, 1) && close(parallel.iTotal, 4),
  "circuit: current splits inversely with resistance");
assert(close(parallel.v1, 12) && close(parallel.v2, 12), "circuit: both resistors see the full EMF");
assert(close(parallel.p1, 36) && close(parallel.p2, 12) && close(parallel.pTotal, 48),
  "circuit: parallel power dissipation adds up");
assert(close(series.pTotal, series.p1 + series.p2, 1e-9), "circuit: series power conservation");
assert(close(parallel.pTotal, parallel.p1 + parallel.p2, 1e-9), "circuit: parallel power conservation");

const twins = circuitResult({ V: 10, R1: 10, R2: 10, mode: "parallel" });
assert(close(twins.rTotal, 5) && close(twins.iTotal, 2), "circuit: two equal resistors halve the R");
assert(CIRCUIT_ASSUMPTIONS.length >= 3, "circuit: assumptions are stated in the UI");
assert(
  CIRCUIT_ASSUMPTIONS.some((a) => /internal resistance/i.test(a)),
  "circuit: the ideal-battery limit is stated",
);

/* -------------------------------------------------------------------------- */
/* 6. Geometric optics — thin lens and refraction                             */
/* -------------------------------------------------------------------------- */

const realImage = lensResult({ f: 10, u: -20 });
assert(close(realImage.v, 20), "lens: 1/v − 1/u = 1/f → v = +20 cm");
assert(close(realImage.magnification, -1), "lens: m = v/u = −1 (same size, inverted)");
assert(realImage.real && !realImage.upright && !realImage.magnifier,
  "lens: real, inverted image beyond 2F");

const magnified = lensResult({ f: 10, u: -5 });
assert(close(magnified.v, -10), "lens: object inside F → v = −10 cm (virtual)");
assert(close(magnified.magnification, 2), "lens: magnifier m = +2 (upright, doubled)");
assert(!magnified.real && magnified.upright && magnified.magnifier, "lens: simple magnifier case");

const atFocus = lensResult({ f: 10, u: -10 });
assert(atFocus.atFocus && !Number.isFinite(atFocus.v), "lens: object at F → image at infinity");
assert(!atFocus.real && !atFocus.upright, "lens: no image forms at a finite position at F");

const diverging = lensResult({ f: -10, u: -20 });
assert(close(diverging.v, -20 / 3, 1e-9), "lens: diverging lens always gives v < 0");
assert(close(diverging.magnification, 1 / 3, 1e-9), "lens: diverging image is diminished");
assert(!diverging.real && diverging.upright && !diverging.magnifier,
  "lens: virtual, upright, diminished image");

const snell1 = snellResult({ n1: 1, n2: 1.5, iDeg: 0 });
assert(close(snell1.refractDeg ?? Number.NaN, 0) && snell1.criticalDeg === null && !snell1.tir,
  "snell: light entering normally does not bend");
const snell2 = snellResult({ n1: 1, n2: 1.5, iDeg: 30 });
assert(close(snell2.refractDeg ?? Number.NaN, 19.47122063449069, 1e-9),
  "snell: n1·sin30° = n2·sin r → r ≈ 19.47°");
assert(close(snell2.leftSide, Math.sin(30 * DEG), 1e-9), "snell: the shared n·sin i value is shown");
const snell3 = snellResult({ n1: 1.5, n2: 1, iDeg: 45 });
assert(snell3.tir && snell3.refractDeg === null, "snell: beyond the critical angle → total internal reflection");
assert(close(snell3.criticalDeg ?? 0, 41.810314895778696, 1e-9), "snell: critical angle for glass → air");
assert(close(snell3.leftSide, 1.5 * Math.sin(45 * DEG)), "snell: n1·sin i exceeds n2");
const snell4 = snellResult({ n1: 1.5, n2: 1.5, iDeg: 30 });
assert(!snell4.tir && close(snell4.refractDeg ?? 0, 30, 1e-9), "snell: same medium → straight through");
assert(snell1.reflectDeg === 0 && snell2.reflectDeg === 30 && snell3.reflectDeg === 45,
  "snell: reflection always equals incidence");
assert(OPTICS_ASSUMPTIONS.length >= 3, "optics: assumptions are stated in the UI");
assert(
  OPTICS_ASSUMPTIONS.some((a) => /paraxial|aberration/i.test(a)),
  "optics: the thin-lens/paraxial limit is stated",
);

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("Physics/Phase-4 tests FAILED");
  process.exit(1);
}
console.log("Physics/Phase-4 tests passed");
