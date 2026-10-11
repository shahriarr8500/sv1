/**
 * Tests for Ashy's Phase 3 math engine.
 *
 * Run with:  bun src/tests/ashyMath.test.ts
 * Exit code 0 = all assertions passed.
 *
 * These exercise the SAME pure functions the explorers and the Convex chat
 * action run in production (src/lib/ashy-math.ts, src/lib/ashy-graph.ts and
 * the marker helpers in src/convex/ashyShared.ts). No DOM, no network, no
 * keys — every assertion is deterministic.
 */

import {
  addVectors,
  degreesToRadians,
  describeVector,
  directionDegrees,
  dotProduct,
  dotRelation,
  explainDot,
  formatNumber,
  isFiniteNumber,
  kmhToMs,
  magnitude,
  makeVec,
  msToKmh,
  radiansToDegrees,
  scaleVector,
  unitVector,
} from "../lib/ashy-math";
import {
  DEFAULT_BOUNDS,
  MAX_EXPRESSION_LENGTH,
  normalizeBounds,
  parseExpression,
  plotSegments,
  sampleExpression,
  validateExploreSpec,
  type ParsedExpression,
} from "../lib/ashy-graph";
import {
  MATH_VISUALIZATION_INSTRUCTION,
  extractExploreMarker,
} from "../convex/ashyShared";

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

/** Evaluates a parsed expression at exactly x (middle of a 21-sample window).
 *  plotSegments clamps sample counts to ≥20, so the window uses 21 and the
 *  middle index (10) lands exactly on x. */
function evalAt(
  source: string,
  x: number,
  params: Record<string, number> = {},
): number {
  const parsed = parseExpression(source);
  if (!parsed.ok) throw new Error(`unexpected parse failure: ${source}`);
  const segments = plotSegments(
    parsed,
    params,
    { xMin: x - 0.5, xMax: x + 0.5, yMin: -1e9, yMax: 1e9 },
    21,
  );
  const middle = segments.flat()[10];
  return middle ? middle.y : Number.NaN;
}

/* -------------------------------------------------------------------------- */
/* 1. makeVec + isFiniteNumber — invalid input never becomes zero              */
/* -------------------------------------------------------------------------- */

assert(isFiniteNumber(3) && !isFiniteNumber(NaN), "isFiniteNumber basics");
assert(!isFiniteNumber(Infinity), "Infinity is not a finite number");
assert(
  JSON.stringify(makeVec(3, -4)) === JSON.stringify({ x: 3, y: -4 }),
  "makeVec accepts normal components (incl. negatives)",
);
assert(makeVec(Number.NaN, 1) === null, "makeVec rejects NaN components");
assert(makeVec(1, Infinity) === null, "makeVec rejects Infinity components");
assert(
  makeVec(1000.0001, 0) === null && makeVec(1000, 0) !== null,
  "makeVec enforces the ±1000 component cap inclusively",
);

/* -------------------------------------------------------------------------- */
/* 2. Vector arithmetic                                                        */
/* -------------------------------------------------------------------------- */

assert(
  JSON.stringify(addVectors({ x: 3, y: 4 }, { x: -1, y: 2 })) ===
    JSON.stringify({ x: 2, y: 6 }),
  "addVectors adds components, negatives included",
);
assert(
  JSON.stringify(addVectors({ x: 0, y: 0 }, { x: 0, y: 0 })) ===
    JSON.stringify({ x: 0, y: 0 }),
  "adding the zero vector is a no-op",
);
assert(
  close(scaleVector({ x: 2, y: -3 }, -2).x, -4) &&
    close(scaleVector({ x: 2, y: -3 }, -2).y, 6),
  "scaleVector handles negative scalars",
);

/* -------------------------------------------------------------------------- */
/* 3. Magnitude                                                                */
/* -------------------------------------------------------------------------- */

assert(close(magnitude({ x: 3, y: 4 }), 5), "3-4-5 triangle magnitude");
assert(magnitude({ x: 0, y: 0 }) === 0, "zero vector magnitude is 0 (valid)");
assert(
  close(magnitude({ x: -5, y: 12 }), 13),
  "magnitude ignores component signs",
);

