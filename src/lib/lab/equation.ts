/**
 * Chemical equation parsing, balancing and verification (Phase 4 lab).
 *
 * Balancing is exact linear algebra over the rationals (no floats, no
 * guessing): the coefficient vector is the null space of the atom-count
 * matrix extended with a charge row, so ELEMENT COUNTS AND CHARGE are
 * balanced by construction — and `checkEquation` re-verifies both with code
 * before anything is displayed as "balanced".
 *
 * A balanced equation only proves bookkeeping. It says nothing about
 * whether the reaction actually occurs (kinetics, thermodynamics,
 * side reactions) — every UI surface says this out loud too.
 */

import {
  parseSpecies,
  type ParsedSpecies,
} from "./formula";

export interface EquationSpecies {
  raw: string;
  coefficient: number;
  species: ParsedSpecies;
}

export interface ParsedEquation {
  reactants: EquationSpecies[];
  products: EquationSpecies[];
  /** Every element mentioned on either side, sorted. */
  elements: string[];
}

export type EquationParseResult =
  | { ok: true; value: ParsedEquation }
  | { ok: false; error: string };

const MAX_EQUATION_LENGTH = 300;
const MAX_SPECIES = 24;

/** Arrow forms accepted between the two sides. */
const ARROW = /(<=>|<->|-->|->|→|⇒|⇌|=)/;

function fail(error: string): EquationParseResult {
  return { ok: false, error };
}

/**
 * Charge-aware top-level `+` splitter. The tricky part: `Cu2+ + H2O` has a
 * `+` that belongs to the species charge and one that separates species.
 * Strategy: try "separator" first; if the remainder can't itself be split
 * (e.g. it would start with a stray `+`), treat this `+` as part of the
 * charge and continue. Bounded recursion protects against pathological
 * input like "+++++".
 */
let splitCalls = 0;
function splitOnPlus(text: string): string[] | null {
  splitCalls += 1;
  if (splitCalls > 400) return null;
  const tokens: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === "+" && depth === 0) {
      const before = text.slice(start, i).trim();
      const after = text.slice(i + 1);
      if (before.length > 0 && parseSpecies(before).ok) {
        const trimmedAfter = after.trimStart();
        if (trimmedAfter.length > 0) {
          const rest = splitOnPlus(trimmedAfter);
          if (rest) return [...tokens, before, ...rest];
        }
      }
      // Otherwise this `+` is (probably) a species charge — keep scanning.
    }
  }
  const last = text.slice(start).trim();
  if (last.length > 0) tokens.push(last);
  return tokens;
}

/** Parse one full side of an equation (a `+`-separated species list). */
function parseSide(
  text: string,
): { ok: true; value: EquationSpecies[] } | { ok: false; error: string } {
  splitCalls = 0;
  const tokens = splitOnPlus(text);
  if (!tokens || tokens.length === 0) {
    return { ok: false, error: `Could not split side "${text.trim()}" into species.` };
  }
  if (tokens.length > MAX_SPECIES) {
    return { ok: false, error: "Too many species in one side (max 24)." };
  }
  const out: EquationSpecies[] = [];
  for (const token of tokens) {
    const parsed = parseSpecies(token);
    if (!parsed.ok) {
      return { ok: false, error: `In "${text.trim()}": ${parsed.error}` };
    }
    out.push({ raw: token, coefficient: parsed.coefficient, species: parsed.species });
  }
  return { ok: true, value: out };
}

