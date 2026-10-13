/**
 * Chemical formula parsing and mole/concentration maths (Phase 4 lab).
 *
 * All functions are pure and deterministic. The parser is a hand-written
 * scanner — no eval, no backtracking regexes that could hang on hostile
 * input. Malformed formulas return a human-readable error instead of
 * throwing, so the UI can show exactly what is wrong.
 *
 * Supported syntax:
 *   H2O, CO3^2-, Cu2+, [Co(NH3)6]3+, CuSO4.5H2O (hydrate via "." or "·"),
 *   state suffixes such as (s) (l) (g) (aq) are stripped by parseSpecies.
 *
 * Molar masses use ONLY the bundled CIAAW abridged weights (see
 * elements.ts); an element without a bundled weight is refused rather than
 * approximated.
 */

import { ELEMENTS, findElement, atomicWeight } from "./elements";

export interface ParsedSpecies {
  /** Element → atom count (summed across hydrate parts). */
  atoms: Record<string, number>;
  /** Species charge in units of e (0 for neutral). */
  charge: number;
}

export type ParseResult =
  | { ok: true; value: ParsedSpecies }
  | { ok: false; error: string };

const MAX_FORMULA_LENGTH = 120;

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/** Parse a pure formula (no leading coefficient, no state suffix).
 *  Handles nesting, hydrates and a trailing charge on the whole species. */
export function parseFormula(input: string): ParseResult {
  if (typeof input !== "string") return fail("Formula must be text.");
  const text = input.trim();
  if (text.length === 0) return fail("The formula is empty.");
  if (text.length > MAX_FORMULA_LENGTH) {
    return fail(`Formula is too long (max ${MAX_FORMULA_LENGTH} characters).`);
  }

  // Split off the species charge: trailing "+" / "-" (optionally with a
  // number, in either order, optionally after "^"), e.g. CO3^2-, Cu2+, Cl-.
  let body = text;
  let charge = 0;
  const chargeMatch = /\^?(\d*)([+-])(\d*)$/.exec(body);
  if (chargeMatch && (chargeMatch[1] !== "" || chargeMatch[3] !== "" || chargeMatch[2])) {
    const before = body.slice(0, chargeMatch.index);
    // Only treat it as a charge when what precedes ends a formula-ish token.
    if (/[A-Za-z0-9)\]]$/.test(before) || before === "") {
      const magnitudeText = chargeMatch[1] || chargeMatch[3];
      const magnitude = magnitudeText === "" ? 1 : Number(magnitudeText);
      if (!Number.isInteger(magnitude) || magnitude > 20) {
        return fail("Charge looks invalid (use e.g. -, 2+, ^3-).");
      }
      charge = chargeMatch[2] === "-" ? -magnitude : magnitude;
      body = before;
    }
  }
  if (body.length === 0) {
    return fail("No atoms found in the formula.");
  }

  const atoms: Record<string, number> = {};
  const add = (symbol: string, count: number) => {
    atoms[symbol] = (atoms[symbol] ?? 0) + count;
  };

  interface Frame {
    counts: Record<string, number>;
  }
  const stack: Frame[] = [{ counts: {} }];
  let i = 0;

  const readCount = (): number => {
    let digits = "";
    while (i < body.length && body[i] >= "0" && body[i] <= "9") {
      digits += body[i];
      i += 1;
    }
    if (digits === "") return 1;
    const n = Number(digits);
    if (!Number.isInteger(n) || n <= 0 || n > 999) {
      throw new Error("Count must be a whole number between 1 and 999.");
    }
    return n;
  };

  try {
    while (i < body.length) {
      const ch = body[i];
      if (ch === "(" || ch === "[" || ch === "{") {
        stack.push({ counts: {} });
        i += 1;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        if (stack.length === 1) throw new Error("Unmatched closing bracket.");
        const frame = stack.pop()!;
        i += 1; // step past the bracket BEFORE reading the group multiplier
        const mult = readCount();
        for (const [symbol, count] of Object.entries(frame.counts)) {
          add(symbol, count * mult);
        }
      } else if (ch === "." || ch === "·" || ch === "*") {
        // Hydrate separator: "CuSO4.5H2O" — the next group is multiplied.
        i += 1;
        const mult = readCount();
        // Parse the following group as a nested frame.
        stack.push({ counts: {} });
        const startDepth = stack.length;
        // Scan until the group's natural end (another hydrate sep or EOF).
        while (i < body.length && !".·*".includes(body[i])) {
          const c = body[i];
          if (c === "(" || c === "[" || c === "{") {
            stack.push({ counts: {} });
            i += 1;
          } else if (c === ")" || c === "]" || c === "}") {
            if (stack.length === startDepth) throw new Error("Unmatched bracket after hydrate separator.");
            const frame = stack.pop()!;
            i += 1; // step past the bracket BEFORE reading the group multiplier
            const m = readCount();
            for (const [symbol, count] of Object.entries(frame.counts)) {
              const top = stack[stack.length - 1];
              top.counts[symbol] = (top.counts[symbol] ?? 0) + count * m;
            }
          } else if (/[A-Z]/.test(c)) {
            let symbol = c;
            i += 1;
            while (i < body.length && body[i] >= "a" && body[i] <= "z") {
              symbol += body[i];
              i += 1;
            }
            if (!ELEMENTS[symbol]) throw new Error(`Unknown element "${symbol}".`);
            const n = readCount();
            const top = stack[stack.length - 1];
            top.counts[symbol] = (top.counts[symbol] ?? 0) + n;
          } else if (body[i] >= "0" && body[i] <= "9") {
            // Digits right after a hydrate separator belong to the multiplier;
            // inside a group a digit must follow an element or bracket.
            throw new Error("Unexpected digit in hydrate part.");
          } else {
            throw new Error(`Unexpected character "${body[i]}".`);
          }
        }
        const frame = stack.pop()!;
        if (stack.length !== startDepth - 1) throw new Error("Unbalanced brackets in hydrate part.");
        for (const [symbol, count] of Object.entries(frame.counts)) {
          add(symbol, count * mult);
        }
      } else if (/[A-Z]/.test(ch)) {
        let symbol = ch;
        i += 1;
        while (i < body.length && body[i] >= "a" && body[i] <= "z") {
          symbol += body[i];
          i += 1;
        }
        if (!ELEMENTS[symbol]) throw new Error(`Unknown element "${symbol}".`);
        const n = readCount();
        const top = stack[stack.length - 1];
        top.counts[symbol] = (top.counts[symbol] ?? 0) + n;
      } else {
        throw new Error(`Unexpected character "${ch}".`);
      }
    }
    if (stack.length !== 1) throw new Error("Unclosed bracket.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid formula.");
  }

  // Merge the two places counts live: `atoms` collects bracket/hydrate
  // groups via add(), while the bottom stack frame holds top-level atoms.
  const total: Record<string, number> = { ...atoms };
  for (const [symbol, count] of Object.entries(stack[0].counts)) {
    total[symbol] = (total[symbol] ?? 0) + count;
  }
  if (Object.keys(total).length === 0) return fail("No atoms found in the formula.");
  return { ok: true, value: { atoms: total, charge } };
}