/* -------------------------------------------------------------------------- */
/* 4. Direction                                                                */
/* -------------------------------------------------------------------------- */

assert(directionDegrees({ x: 0, y: 0 }) === null, "zero vector has NO direction");
assert(directionDegrees({ x: 1, y: 0 }) === 0, "east is 0°");
assert(directionDegrees({ x: 0, y: 1 }) === 90, "north is 90°");
assert(directionDegrees({ x: -1, y: 0 }) === 180, "west is 180° (not -180°)");
assert(directionDegrees({ x: 0, y: -1 }) === -90, "south is -90°");
assert(close(directionDegrees({ x: 1, y: 1 }) ?? 0, 45), "diagonal is 45°");

/* -------------------------------------------------------------------------- */
/* 5. Dot product, relation, unit vectors                                      */
/* -------------------------------------------------------------------------- */

assert(dotProduct({ x: 1, y: 0 }, { x: 0, y: 1 }) === 0, "orthogonal dot is 0");
assert(dotProduct({ x: 2, y: 3 }, { x: 4, y: 6 }) === 26, "parallel dot value");
assert(
  dotProduct({ x: 2, y: 0 }, { x: -3, y: 0 }) === -6,
  "opposite-direction dot is negative",
);
assert(
  dotProduct({ x: 0, y: 0 }, { x: 5, y: 5 }) === 0,
  "zero vector dot is always 0",
);

assert(dotRelation({ x: 1, y: 0 }, { x: 0, y: 5 }) === "perpendicular", "perpendicular detected");
assert(dotRelation({ x: 2, y: 2 }, { x: 5, y: 5 }) === "parallel", "parallel detected");
assert(
  dotRelation({ x: 2, y: 2 }, { x: -5, y: -5 }) === "antiparallel",
  "antiparallel detected",
);
assert(dotRelation({ x: 1, y: 0 }, { x: 1, y: 1 }) === "acute", "acute angle detected");
assert(dotRelation({ x: 1, y: 0 }, { x: -1, y: 1 }) === "obtuse", "obtuse angle detected");
assert(
  dotRelation({ x: 0, y: 0 }, { x: 1, y: 1 }) === "zeroVector",
  "zero vector relation is its own case",
);
assert(
  dotRelation({ x: 1, y: 0 }, { x: 1, y: 1e-12 }) === "parallel",
  "near-parallel still reads as parallel (relative tolerance)",
);

for (const relation of [
  "zeroVector",
  "parallel",
  "antiparallel",
  "perpendicular",
  "acute",
  "obtuse",
] as const) {
  const text = explainDot(relation);
  assert(
    typeof text === "string" && text.length > 20,
    `explanation exists for relation "${relation}"`,
  );
}

const unit = unitVector({ x: 3, y: 4 });
assert(unit !== null && close(magnitude(unit), 1), "unit vector has magnitude 1");
assert(unitVector({ x: 0, y: 0 }) === null, "zero vector has no unit vector");

/* -------------------------------------------------------------------------- */
/* 6. formatNumber — rounding, -0, non-finite                                  */
/* -------------------------------------------------------------------------- */

assert(formatNumber(2) === "2", "integer formats without decimals");
assert(formatNumber(5.5) === "5.5", "trailing zeros are trimmed");
assert(formatNumber(1.234) === "1.23", "rounds down at 2 places");
assert(formatNumber(1.236) === "1.24", "rounds up at 2 places");
assert(formatNumber(-1.236) === "-1.24", "rounds away from zero for negatives");
assert(formatNumber(-0.001) === "0", "sub-precision negatives round to 0, not -0");
assert(formatNumber(-0) === "0", "negative zero formats as 0");
assert(formatNumber(999.9995) === "1000", "carry across the decimal boundary");
assert(formatNumber(100) === "100", "large integers keep their zeros");
assert(formatNumber(Number.NaN) === "—", "NaN renders as an em dash");
assert(formatNumber(Infinity) === "—", "Infinity renders as an em dash");
assert(formatNumber(1.5, 0) === "2", "0 decimals rounds half away from zero");
assert(formatNumber(-1.5, 0) === "-2", "0 decimals rounds -1.5 to -2");