/** Parse an equation string into its two sides. Exactly one arrow. */
export function parseEquation(text: string): EquationParseResult {
  if (typeof text !== "string") return fail("Equation must be text.");
  const trimmed = text.trim();
  if (trimmed.length === 0) return fail("The equation is empty.");
  if (trimmed.length > MAX_EQUATION_LENGTH) {
    return fail(`Equation is too long (max ${MAX_EQUATION_LENGTH} characters).`);
  }
  const arrows: number[] = [];
  const re = new RegExp(ARROW.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    arrows.push(match.index);
    re.lastIndex = match.index + match[0].length;
  }
  if (arrows.length === 0) {
    return fail("No reaction arrow found — write something like H2 + O2 -> H2O.");
  }
  if (arrows.length > 1) {
    return fail("Found more than one reaction arrow — one equation per line.");
  }
  const arrowIndex = arrows[0];
  const arrowMatch = ARROW.exec(trimmed.slice(arrowIndex));
  const leftText = trimmed.slice(0, arrowIndex);
  const rightText = trimmed.slice(arrowIndex + (arrowMatch?.[0].length ?? 2));
  if (leftText.trim().length === 0 || rightText.trim().length === 0) {
    return fail("Both sides of the equation need at least one species.");
  }
  const left = parseSide(leftText);
  if (!left.ok) return fail(left.error);
  const right = parseSide(rightText);
  if (!right.ok) return fail(right.error);

  const elements = new Set<string>();
  for (const entry of [...left.value, ...right.value]) {
    for (const symbol of Object.keys(entry.species.atoms)) elements.add(symbol);
  }
  return {
    ok: true,
    value: {
      reactants: left.value,
      products: right.value,
      elements: [...elements].sort(),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Exact rational arithmetic (small integers only)                            */
/* -------------------------------------------------------------------------- */

interface Frac {
  n: number;
  d: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error("Division by zero in balance solver.");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

function fAdd(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

function fMul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

function fSub(a: Frac, b: Frac): Frac {
  return fAdd(a, frac(-b.n, b.d));
}

function fDiv(a: Frac, b: Frac): Frac {
  if (b.n === 0) throw new Error("Division by zero in balance solver.");
  return frac(a.n * b.d, a.d * b.n);
}

function lcm(a: number, b: number): number {
  const g = gcd(a, b) || 1;
  return Math.abs(a / g) * Math.abs(b);
}

/* -------------------------------------------------------------------------- */
/* Balancing                                                                  */
/* -------------------------------------------------------------------------- */

export interface AtomRow {
  /** Element symbol, or "charge" for the charge-balance row. */
  key: string;
  left: number;
  right: number;
  ok: boolean;
}

export interface BalanceOk {
  ok: true;
  equation: ParsedEquation;
  /** Coefficients in order: reactants first, then products. */
  coefficients: number[];
  /** Balanced equation text with coefficients filled in. */
  text: string;
  /** Per-element (and charge) counts before balancing would be unbalanced;
   *  rows here are computed WITH the returned coefficients — all `ok`. */
  rows: AtomRow[];
  balanced: boolean;
}

export type BalanceResult = BalanceOk | { ok: false; error: string };

function sideCounts(
  equation: ParsedEquation,
  coefficients: number[],
): { rows: AtomRow[]; balanced: boolean } {
  const rows: AtomRow[] = [];
  const n = equation.reactants.length;
  for (const element of equation.elements) {
    let left = 0;
    let right = 0;
    equation.reactants.forEach((entry, i) => {
      left += (entry.species.atoms[element] ?? 0) * coefficients[i];
    });
    equation.products.forEach((entry, i) => {
      right += (entry.species.atoms[element] ?? 0) * coefficients[n + i];
    });
    rows.push({ key: element, left, right, ok: left === right });
  }
  let chargeLeft = 0;
  let chargeRight = 0;
  equation.reactants.forEach((entry, i) => {
    chargeLeft += entry.species.charge * coefficients[i];
  });
  equation.products.forEach((entry, i) => {
    chargeRight += entry.species.charge * coefficients[n + i];
  });
  rows.push({ key: "charge", left: chargeLeft, right: chargeRight, ok: chargeLeft === chargeRight });
  return { rows, balanced: rows.every((row) => row.ok) };
}

/** Render coefficients + raw species as a clean equation string. */
export function formatEquation(equation: ParsedEquation, coefficients: number[]): string {
  const n = equation.reactants.length;
  const render = (entry: EquationSpecies, coefficient: number): string =>
    `${coefficient === 1 ? "" : coefficient}${entry.raw.replace(/^\d+/, "")}`;
  const left = equation.reactants.map((e, i) => render(e, coefficients[i])).join(" + ");
  const right = equation.products.map((e, i) => render(e, coefficients[n + i])).join(" + ");
  return `${left} -> ${right}`;
}

/**
 * Balance an equation exactly. Returns integer coefficients (smallest
 * positive set for a unique 1-dimensional solution) plus the per-element
 * and charge verification rows computed WITH those coefficients.
 */
export function balanceEquation(text: string): BalanceResult {
  const parsed = parseEquation(text);
  if (!parsed.ok) return parsed;
  const equation = parsed.value;
  const species = [...equation.reactants, ...equation.products];
  const n = species.length;
  const signs = [
    ...equation.reactants.map(() => 1),
    ...equation.products.map(() => -1),
  ];

  // Rows: one per element + charge. Entry = sign × count.
  const rowKeys = [...equation.elements, "__charge__"];
  const matrix: Frac[][] = rowKeys.map((key) =>
    species.map((entry, i) => {
      const value =
        key === "__charge__"
          ? entry.species.charge
          : (entry.species.atoms[key] ?? 0);
      return frac(value * signs[i]);
    }),
  );

  // RREF over the rationals.
  const rows = matrix.length;
  const pivotCols: number[] = [];
  let row = 0;
  for (let col = 0; col < n && row < rows; col += 1) {
    let pivot = -1;
    for (let r = row; r < rows; r += 1) {
      if (matrix[r][col].n !== 0) {
        pivot = r;
        break;
      }
    }
    if (pivot === -1) continue;
    [matrix[pivot], matrix[row]] = [matrix[row], matrix[pivot]];
    const p = matrix[row][col];
    for (let c = 0; c < n; c += 1) matrix[row][c] = fDiv(matrix[row][c], p);
    for (let r = 0; r < rows; r += 1) {
      if (r === row) continue;
      const factor = matrix[r][col];
      if (factor.n === 0) continue;
      for (let c = 0; c < n; c += 1) {
        matrix[r][c] = fSub(matrix[r][c], fMul(factor, matrix[row][c]));
      }
    }
    pivotCols.push(col);
    row += 1;
  }

  // Row of all zeros in a homogeneous system is always satisfied.
  const freeCols: number[] = [];
  for (let col = 0; col < n; col += 1) {
    if (!pivotCols.includes(col)) freeCols.push(col);
  }
  if (freeCols.length === 0) {
    return {
      ok: false,
      error:
        "This equation cannot be balanced as written — some atom or charge appears on only one side (or the species are wrong). Check the formulae.",
    };
  }

  const rowForPivot = (col: number): number =>
    pivotCols.indexOf(col) === -1 ? -1 : pivotCols.indexOf(col);

  /** Null-space vector for a chosen free-column value (all others zero). */
  const basisVector = (freeIndex: number): Frac[] => {
    const vec: Frac[] = new Array(n).fill(frac(0));
    vec[freeCols[freeIndex]] = frac(1);
    for (let p = 0; p < pivotCols.length; p += 1) {
      const col = pivotCols[p];
      // In RREF, row p has a 1 at `col`; the coefficient of free column f
      // lives at matrix[p][freeCols[freeIndex]]. Pivot value = −that.
      vec[col] = frac(-matrix[p][freeCols[freeIndex]].n, matrix[p][freeCols[freeIndex]].d);
    }
    return vec;
  };
  void rowForPivot;

  /** Try to turn a rational vector into small positive integers. */
  const toPositiveIntegers = (vec: Frac[]): number[] | null => {
    if (vec.every((v) => v.n === 0)) return null;
    let den = 1;
    for (const v of vec) {
      if (v.n === 0) continue;
      den = lcm(den, v.d);
      if (den > 10_000_000) return null; // refuse absurd coefficients
    }
    const ints = vec.map((v) => Math.round((v.n * den) / v.d));
    if (ints.some((v) => !Number.isInteger(v))) return null;
    if (ints.some((v) => v <= 0)) {
      // Try flipping all signs (orientation is arbitrary here).
      const flipped = ints.map((v) => -v);
      if (flipped.some((v) => v <= 0)) return null;
      return normalize(flipped);
    }
    return normalize(ints);
  };

  const normalize = (values: number[]): number[] => {
    let g = 0;
    for (const v of values) g = gcd(g, v);
    g = g || 1;
    const scaled = values.map((v) => v / g);
    // Reactant side should read positive-left → right.
    if (scaled[0] < 0) return scaled.map((v) => -v);
    return scaled;
  };

  // Unique solution first (one free variable); otherwise search small
  // positive combinations of up to two free variables.
  let solution: number[] | null = null;
  if (freeCols.length === 1) {
    solution = toPositiveIntegers(basisVector(0));
  } else {
    outer: for (let a = 1; a <= 6; a += 1) {
      for (let b = 1; b <= 6; b += 1) {
        const vec: Frac[] = new Array(n).fill(frac(0));
        const addBasis = (index: number, scale: number) => {
          const basis = basisVector(index);
          for (let i = 0; i < n; i += 1) vec[i] = fAdd(vec[i], fMul(basis[i], frac(scale)));
        };
        addBasis(0, a);
        addBasis(1, b);
        const ints = toPositiveIntegers(vec);
        if (ints) {
          solution = ints;
          break outer;
        }
      }
    }
  }

  if (!solution) {
    return {
      ok: false,
      error:
        "No small whole-number coefficients balance this equation — double-check every formula and charge.",
    };
  }

  const { rows: checkRows, balanced } = sideCounts(equation, solution);
  if (!balanced) {
    // Should be impossible; surface it honestly rather than display a lie.
    return { ok: false, error: "Internal check failed: atom counts do not match after solving." };
  }
  return {
    ok: true,
    equation,
    coefficients: solution,
    text: formatEquation(equation, solution),
    rows: checkRows,
    balanced: true,
  };
}

export type CheckResult =
  | {
      ok: true;
      equation: ParsedEquation;
      coefficients: number[];
      rows: AtomRow[];
      balanced: boolean;
      /** Why an "unbalanced" verdict came out — for the UI. */
      problems: string[];
    }
  | { ok: false; error: string };

/**
 * Verify STUDENT-entered coefficients by code: recomputes every element
 * count and the total charge on both sides. Never trusts the input.
 */
export function checkEquation(text: string, coefficients: number[]): CheckResult {
  const parsed = parseEquation(text);
  if (!parsed.ok) return parsed;
  const equation = parsed.value;
  const n = equation.reactants.length;
  if (!Array.isArray(coefficients) || coefficients.length !== n + equation.products.length) {
    return {
      ok: false,
      error: `Expected ${n + equation.products.length} coefficients (reactants then products).`,
    };
  }
  if (coefficients.some((c) => !Number.isInteger(c) || c < 0 || c > 999)) {
    return { ok: false, error: "Coefficients must be whole numbers 0–999." };
  }
  const { rows, balanced } = sideCounts(equation, coefficients);
  const problems: string[] = [];
  for (const row of rows) {
    if (row.ok) continue;
    if (row.key === "charge") {
      problems.push(`Charge: ${row.left} on the left, ${row.right} on the right.`);
    } else {
      problems.push(`${row.key}: ${row.left} on the left, ${row.right} on the right.`);
    }
  }
  if (coefficients.every((c) => c === 0)) {
    problems.push("All coefficients are zero — a real reaction needs at least one.");
  }
  return { ok: true, equation, coefficients, rows, balanced, problems };
}