const STATES = new Set(["s", "l", "g", "aq"]);

/**
 * Parse one species token as written in an equation: optional leading
 * coefficient, formula, optional state suffix — e.g. "2CaCO3(s)".
 */
export function parseSpecies(token: string): {
  ok: true;
  coefficient: number;
  species: ParsedSpecies;
} | { ok: false; error: string } {
  let text = token.trim();
  if (text.length === 0) return { ok: false, error: "Empty species." };

  let coefficient = 1;
  const coeffMatch = /^(\d+)\s*/.exec(text);
  if (coeffMatch) {
    coefficient = Number(coeffMatch[1]);
    if (!Number.isInteger(coefficient) || coefficient < 1 || coefficient > 999) {
      return { ok: false, error: "Coefficient must be a whole number 1–999." };
    }
    text = text.slice(coeffMatch[0].length);
  }

  // Strip a trailing state suffix like (s), (l), (g), (aq).
  const stateMatch = /\(\s*([a-z]{1,2})\s*\)$/.exec(text);
  if (stateMatch && STATES.has(stateMatch[1])) {
    text = text.slice(0, stateMatch.index);
  }

  // Half-equations: a free electron "e-" is charge with no atoms.
  if (/^e\^?-?$/.test(text)) {
    return { ok: true, coefficient, species: { atoms: {}, charge: -1 } };
  }

  const parsed = parseFormula(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, coefficient, species: parsed.value };
}

/* -------------------------------------------------------------------------- */
/* Molar mass                                                                 */
/* -------------------------------------------------------------------------- */

export type MassResult =
  | { ok: true; value: number; missing: string[] }
  | { ok: false; error: string };