/* -------------------------------------------------------------------------- */
/* 7. Unit conversions                                                         */
/* -------------------------------------------------------------------------- */

assert(close(kmhToMs(36), 10), "36 km/h is exactly 10 m/s");
assert(close(msToKmh(10), 36), "10 m/s is exactly 36 km/h");
assert(close(msToKmh(kmhToMs(72.5)), 72.5), "km/h ↔ m/s round-trips");
assert(close(degreesToRadians(180), Math.PI), "180° is π radians");
assert(close(radiansToDegrees(Math.PI), 180), "π radians is 180°");

/* -------------------------------------------------------------------------- */
/* 8. describeVector — the exact readout string the explorer shows             */
/* -------------------------------------------------------------------------- */

const described = describeVector("A", { x: 3, y: 4 });
assert(
  described.includes("(3, 4)") && described.includes("5") && described.includes("53.13°"),
  "describeVector shows components, magnitude and direction",
);
assert(
  describeVector("Z", { x: 0, y: 0 }).includes("undefined"),
  "zero vector describes its direction as undefined",
);

/* -------------------------------------------------------------------------- */
/* 9. Graph parser — valid expressions evaluate deterministically              */
/* -------------------------------------------------------------------------- */

assert(close(evalAt("x^2", 3), 9), "x^2 at 3 is 9");
assert(close(evalAt("2x+1", 3), 7), "implicit multiplication: 2x+1");
assert(close(evalAt("-x^2", 2), -4), "unary minus binds looser than ^");
assert(close(evalAt("2^3^2", 0), 512), "exponentiation is right-associative");
assert(close(evalAt("sin(pi/2)", 0), 1), "sin(pi/2) = 1");
assert(close(evalAt("sqrt(x)", 9), 3), "sqrt(9) = 3");
assert(close(evalAt("log(100)", 0), 2), "log is base 10");
assert(close(evalAt("ln(e)", 0), 1), "ln(e) = 1");
assert(close(evalAt("3sin(x)", 0), 0), "3sin(x) parses and evaluates");
assert(close(evalAt("a*x+b", 2, { a: 3, b: 1 }), 7), "parameters a and b plug in");
assert(close(evalAt("abs(-x)", 4), 4), "abs of a negated variable");
assert(close(evalAt("round(2.6)", 0), 3), "round(2.6) = 3");
assert(close(evalAt("x^0.5", 4), 2), "fractional exponents work");
assert(close(evalAt("cos(pi)", 0), -1), "cos(pi) = -1");

const paramsOf = parseExpression("a*sin(x)+b*d");
assert(
  paramsOf.ok &&
    JSON.stringify(paramsOf.params) === JSON.stringify(["a", "b", "d"]),
  "parameters are detected in slider order",
);
assert(
  parseExpression("x").ok && (parseExpression("x") as ParsedExpression).params.length === 0,
  "no parameters when none are used",
);

/* -------------------------------------------------------------------------- */
/* 10. Graph parser — unsafe or malformed input is refused                     */
/* -------------------------------------------------------------------------- */

assert(!parseExpression("alert(1)").ok, "unknown functions are refused");
assert(!parseExpression("window").ok, "uppercase / unknown names are refused");
assert(!parseExpression("sin").ok, "a bare function name is refused");
assert(!parseExpression("((x)").ok, "unbalanced brackets are refused");
assert(!parseExpression("x +").ok, "trailing operators are refused");
assert(!parseExpression("").ok, "empty input is refused");
assert(!parseExpression("y=x").ok, "equation syntax is refused (expressions only)");
assert(!parseExpression("sin(x);alert(1)").ok, "statement separators are refused");
assert(!parseExpression("<script>").ok, "HTML is refused by the tokenizer");
assert(
  !parseExpression("x".repeat(MAX_EXPRESSION_LENGTH + 1)).ok,
  "over-length expressions are refused",
);
assert(
  !parseExpression("__proto__").ok,
  "prototype-style names are refused",
);

