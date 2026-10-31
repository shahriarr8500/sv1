/**
 * Quadratic-functions engine for the Mathematics lab (application-owned).
 *
 * Everything the quadratic lab draws or prints — the curve, the vertex, the
 * axis of symmetry, the discriminant, the roots — is computed here from the
 * coefficient triple (a, b, c) by exact algebra. Same inputs → same numbers,
 * so the equation, the readouts and the picture can never disagree.
 *
 * Pure and DOM-free so `bun src/tests/labMath.test.ts` can pin the algebra
 * the student sees.
 */

/** Coefficients of y = a·x² + b·x + c (a must be non-zero for a parabola). */
export interface Quadratic {
  a: number;
  b: number;
  c: number;
}

/** Everything the lab displays about y = a·x² + b·x + c. */
export interface QuadraticFeatures {
  /** b² − 4ac — sign decides how many real roots exist. */
  discriminant: number;
  /** Vertex (h, k) — also the minimum when a > 0, maximum when a < 0. */
  vertex: { h: number; k: number };
  /** Axis of symmetry x = h. */
  axisX: number;
  /** Where the curve crosses the y-axis: (0, c). */
  yIntercept: number;
  /** Real roots, ascending: 0, 1 or 2 entries. */
  roots: number[];
  /** True when the parabola opens upward (a > 0). */
  opensUp: boolean;
}

/** Guard used by every consumer: |a| below this reads as "not a parabola". */
export const MIN_ABS_A = 0.05;

/** Clamp a coefficient so it can never collapse the parabola to a line. */
export function clampA(a: number): number {
  if (!Number.isFinite(a)) return 1;
  if (Math.abs(a) < MIN_ABS_A) return a < 0 || Object.is(a, -0) ? -MIN_ABS_A : MIN_ABS_A;
  return Math.min(10, Math.max(-10, a));
}

/**
 * Vertex form y = a·(x − h)² + k  →  standard form y = a·x² + b·x + c.
 * Used when the student drags the vertex handle: a stays put, b and c follow.
 */
export function vertexToStandard(a: number, h: number, k: number): Quadratic {
  const safeA = clampA(a);
  return {
    a: safeA,
    b: -2 * safeA * h,
    c: safeA * h * h + k,
  };
}

/** Real roots of a·x² + b·x + c = 0, ascending (empty when discriminant < 0). */
export function quadraticRoots(a: number, b: number, c: number): number[] {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return [];
  if (Math.abs(a) < Number.EPSILON) return [];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-b / (2 * a)];
  const root = Math.sqrt(discriminant);
  const r1 = (-b - root) / (2 * a);
  const r2 = (-b + root) / (2 * a);
  return r1 <= r2 ? [r1, r2] : [r2, r1];
}

/** Full feature set for y = a·x² + b·x + c (the lab's readout panel). */
export function quadraticFeatures(q: Quadratic): QuadraticFeatures {
  const { a, b, c } = q;
  const discriminant = b * b - 4 * a * c;
  const h = -b / (2 * a);
  const k = a * h * h + b * h + c;
  return {
    discriminant,
    vertex: { h, k },
    axisX: h,
    yIntercept: c,
    roots: quadraticRoots(a, b, c),
    opensUp: a > 0,
  };
}

/** y-value of the parabola at x (finite inputs only). */
export function quadraticY(q: Quadratic, x: number): number {
  return q.a * x * x + q.b * x + q.c;
}

/** Sample the parabola over [xMin, xMax] with n points (for drawing). */
export function sampleParabola(
  q: Quadratic,
  xMin: number,
  xMax: number,
  n = 160,
): { x: number; y: number }[] {
  const count = Math.max(2, Math.floor(n));
  const span = xMax - xMin;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = xMin + (span * i) / (count - 1);
    points.push({ x, y: quadraticY(q, x) });
  }
  return points;
}

/** One display term: a body ("2x²", "x", "5") plus its sign. */
function termBody(coefficient: number, power: 0 | 1 | 2): string {
  const abs = Math.abs(coefficient);
  const isInteger = Math.abs(abs - Math.round(abs)) < 1e-9;
  const number = isInteger ? String(Math.round(abs)) : abs.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (power === 0) return number;
  const glyph = power === 2 ? "x²" : "x";
  return `${number === "1" ? "" : number}${glyph}`;
}

/**
 * Render y = a·x² + b·x + c the way it is written on paper, e.g.
 * `y = 2x² − 3x + 1`. Zero terms are dropped; signs use a typographic minus.
 */
export function formatQuadratic(q: Quadratic): string {
  const terms: { negative: boolean; body: string }[] = [];
  const push = (value: number, power: 0 | 1 | 2): void => {
    if (Math.abs(value) < 1e-9) return;
    terms.push({ negative: value < 0, body: termBody(value, power) });
  };
  push(q.a, 2);
  push(q.b, 1);
  push(q.c, 0);
  if (terms.length === 0) return "y = 0";
  let out = "";
  terms.forEach((term, index) => {
    if (index === 0) out = term.negative ? `−${term.body}` : term.body;
    else out += term.negative ? ` − ${term.body}` : ` + ${term.body}`;
  });
  return `y = ${out}`;
}

/** Short human label for the discriminant's meaning (readout tone follows it). */
export function discriminantLabel(d: number): { text: string; tone: "warn" | "good" | "default" } {
  if (d > 1e-9) return { text: "> 0 — two distinct real roots", tone: "good" };
  if (d >= -1e-9) return { text: "= 0 — one repeated real root", tone: "good" };
  return { text: "< 0 — no real roots", tone: "warn" };
}
