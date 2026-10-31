/**
 * Tests for the Mathematics lab engine (quadratic functions).
 *
 * Run with:  bun src/tests/labMath.test.ts
 * Exit code 0 = all assertions passed.
 *
 * Every assertion is deterministic: the math lab draws ONLY from the pure
 * functions below, so whatever these prove about the algebra is exactly what
 * the student sees on the curve, the equation line and the readouts.
 */

import {
  MIN_ABS_A,
  clampA,
  discriminantLabel,
  formatQuadratic,
  quadraticFeatures,
  quadraticRoots,
  quadraticY,
  sampleParabola,
  vertexToStandard,
} from "../lib/lab/quadratic";

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
/* Roots                                                                      */
/* -------------------------------------------------------------------------- */

assert(
  close(quadraticRoots(1, 0, -4)[0] ?? NaN, -2) &&
    close(quadraticRoots(1, 0, -4)[1] ?? NaN, 2),
  "x² − 4 = 0 has roots −2 and 2",
);
assert(quadraticRoots(1, 2, 1).length === 1 && close(quadraticRoots(1, 2, 1)[0], -1),
  "x² + 2x + 1 = 0 has exactly one repeated root at −1");
assert(quadraticRoots(1, 0, 4).length === 0, "x² + 4 = 0 has no real roots");
assert(quadraticRoots(-2, 0, -8).length === 0, "−2x² − 8 = 0 has no real roots either");
assert(
  quadraticRoots(2, -3, -5).length === 2 &&
    close(quadraticRoots(2, -3, -5)[0], -1) &&
    close(quadraticRoots(2, -3, -5)[1], 2.5),
  "2x² − 3x − 5 = 0 has roots −1 and 2.5",
);
assert(quadraticRoots(0, 5, 1).length === 0, "a = 0 is not a parabola — no roots reported");
assert(quadraticRoots(NaN, 1, 1).length === 0, "NaN coefficients yield no roots");

/* -------------------------------------------------------------------------- */
/* Features (the readout panel)                                               */
/* -------------------------------------------------------------------------- */

const features = quadraticFeatures({ a: 1, b: -4, c: 1 });
assert(close(features.discriminant, 12), "discriminant = b² − 4ac = 16 − 4 = 12");
assert(close(features.vertex.h, 2) && close(features.vertex.k, -3), "vertex of x² − 4x + 1 is (2, −3)");
assert(close(features.axisX, 2), "axis of symmetry is x = 2");
assert(close(features.yIntercept, 1), "y-intercept is c = 1");
assert(features.opensUp === true, "a > 0 opens upward");
assert(features.roots.length === 2, "two real roots when the discriminant is positive");

const flipped = quadraticFeatures({ a: -1, b: 0, c: 4 });
assert(flipped.opensUp === false, "a < 0 opens downward");
assert(flipped.roots.length === 2 && close(flipped.roots[0], -2) && close(flipped.roots[1], 2),
  "−x² + 4 = 0 still crosses at ±2");
assert(close(flipped.vertex.k, 4) && close(flipped.vertex.h, 0), "downward parabola's vertex is its maximum");

/* -------------------------------------------------------------------------- */
/* Vertex form ↔ standard form (the drag handle algebra)                      */
/* -------------------------------------------------------------------------- */

const converted = vertexToStandard(2, 3, -5); // y = 2(x − 3)² − 5
assert(close(converted.a, 2), "vertex form keeps a");
assert(close(converted.b, -12), "vertex form y = 2(x−3)² − 5 expands to b = −12");
assert(close(converted.c, 13), "vertex form y = 2(x−3)² − 5 expands to c = 13");
const roundTrip = quadraticFeatures(converted);
assert(close(roundTrip.vertex.h, 3) && close(roundTrip.vertex.k, -5),
  "dragging the vertex to (3, −5) reproduces that vertex exactly");

const negativeA = vertexToStandard(-0.5, -2, 4);
assert(close(quadraticFeatures(negativeA).vertex.h, -2) && close(quadraticFeatures(negativeA).vertex.k, 4),
  "vertex drag works for downward parabolas too");

/* -------------------------------------------------------------------------- */
/* Guards — a parabola can never collapse to a line                           */
/* -------------------------------------------------------------------------- */

assert(Math.abs(clampA(0)) === MIN_ABS_A, "a = 0 is clamped to a minimum magnitude");
assert(clampA(-0.01) === -MIN_ABS_A, "a tiny negative stays negative at the minimum magnitude");
assert(clampA(50) === 10, "a is clamped to ±10 so the curve stays readable");
assert(Number.isFinite(clampA(NaN)), "NaN coefficients fall back to a finite value");
assert(close(vertexToStandard(0, 2, 3).a, MIN_ABS_A), "vertex drag never collapses a to zero");

/* -------------------------------------------------------------------------- */
/* Sampling & evaluation (what the curve actually draws)                      */
/* -------------------------------------------------------------------------- */

const samples = sampleParabola({ a: 1, b: 0, c: 0 }, -2, 2, 5);
assert(samples.length === 5, "sampling returns the requested number of points");
assert(close(samples[0].x, -2) && close(samples[4].x, 2), "samples span exactly the requested window");
assert(samples.every((point) => close(point.y, point.x * point.x)),
  "every sampled y equals x² on this window");
assert(close(quadraticY({ a: 2, b: 3, c: -1 }, 4), 2 * 16 + 3 * 4 - 1),
  "y = ax² + bx + c evaluates correctly");

/* -------------------------------------------------------------------------- */
/* Display formatting (the equation line students read)                       */
/* -------------------------------------------------------------------------- */

assert(formatQuadratic({ a: 2, b: -3, c: 1 }) === "y = 2x² − 3x + 1",
  "standard form renders with typographic minus");
assert(formatQuadratic({ a: 1, b: 0, c: -4 }) === "y = x² − 4",
  "a zero b-term is dropped entirely");
assert(formatQuadratic({ a: 1, b: 1, c: 0 }) === "y = x² + x",
  "a zero c-term is dropped; leading 1 coefficient is implicit");
assert(formatQuadratic({ a: -1, b: 0, c: 0 }) === "y = −x²",
  "a negative leading coefficient shows the minus");

/* -------------------------------------------------------------------------- */
/* Discriminant label (readout copy)                                          */
/* -------------------------------------------------------------------------- */

assert(discriminantLabel(5).tone === "good" && /two/.test(discriminantLabel(5).text),
  "positive discriminant reports two roots");
assert(discriminantLabel(0).tone === "good" && /one/.test(discriminantLabel(0).text),
  "zero discriminant reports one root");
assert(discriminantLabel(-3).tone === "warn" && /no real/.test(discriminantLabel(-3).text),
  "negative discriminant reports no real roots");

/* -------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`labMath: ${checks} checks passed`);