/* -------------------------------------------------------------------------- */
/* 11. normalizeBounds                                                         */
/* -------------------------------------------------------------------------- */

assert(
  JSON.stringify(normalizeBounds({})) === JSON.stringify(DEFAULT_BOUNDS),
  "empty bounds fall back to the defaults",
);
const sorted = normalizeBounds({ xMin: 5, xMax: -5 });
assert(sorted.xMin === -5 && sorted.xMax === 5, "unordered x bounds are sorted");
const tiny = normalizeBounds({ xMin: 2, xMax: 2 });
assert(tiny.xMax - tiny.xMin >= 10, "zero-width windows open up instead of dividing by zero");
const clamped = normalizeBounds({ yMax: 99999 });
assert(clamped.yMax === 1000, "extreme bounds clamp to ±1000");
const fromNaN = normalizeBounds({ xMin: Number.NaN });
assert(fromNaN.xMin === DEFAULT_BOUNDS.xMin, "NaN bounds fall back per-field");

/* -------------------------------------------------------------------------- */
/* 12. Sampling and discontinuities                                            */
/* -------------------------------------------------------------------------- */

const straight = plotSegments(
  parseExpression("x") as ParsedExpression,
  {},
  { xMin: -2, xMax: 2, yMin: -5, yMax: 5 },
  25,
);
assert(
  straight.length === 1 && straight[0].length === 25,
  "a straight line samples into one continuous segment",
);
assert(close(straight[0][12].y, 0), "the middle sample sits at x = 0");

const sine = plotSegments(
  parseExpression("sin(x)") as ParsedExpression,
  {},
  DEFAULT_BOUNDS,
  480,
);
assert(sine.length === 1, "sin(x) crossing zero never falsely breaks");

const tangent = plotSegments(
  parseExpression("tan(x)") as ParsedExpression,
  {},
  DEFAULT_BOUNDS,
  480,
);
assert(tangent.length > 1, "tan(x) breaks cleanly at its asymptotes");

const reciprocal = plotSegments(
  parseExpression("1/x") as ParsedExpression,
  {},
  DEFAULT_BOUNDS,
  480,
);
assert(reciprocal.length > 1, "1/x breaks at the discontinuity");

const failing = sampleExpression("alert(1)");
assert(!failing.ok, "sampleExpression surfaces parse failures");

/* -------------------------------------------------------------------------- */
/* 13. Explore markers — structured params only, always stripped               */
/* -------------------------------------------------------------------------- */

const vectors = extractExploreMarker(
  "Use the resultant:\n\n[[explore: vectors A=(3,4) B=(-1,2)]]",
);
assert(
  vectors.explore !== null &&
    vectors.explore.type === "vectors" &&
    vectors.explore.ax === 3 &&
    vectors.explore.by === 2,
  "a valid vectors marker parses its four components",
);
assert(
  vectors.clean === "Use the resultant:",
  "the marker line is stripped from the visible text",
);

const decimals = extractExploreMarker("[[explore: vectors A=(-1.5, 2.25) B=(0, -3)]]");
assert(
  decimals.explore !== null &&
    decimals.explore.type === "vectors" &&
    decimals.explore.ax === -1.5 &&
    decimals.explore.by === -3,
  "negative and decimal components parse",
);

const oversized = extractExploreMarker("[[explore: vectors A=(1001,0) B=(1,1)]]");
assert(oversized.explore === null, "out-of-cap components are dropped");
assert(oversized.clean === "", "a dropped marker still leaves clean text");

const malformed = extractExploreMarker("[[explore: vectors A=(3) B=(1,1)]]");
assert(malformed.explore === null, "malformed vectors markers are dropped");

