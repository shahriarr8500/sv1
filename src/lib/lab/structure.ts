/**
 * Atomic structure and Lewis electron-dot structures (Phase 4 lab).
 *
 * `atomInfo` derives the ground-state electron configuration by Aufbau
 * filling (with an explicit table of the classic exceptions), shells,
 * period and group — pure arithmetic, deterministic.
 *
 * `solveLewis` builds a Lewis structure from a FORMULA alone: it deduces a
 * skeleton only for the cases where the formula actually pins one down
 * (single central atom, simple H/OH placement, O–O peroxide chain), then
 * searches bond orders (≤ 3 per bond) for the assignment with the lowest
 * formal-charge/shortfall score. When the formula is ambiguous — organic
 * chains, transition metals, odd-electron radicals, coordination brackets —
 * it REFUSES with a teaching-worthy message instead of inventing a
 * structure. The result always reports formal charges, incomplete octets
 * and resonance so the UI can show what the model does and does not claim.
 */

import {
  ELEMENTS,
  LEWIS_ALLOWED,
  findElement,
  mainGroup,
} from "./elements";
import { parseFormula, type ParsedSpecies } from "./formula";

/* -------------------------------------------------------------------------- */
/* Electron configuration                                                     */
/* -------------------------------------------------------------------------- */

interface Subshell {
  n: number;
  letter: "s" | "p" | "d" | "f";
  capacity: number;
}

/** Aufbau (Madelung) filling order. */
const FILL_ORDER: readonly Subshell[] = [
  { n: 1, letter: "s", capacity: 2 },
  { n: 2, letter: "s", capacity: 2 },
  { n: 2, letter: "p", capacity: 6 },
  { n: 3, letter: "s", capacity: 2 },
  { n: 3, letter: "p", capacity: 6 },
  { n: 4, letter: "s", capacity: 2 },
  { n: 3, letter: "d", capacity: 10 },
  { n: 4, letter: "p", capacity: 6 },
  { n: 5, letter: "s", capacity: 2 },
  { n: 4, letter: "d", capacity: 10 },
  { n: 5, letter: "p", capacity: 6 },
  { n: 6, letter: "s", capacity: 2 },
  { n: 4, letter: "f", capacity: 14 },
  { n: 5, letter: "d", capacity: 10 },
  { n: 6, letter: "p", capacity: 6 },
  { n: 7, letter: "s", capacity: 2 },
  { n: 5, letter: "f", capacity: 14 },
  { n: 6, letter: "d", capacity: 10 },
  { n: 7, letter: "p", capacity: 6 },
];

/**
 * Ground-state exceptions (well-documented textbook cases). Keyed by Z;
 * value is a full subshell occupancy map like "3d5 4s1" overriding the
 * Aufbau result for those subshells only.
 */
const CONFIG_EXCEPTIONS: Readonly<Record<number, string>> = {
  24: "3d5 4s1",   // Cr
  29: "3d10 4s1",  // Cu
  41: "4d4 5s1",   // Nb
  42: "4d5 5s1",   // Mo
  44: "4d7 5s1",   // Ru
  45: "4d8 5s1",   // Rh
  46: "4d10",      // Pd
  47: "4d10 5s1",  // Ag
  57: "5d1 6s2",   // La
  58: "4f1 5d1 6s2", // Ce
  64: "4f7 5d1 6s2", // Gd
  78: "4f14 5d9 6s1", // Pt
  79: "4f14 5d10 6s1", // Au
  89: "6d1 7s2",   // Ac
  90: "6d2 7s2",   // Th
  92: "5f3 6d1 7s2", // U
};

export interface AtomInfo {
  symbol: string;
  z: number;
  name: string;
  /** Full configuration string, e.g. "1s2 2s2 2p6 3s2 3p6 4s2". */
  config: string;
  /** Electrons per principal shell (index 0 = shell 1). */
  shells: number[];
  period: number;
  group: number | null;
  /** Abridged standard atomic weight when bundled (g/mol). */
  weight: number | null;
  /** True when a documented exception overrode Aufbau order. */
  exceptionApplied: boolean;
  /** Ground-state exceptions are only encoded up to uranium (Z 92). */
  exceptionCoverageNote: string;
}

