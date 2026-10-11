/**
 * Ashy math engine — deterministic, pure vector mathematics for the
 * interactive explorers (Phase 3).
 *
 * The rule everywhere in this phase: Gemini explains the REASONING, these
 * functions compute the RESULTS. Every number the explorer shows — components,
 * magnitudes, directions, the dot product and its explanation — comes from
 * these functions, so the arrows and the readouts can never disagree.
 *
 * Isomorphic on purpose: the same code runs in the browser (explorer UI) and
 * in a plain `bun` test script. No DOM, no globals, no dependencies.
 */

/** A two-dimensional vector (cartesian components). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Components beyond this are refused — keeps explorers and plots sane. */
export const MAX_COMPONENT = 1000;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates and builds a vector. Returns null for non-finite or out-of-range
 * components — callers treat null as "input not usable", never as zero.
 */
export function makeVec(x: number, y: number): Vec2 | null {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (Math.abs(x) > MAX_COMPONENT || Math.abs(y) > MAX_COMPONENT) return null;
  return { x, y };
}

export function addVectors(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scaleVector(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k };
}

/** Length of the vector. The zero vector has magnitude 0 (valid). */
export function magnitude(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Direction in degrees via atan2, normalized to (-180, 180] with -180
 * folded to 180 and -0 cleaned to 0. The zero vector has NO direction —
 * returning null (not 0) keeps "no direction" from masquerading as "points
 * right".
 */
export function directionDegrees(v: Vec2): number | null {
  if (v.x === 0 && v.y === 0) return null;
  const deg = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  if (deg <= -180 + 1e-9) return 180;
  if (Math.abs(deg) < 1e-12) return 0;
  return deg;
}

export function dotProduct(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Unit vector in v's direction; null for the zero vector (undefined). */
export function unitVector(v: Vec2): Vec2 | null {
  const m = magnitude(v);
  if (m === 0) return null;
  return { x: v.x / m, y: v.y / m };
}

/* -------------------------------------------------------------------------- */
/* Rounding & formatting (deterministic: half away from zero, -0 → "0")        */
/* -------------------------------------------------------------------------- */

/**
 * Rounds half away from zero at `decimals` places and formats for display.
 * - Non-finite input renders as an em dash ("—"), never "NaN" or "Infinity".
 * - "-0" and "-0.00" normalize to "0".
 * - Trailing zeros are trimmed ("5.50" → "5.5", "100.00" → "100").
 */
export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const factor = 10 ** decimals;
  const rounded =
    (Math.sign(value) || 1) * Math.round(Math.abs(value) * factor) / factor;
  const fixed = rounded.toFixed(decimals).replace(/\.?0+$/, "");
  return fixed === "" || fixed === "-" ? "0" : fixed;
}

/* -------------------------------------------------------------------------- */
/* Unit conversions (HSC physics scope)                                        */
/* -------------------------------------------------------------------------- */

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** 36 km/h is exactly 10 m/s. */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}

export function msToKmh(ms: number): number {
  return ms * 3.6;
}

/* -------------------------------------------------------------------------- */
/* Dot-product interpretation — the reasoning shown next to the number         */
/* -------------------------------------------------------------------------- */

export type DotRelation =
  | "zeroVector"
  | "parallel"
  | "antiparallel"
  | "perpendicular"
  | "acute"
  | "obtuse";

/**
 * Classifies the angle between two vectors from the sign of the dot product
 * and the (deterministic) cross product, with a relative tolerance so that
 * e.g. (1,0)·(0.9999999999,1e-12) still reads as parallel.
 */
export function dotRelation(a: Vec2, b: Vec2): DotRelation {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return "zeroVector";
  const d = dotProduct(a, b);
  if (d === 0) return "perpendicular";
  const cross = a.x * b.y - a.y * b.x;
  const tolerance = 1e-9 * ma * mb;
  if (Math.abs(cross) <= tolerance) {
    return d > 0 ? "parallel" : "antiparallel";
  }
  return d > 0 ? "acute" : "obtuse";
}

/** Student-facing explanation for a dot-product result. */
export function explainDot(relation: DotRelation): string {
  switch (relation) {
    case "zeroVector":
      return "At least one vector is the zero vector, so its length is 0 and the dot product is always 0 — it has no direction.";
    case "perpendicular":
      return "The dot product is 0, which means the vectors are perpendicular (the angle between them is 90°).";
    case "parallel":
      return "The dot product is positive and the vectors point the same way — the angle between them is 0°.";
    case "antiparallel":
      return "The dot product is negative and the vectors point in opposite directions — the angle between them is 180°.";
    case "acute":
      return "The dot product is positive, so the angle between the vectors is acute (less than 90°).";
    case "obtuse":
      return "The dot product is negative, so the angle between the vectors is obtuse (more than 90°).";
  }
}

/**
 * A compact, human-readable summary of one vector — the exact string the
 * explorer shows, produced here so it can be tested.
 */
export function describeVector(label: string, v: Vec2): string {
  const angle = directionDegrees(v);
  const angleText = angle === null ? "undefined" : `${formatNumber(angle)}°`;
  return `${label} = (${formatNumber(v.x)}, ${formatNumber(v.y)}) · |${label}| = ${formatNumber(magnitude(v))} · θ = ${angleText}`;
}