const graph = extractExploreMarker("[[explore: graph y=a*sin(x)]]");
assert(
  graph.explore !== null &&
    graph.explore.type === "graph" &&
    graph.explore.expression === "a*sin(x)",
  "a graph marker strips the y= prefix and keeps the expression",
);
assert(graph.clean === "", "the graph marker is removed from the text");

const graphRaw = extractExploreMarker("[[explore: graph cos(x)/2]]");
assert(
  graphRaw.explore !== null &&
    graphRaw.explore.type === "graph" &&
    graphRaw.explore.expression === "cos(x)/2",
  "graph markers without an explicit y= also parse",
);

const hostile = extractExploreMarker("[[explore: graph <script>alert(1)</script>]]");
assert(hostile.explore === null, "graph expressions with illegal characters are dropped");

const executable = extractExploreMarker("[[explore: graph alert(1)]]");
assert(
  executable.explore !== null && executable.explore.type === "graph",
  "charset-valid but unparseable expressions pass the marker layer…",
);
assert(
  validateExploreSpec(executable.explore) === null,
  "…and are then refused by the render-time validator (no code runs)",
);

const twoMarkers = extractExploreMarker(
  "[[explore: vectors A=(1,1) B=(2,2)]]\n[[explore: vectors A=(3,3) B=(4,4)]]",
);
assert(twoMarkers.clean === "", "ALL marker occurrences are stripped, not just the first");
const first = twoMarkers.explore;
assert(
  first !== null && first.type === "vectors" && first.ax === 1,
  "only the first marker is honoured",
);

const noMarker = extractExploreMarker("Just an ordinary answer about vectors.");
assert(
  noMarker.explore === null &&
    noMarker.clean === "Just an ordinary answer about vectors.",
  "text without markers passes through untouched",
);

/* -------------------------------------------------------------------------- */
/* 14. The system instruction that produces the markers                        */
/* -------------------------------------------------------------------------- */

assert(
  /\[\[explore: vectors A=\(3,4\) B=\(-1,2\)\]\]/.test(MATH_VISUALIZATION_INSTRUCTION),
  "the instruction shows the exact vectors marker form",
);
assert(
  /\[\[explore: graph y=a\*sin\(x\)\]\]/.test(MATH_VISUALIZATION_INSTRUCTION),
  "the instruction shows the exact graph marker form",
);
assert(
  /never emit more than one marker/i.test(MATH_VISUALIZATION_INSTRUCTION),
  "one marker per reply is enforced in the prompt",
);
assert(
  /sin, cos, tan, asin, acos, atan, sqrt, abs, exp, ln, log, floor, ceil, round/.test(
    MATH_VISUALIZATION_INSTRUCTION,
  ),
  "the function whitelist matches the parser's",
);
assert(
  /stand alone/i.test(MATH_VISUALIZATION_INSTRUCTION),
  "answers must not depend on the visual",
);

/* -------------------------------------------------------------------------- */
/* 15. Render-time spec validation                                             */
/* -------------------------------------------------------------------------- */

assert(
  validateExploreSpec({ type: "vectors", ax: 3, ay: 4, bx: -1, by: 2 }) !== null,
  "a valid vectors spec renders",
);
assert(
  validateExploreSpec({ type: "vectors", ax: Number.NaN, ay: 0, bx: 1, by: 1 }) === null,
  "NaN components never render",
);
assert(
  validateExploreSpec({ type: "vectors", ax: 5000, ay: 0, bx: 1, by: 1 }) === null,
  "out-of-cap components never render",
);
assert(
  validateExploreSpec({ type: "graph", expression: "a*sin(x)" }) !== null,
  "a parseable graph expression renders",
);
assert(
  validateExploreSpec({ type: "graph", expression: "alert(1)" }) === null,
  "unparseable graph expressions never render",
);
assert(validateExploreSpec(null) === null, "missing specs render nothing");
assert(
  validateExploreSpec(undefined) === null,
  "undefined specs render nothing",
);

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("Math/Phase-3 tests FAILED");
  process.exit(1);
}
console.log("Math/Phase-3 tests passed");