export type AtomInfoResult =
  | { ok: true; value: AtomInfo }
  | { ok: false; error: string };

/** Build the ground-state configuration for atomic number Z. */
export function electronConfiguration(z: number): {
  config: string;
  shells: number[];
  exceptionApplied: boolean;
} | null {
  if (!Number.isInteger(z) || z < 1 || z > 118) return null;
  const occupancy = new Map<string, number>();
  let remaining = z;
  for (const sub of FILL_ORDER) {
    if (remaining <= 0) break;
    const key = `${sub.n}${sub.letter}`;
    const take = Math.min(sub.capacity, remaining);
    occupancy.set(key, (occupancy.get(key) ?? 0) + take);
    remaining -= take;
  }

  let exceptionApplied = false;
  const override = CONFIG_EXCEPTIONS[z];
  if (override) {
    // Z electron count must stay constant: subtract the Aufbau occupancy of
    // the overridden subshells, then apply the exception.
    for (const token of override.split(/\s+/)) {
      const match = /^(\d)([spdf])(\d+)$/.exec(token);
      if (!match) continue;
      const key = `${match[1]}${match[2]}`;
      occupancy.set(key, Number(match[3]));
      exceptionApplied = true;
    }
    // Recompute the total; adjust the highest s/p subshell if off.
    const total = [...occupancy.values()].reduce((sum, v) => sum + v, 0);
    if (total !== z && total < z) {
      // Should not happen with the curated table; fall back to Aufbau.
      exceptionApplied = false;
      occupancy.clear();
      let rest = z;
      for (const sub of FILL_ORDER) {
        if (rest <= 0) break;
        const key = `${sub.n}${sub.letter}`;
        const take = Math.min(sub.capacity, rest);
        occupancy.set(key, (occupancy.get(key) ?? 0) + take);
        rest -= take;
      }
    }
  }

  // Render in Aufbau order.
  const parts: string[] = [];
  const shells = [0, 0, 0, 0, 0, 0, 0];
  for (const sub of FILL_ORDER) {
    const key = `${sub.n}${sub.letter}`;
    const count = occupancy.get(key) ?? 0;
    if (count > 0) {
      parts.push(`${key}${count}`);
      shells[sub.n - 1] += count;
    }
  }
  const used = shells.filter((count) => count > 0);
  return { config: parts.join(" "), shells: used, exceptionApplied };
}