/** Molar mass (g/mol) of a species; refuses elements without a bundled weight. */
export function molarMass(species: ParsedSpecies): MassResult {
  let total = 0;
  const missing: string[] = [];
  for (const [symbol, count] of Object.entries(species.atoms)) {
    const weight = atomicWeight(symbol);
    if (weight === null) {
      if (!findElement(symbol)) return { ok: false, error: `Unknown element "${symbol}".` };
      missing.push(symbol);
      continue;
    }
    total += weight * count;
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `No bundled atomic weight for: ${missing.join(", ")}. The lab only uses verified CIAAW values, so it will not guess.`,
    };
  }
  return { ok: true, value: total, missing: [] };
}

export interface MassFraction {
  symbol: string;
  count: number;
  mass: number;
  percent: number;
}

/** Mass percent of each element in the compound (needs full weight data). */
export function percentComposition(
  species: ParsedSpecies,
): { ok: true; total: number; rows: MassFraction[] } | { ok: false; error: string } {
  const mass = molarMass(species);
  if (!mass.ok) return mass;
  const rows: MassFraction[] = [];
  for (const [symbol, count] of Object.entries(species.atoms).sort()) {
    const weight = atomicWeight(symbol);
    if (weight === null) return { ok: false, error: `No bundled atomic weight for ${symbol}.` };
    const contribution = weight * count;
    rows.push({
      symbol,
      count,
      mass: contribution,
      percent: (contribution / mass.value) * 100,
    });
  }
  return { ok: true, total: mass.value, rows };
}

/* -------------------------------------------------------------------------- */
/* Moles, particles, concentration, dilution                                  */
/* -------------------------------------------------------------------------- */

/** Exact SI defined Avogadro constant (mol⁻¹). */
export const AVOGADRO = 6.02214076e23;

export function molesFromMass(massG: number, molarMassG: number): number | null {
  if (!Number.isFinite(massG) || !Number.isFinite(molarMassG)) return null;
  if (molarMassG <= 0) return null;
  return massG / molarMassG;
}

export function massFromMoles(moles: number, molarMassG: number): number | null {
  if (!Number.isFinite(moles) || !Number.isFinite(molarMassG)) return null;
  if (molarMassG < 0) return null;
  return moles * molarMassG;
}

export function particlesFromMoles(moles: number): number | null {
  if (!Number.isFinite(moles)) return null;
  return moles * AVOGADRO;
}

/** c = n / V (mol/L). V must be > 0. */
export function concentration(moles: number, volumeL: number): number | null {
  if (!Number.isFinite(moles) || !Number.isFinite(volumeL)) return null;
  if (volumeL <= 0) return null;
  return moles / volumeL;
}

export type DilutionSolved = "c1" | "v1" | "c2" | "v2";

export interface DilutionInput {
  c1?: number;
  v1?: number; // mL
  c2?: number;
  v2?: number; // mL
}

export type DilutionResult =
  | { ok: true; solved: DilutionSolved; c1: number; v1: number; c2: number; v2: number }
  | { ok: false; error: string };

/**
 * Dilution: C1·V1 = C2·V2. Exactly three quantities must be given; the
 * fourth is solved (volumes in any consistent unit — mL is used here).
 */
export function solveDilution(input: DilutionInput): DilutionResult {
  const known: Array<["c1" | "v1" | "c2" | "v2", number | undefined]> = [
    ["c1", input.c1],
    ["v1", input.v1],
    ["c2", input.c2],
    ["v2", input.v2],
  ];
  const present = known.filter(([, v]) => v !== undefined);
  if (present.length !== 3) {
    return { ok: false, error: "Give exactly three of C1, V1, C2, V2 — the fourth is solved." };
  }
  const missing = known.find(([, v]) => v === undefined);
  if (!missing) return { ok: false, error: "Nothing to solve." };
  // Validate only the GIVEN values — the missing one is solved below.
  if (present.some(([, v]) => v === undefined || !Number.isFinite(v) || v <= 0)) {
    return { ok: false, error: "Concentrations and volumes must all be positive numbers." };
  }
  const c1 = input.c1 ?? 0;
  const v1 = input.v1 ?? 0;
  const c2 = input.c2 ?? 0;
  const v2 = input.v2 ?? 0;
  const solved = missing[0];
  let value: number;
  if (solved === "v2") value = (c1 * v1) / c2;
  else if (solved === "v1") value = (c2 * v2) / c1;
  else if (solved === "c2") value = (c1 * v1) / v2;
  else value = (c2 * v2) / v1;
  if (!Number.isFinite(value)) return { ok: false, error: "The dilution maths produced a non-finite value." };
  return {
    ok: true,
    solved,
    c1: solved === "c1" ? value : c1,
    v1: solved === "v1" ? value : v1,
    c2: solved === "c2" ? value : c2,
    v2: solved === "v2" ? value : v2,
  };
}