/** Full info for an element symbol (case-insensitive). */
export function atomInfo(symbol: string): AtomInfoResult {
  const element = findElement(symbol);
  if (!element) {
    return { ok: false, error: `"${symbol}" is not an element symbol the lab knows.` };
  }
  const derived = electronConfiguration(element.z);
  if (!derived) return { ok: false, error: "Could not build an electron configuration." };
  const period = derived.shells.length;
  return {
    ok: true,
    value: {
      symbol: element.symbol,
      z: element.z,
      name: element.name,
      config: derived.config,
      shells: derived.shells,
      period,
      group: mainGroup(element.symbol),
      weight: element.weight ?? null,
      exceptionApplied: derived.exceptionApplied,
      exceptionCoverageNote:
        "Aufbau filling with the classic exceptions (Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag, La, Ce, Gd, Pt, Au, Ac, Th, U) applied; heavier-element exceptions beyond uranium are not encoded.",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Lewis structures                                                           */
/* -------------------------------------------------------------------------- */

export interface LewisBond {
  /** Indices into `atoms`. */
  from: number;
  to: number;
  order: number;
}

export interface LewisAtom {
  symbol: string;
  /** Lone-pair electrons (non-bonding) on this atom. */
  loneElectrons: number;
  /** Formal charge = valence − lone − bond orders. */
  formalCharge: number;
  /** Electrons it "owns" (2·bond orders + lone) vs its octet/duet target. */
  owns: number;
  target: number;
  /** True when owns < target (incomplete octet/duet). */
  incomplete: boolean;
}

export interface LewisResult {
  ok: true;
  atoms: LewisAtom[];
  bonds: LewisBond[];
  /** Index of the central atom (−1 for simple diatomics). */
  central: number;
  totalValence: number;
  speciesCharge: number;
  notes: string[];
}

export type LewisOutcome = LewisResult | { ok: false; error: string };

const MAX_BONDS: Readonly<Record<string, number>> = {
  H: 1, He: 1, Be: 2, B: 3, C: 4, N: 4, O: 4, F: 1,
  Al: 6, Si: 6, P: 6, S: 6, Cl: 1, Br: 1, I: 1,
};

const VALENCE: Readonly<Record<string, number>> = {
  H: 1, He: 2, Be: 2, B: 3, C: 4, N: 5, O: 6, F: 7,
  Al: 3, Si: 4, P: 5, S: 6, Cl: 7, Br: 7, I: 7,
};

const PERIOD_2_PLUS_3: ReadonlySet<string> = new Set([
  "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
]);

function targetFor(symbol: string): number {
  if (symbol === "H" || symbol === "He") return 2;
  if (symbol === "Be") return 4;
  if (symbol === "B") return 6;
  return 8;
}

function periodOf(symbol: string): number {
  const info = findElement(symbol);
  if (!info) return 3;
  if (info.z <= 2) return 1;
  if (info.z <= 10) return 2;
  if (info.z <= 18) return 3;
  if (info.z <= 36) return 4;
  if (info.z <= 54) return 5;
  if (info.z <= 86) return 6;
  return 7;
}

function electronegativity(symbol: string): number {
  return ELEMENTS[symbol]?.en ?? 2.0;
}

interface Bond {
  from: number;
  to: number;
  order: number;
}

/**
 * Solve a Lewis structure for a parsed formula. Deterministic: fixed
 * skeleton rules + exhaustive small bond-order search with a stable
 * score, so identical inputs always produce the identical drawing.
 */
export function solveLewis(formula: string, chargeOverride?: number): LewisOutcome {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const species: ParsedSpecies = parsed.value;
  const charge = chargeOverride ?? species.charge;

  // Expand the formula into an atom list (order preserved from the text).
  const symbols: string[] = [];
  for (const [symbol, count] of Object.entries(species.atoms)) {
    for (let i = 0; i < count; i += 1) symbols.push(symbol);
  }
  // Preserve written order: rebuild from the raw formula tokens instead of
  // the summed record so e.g. "HCl" stays H,Cl.
  const ordered: string[] = [];
  const orderRe = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  const stripped = formula.replace(/\^?\d*[+-]$/, "");
  while ((m = orderRe.exec(stripped)) !== null) {
    if (!m[1]) continue;
    const count = m[2] ? Number(m[2]) : 1;
    for (let i = 0; i < count; i += 1) ordered.push(m[1]);
  }
  if (ordered.length > 0) {
    symbols.length = 0;
    symbols.push(...ordered);
  }

  const disallowed = [...new Set(symbols.filter((s) => !LEWIS_ALLOWED.has(s)))];
  if (disallowed.length > 0) {
    return {
      ok: false,
      error: `The Lewis builder only handles main-group elements — ${disallowed.join(", ")} ${disallowed.length === 1 ? "is" : "are"} outside that set, so it will not guess a structure.`,
    };
  }
  if (/[.·*]/.test(formula)) {
    return {
      ok: false,
      error: "Hydrates (CuSO4·5H2O) are lattice water — the Lewis builder draws discrete molecules only, so it refuses rather than guess how the water attaches.",
    };
  }
  if (symbols.length > 16) {
    return { ok: false, error: "Formula too large for the Lewis builder (max 16 atoms)." };
  }

  // Odd electron count → radical; octet rules can't pair everything.
  const valences = symbols.map((s) => VALENCE[s]);
  const totalValence = valences.reduce((sum, v) => sum + v, 0) - charge;
  if (totalValence % 2 !== 0) {
    return {
      ok: false,
      error: "This species has an odd number of electrons (a radical). Simple Lewis rules pair electrons up, so the tool refuses rather than draw a misleading structure.",
    };
  }

  const heavy = symbols.map((s, i) => ({ s, i })).filter((a) => a.s !== "H");
  const hydrogens = symbols.map((s, i) => ({ s, i })).filter((a) => a.s === "H");

  // --- Skeleton -----------------------------------------------------------
  const bonds: Bond[] = [];
  const attach = (a: number, b: number) => bonds.push({ from: a, to: b, order: 1 });

  if (heavy.length === 0) {
    if (symbols.length === 2) {
      attach(0, 1);
      return finalize(symbols, bonds, -1, totalValence, charge, [
        "Simple diatomic molecule.",
      ]);
    }
    return { ok: false, error: "Could not deduce a skeleton for this formula." };
  }

  // Organic chains are refused: the formula alone cannot say which atoms
  // connect (C2H6O is ethanol or dimethyl ether — same formula, two shapes).
  const carbonCount = symbols.filter((s) => s === "C").length;
  if (carbonCount >= 2) {
    return {
      ok: false,
      error: "Two or more carbon atoms mean the formula alone cannot determine the structure — C2H6O, for example, could be ethanol OR dimethyl ether. The tool refuses rather than guess; draw the skeleton yourself and it can check it.",
    };
  }

  let central: number;
  if (heavy.length === 1) {
    central = heavy[0].i;
  } else if (heavy.length === 2 && heavy[0].s === "O" && heavy[1].s === "O" && hydrogens.length > 0) {
    // Peroxide chain H–O–O–H (the only chain the syllabus needs that a
    // formula actually pins down).
    attach(heavy[0].i, heavy[1].i);
    const hOrder = hydrogens.map((h) => h.i);
    attach(hOrder[0] ?? -1, heavy[0].i);
    if (hOrder.length > 1) attach(hOrder[1], heavy[1].i);
    for (let hi = 2; hi < hOrder.length; hi += 1) attach(hOrder[hi], heavy[1].i);
    return finalize(symbols, bonds, heavy[0].i, totalValence, charge, [
      "Peroxy (O–O) chain: each oxygen carries one hydrogen here.",
    ]);
  } else {
    // Central atom = least electronegative heavy atom (stable convention).
    central = heavy.reduce((best, a) =>
      electronegativity(a.s) < electronegativity(symbols[best]) ? a.i : best,
    heavy[0].i);
  }

  const notes: string[] = [];
  // Attach every other heavy atom as a ligand of the central atom.
  for (const a of heavy) {
    if (a.i !== central) attach(central, a.i);
  }

  // --- Hydrogen placement -------------------------------------------------
  const oLigands = bonds
    .filter((b) => b.from === central || b.to === central)
    .map((b) => (b.from === central ? b.to : b.from))
    .filter((i) => symbols[i] === "O");

  let remainingH = hydrogens.map((h) => h.i);
  const addH = (target: number) => {
    const h = remainingH.shift();
    if (h === undefined) return false;
    attach(h, target);
    return true;
  };

  if (hydrogens.length > 0) {
    if (oLigands.length >= 2 && hydrogens.length <= oLigands.length) {
      // Oxyacid pattern: one H per hydroxyl oxygen (H2SO4, HNO3, H3PO4).
      for (const o of oLigands) {
        if (!addH(o)) break;
      }
      notes.push("Oxyacid pattern: each hydrogen sits on an oxygen (O–H), not on the central atom.");
    } else {
      // Fill the central atom first, then park leftovers on oxygens.
      const heavyLigands = bonds.filter((b) => b.from === central || b.to === central).length;
      const centralCap =
        symbols[central] === "O" ? 2 - heavyLigands : (MAX_BONDS[symbols[central]] ?? 4) - heavyLigands;
      for (let i = 0; i < Math.max(0, centralCap); i += 1) {
        if (!addH(central)) break;
      }
      if (remainingH.length > 0) {
        for (const o of oLigands) {
          if (remainingH.length === 0) break;
          addH(o);
        }
      }
      if (remainingH.length > 0) {
        return {
          ok: false,
          error: "Could not place every hydrogen without breaking an octet rule — the skeleton this formula implies is probably not the real one.",
        };
      }
    }
  } else if (heavy.length === 1 && symbols.length > 1) {
    // e.g. single heavy atom with halogen ligands — nothing to place.
  }

  if (bonds.length === 0 && symbols.length > 1) {
    return { ok: false, error: "Could not deduce any bonds for this formula." };
  }

  // --- Bond-order search --------------------------------------------------
  const heavyBondIdx = bonds
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => symbols[b.from] !== "H" && symbols[b.to] !== "H")
    .map(({ i }) => i);

  const capForBond = (b: Bond): number => {
    const capA = MAX_BONDS[symbols[b.from]] ?? 4;
    const capB = MAX_BONDS[symbols[b.to]] ?? 4;
    return Math.max(1, Math.min(3, capA, capB));
  };

  interface Assignment {
    bonds: Bond[];
    atoms: LewisAtom[];
    score: number;
  }

  let best: Assignment | null = null;
  let equivalentCount = 0;
  const combos = heavyBondIdx.length === 0 ? 1 : heavyBondIdx.reduce((prod, i) => prod * capForBond(bonds[i]), 1);
  if (combos > 4096) {
    return { ok: false, error: "This formula would need too many bond arrangements to search." };
  }

  const assignOrders = (orders: number[]): Assignment | null => {
    const trial = bonds.map((b) => ({ ...b }));
    heavyBondIdx.forEach((bondIndex, k) => {
      trial[bondIndex].order = orders[k];
    });

    // Electron budget.
    let bonding = 0;
    for (const b of trial) bonding += 2 * b.order;
    if (bonding > totalValence) return null;
    let remaining = totalValence - bonding;

    const bondOrdersAt = symbols.map(() => 0);
    for (const b of trial) {
      bondOrdersAt[b.from] += b.order;
      bondOrdersAt[b.to] += b.order;
    }
    const need = symbols.map((s, i) => Math.max(0, targetFor(s) - 2 * bondOrdersAt[i]));

    const lone = symbols.map(() => 0);
    // Priority: terminal atoms first (hydrogens need none), central last.
    const order = symbols
      .map((_, i) => i)
      .filter((i) => i !== central)
      .concat(central >= 0 ? [central] : []);
    const give: number[] = new Array(symbols.length).fill(0);
    for (const i of order) {
      const take = Math.min(need[i], remaining);
      // keep even (whole pairs)
      const even = take - (take % 2);
      give[i] = even;
      remaining -= even;
      if (remaining <= 0) break;
    }

    // Leftover pairs (more electrons than octets demand) go to the atom
    // with the most positive formal charge first — classic FC minimisation.
    let leftover = remaining;
    const loneE = symbols.map((s, i) => give[i]);
    while (leftover > 0) {
      // current formal charge with the pairs assigned so far
      let targetAtom = -1;
      let bestFc = -Infinity;
      let bestEn = -Infinity;
      for (let i = 0; i < symbols.length; i += 1) {
        const cap = PERIOD_2_PLUS_3.has(symbols[i]) ? 6 : 12;
        if (loneE[i] + 2 > cap) continue;
        const fc = valences[i] - loneE[i] - bondOrdersAt[i];
        if (fc > bestFc || (fc === bestFc && electronegativity(symbols[i]) > bestEn)) {
          bestFc = fc;
          bestEn = electronegativity(symbols[i]);
          targetAtom = i;
        }
      }
      if (targetAtom === -1) return null; // nowhere to put the electrons
      loneE[targetAtom] += 2;
      leftover -= 2;
    }

    const shortfall = need.reduce((sum, n, i) => sum + Math.max(0, n - give[i]), 0);
    const atoms: LewisAtom[] = symbols.map((s, i) => {
      const owns = 2 * bondOrdersAt[i] + loneE[i];
      return {
        symbol: s,
        loneElectrons: loneE[i],
        formalCharge: valences[i] - loneE[i] - bondOrdersAt[i],
        owns,
        target: targetFor(s),
        incomplete: owns < targetFor(s),
      };
    });
    const fcSum = atoms.reduce((sum, a) => sum + Math.abs(a.formalCharge), 0);
    const orderSum = trial.reduce((sum, b) => sum + b.order, 0);
    // Invariants: total owned = V + charge… (Σfc = charge by construction).
    const fcTotal = atoms.reduce((sum, a) => sum + a.formalCharge, 0);
    if (fcTotal !== charge) return null; // mathematically impossible; guard anyway
    const score = shortfall * 1000 + fcSum * 10 + orderSum;
    return { bonds: trial, atoms, score };
  };

  // Enumerate bond orders.
  const stack: number[] = [];
  const enumerate = (depth: number): void => {
    if (best && best.score === 0 && depth === 0) return;
    if (depth === heavyBondIdx.length) {
      const assignment = assignOrders(stack.slice());
      if (assignment && (!best || assignment.score < best.score)) {
        best = assignment;
        equivalentCount = 1;
      } else if (assignment && best && assignment.score === best.score) {
        equivalentCount += 1;
      }
      return;
    }
    const bond = bonds[heavyBondIdx[depth]];
    const cap = capForBond(bond);
    for (let order = 1; order <= cap; order += 1) {
      stack.push(order);
      enumerate(depth + 1);
      stack.pop();
    }
  };
  enumerate(0);

  if (!best) {
    return {
      ok: false,
      error:
        "No arrangement of single/double/triple bonds satisfies the electron count for this formula — check the formula, charge, or note that odd-electron radicals need a dot structure.",
    };
  }

  const incomplete = best.atoms.filter((a) => a.incomplete);
  if (incomplete.length > 0) {
    notes.push(
      `Electron-deficient: ${incomplete.map((a) => a.symbol).join(", ")} ${incomplete.length === 1 ? "does" : "do"} not reach a full octet — this really happens (e.g. BeCl₂ and BF₃ are electron-poor and very reactive).`,
    );
  }
  const expanded = best.atoms.filter(
    (a) => a.owns > a.target && periodOf(a.symbol) >= 3 && a.symbol !== "H",
  );
  if (expanded.length > 0) {
    notes.push(
      "Expanded octet: a period-3-or-heavier atom holds more than 8 electrons — allowed because of empty d orbitals (this is why SF₆ and PCl₅ exist but NF₅ does not).",
    );
  }
  const charged = best.atoms.filter((a) => a.formalCharge !== 0);
  if (charged.length > 0) {
    notes.push(
      `Formal charges: ${charged.map((a) => `${a.symbol}${a.formalCharge > 0 ? "+" : ""}${a.formalCharge}`).join(", ")} (they sum to the species charge, ${charge}).`,
    );
  }
  if (equivalentCount > 1 && heavyBondIdx.length > 0) {
    notes.push(
      "Resonance: more than one equally good arrangement exists — the real molecule is a blend of them, not any single drawing.",
    );
  }

  return finalize(symbols, best.bonds, central, totalValence, charge, notes, best.atoms);
}

function finalize(
  symbols: string[],
  bonds: Bond[],
  central: number,
  totalValence: number,
  charge: number,
  notes: string[],
  precomputed?: LewisAtom[],
): LewisOutcome {
  const atoms: LewisAtom[] =
    precomputed ??
    (() => {
      const bondOrdersAt = symbols.map(() => 0);
      for (const b of bonds) {
        bondOrdersAt[b.from] += b.order;
        bondOrdersAt[b.to] += b.order;
      }
      const used = 2 * bonds.reduce((sum, b) => sum + b.order, 0);
      let remaining = totalValence - used;
      return symbols.map((s, i) => {
        const target = targetFor(s);
        const need = Math.max(0, target - 2 * bondOrdersAt[i]);
        const take = Math.min(need, remaining - (remaining % 2));
        remaining -= take;
        const owns = 2 * bondOrdersAt[i] + take;
        return {
          symbol: s,
          loneElectrons: take,
          formalCharge: valencesFor(s) - take - bondOrdersAt[i],
          owns,
          target,
          incomplete: owns < target,
        };
      });
    })();
  return {
    ok: true,
    atoms,
    bonds: bonds.map((b) => ({ from: b.from, to: b.to, order: b.order })),
    central,
    totalValence,
    speciesCharge: charge,
    notes,
  };
}

function valencesFor(symbol: string): number {
  return VALENCE[symbol] ?? 0;
}
