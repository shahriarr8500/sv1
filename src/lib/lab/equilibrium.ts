/**
 * Chemical equilibrium solver (Phase 4 lab) for the generic reaction
 *
 *     aA ⇌ bB
 *
 * given Kc and the initial amounts in a fixed volume. Deterministic:
 * the extent of reaction x is found by bisection on a strictly monotonic
 * function (no iteration-on-rounding), so the same inputs always give the
 * same ICE table.
 *
 * Honest scope: this is the simplest equilibrium model in the syllabus —
 * one reversible reaction, ideal dilute solution (activity ≈ concentration),
 * constant temperature. Real equilibria can involve several coupled
 * reactions, activity coefficients and phase changes; the UI states this.
 */

export interface EquilibriumInput {
  /** Equilibrium constant Kc (> 0, dimensionless for A ⇌ B). */
  k: number;
  /** Stoichiometric coefficient of A (1–4). */
  a: number;
  /** Stoichiometric coefficient of B (1–4). */
  b: number;
  /** Initial amount of A (mol). */
  a0: number;
  /** Initial amount of B (mol). */
  b0: number;
  /** Volume of the vessel (L). */
  volume: number;
}

export interface EquilibriumResult {
  ok: true;
  /** Initial concentrations (mol/L). */
  initialA: number;
  initialB: number;
  /** Equilibrium concentrations (mol/L). */
  eqA: number;
  eqB: number;
  /** Extent of reaction x (mol): [A] = [A]0 − a·x/V, [B] = [B]0 + b·x/V. */
  extent: number;
  /** Concentration change of A (mol/L) — negative when A is consumed. */
  changeA: number;
  changeB: number;
  /** "forward" when Q < K, "reverse" when Q > K, "at-equilibrium" when equal. */
  direction: "forward" | "reverse" | "at-equilibrium";
  /** Reaction quotient computed from the initial concentrations. */
  q: number | null;
  /** Percentage of A converted at equilibrium (0–100). */
  percentAConverted: number;
}

export type EquilibriumOutcome =
  | EquilibriumResult
  | { ok: false; error: string };

/**
 * Solve for x with bisection. f(x) = ([B]0 + b·x/V)^b / ([A]0 − a·x/V)^a
 * is strictly increasing wherever defined, so f(x) − K = 0 has at most one
 * root in the feasible interval (−∞ form handled by clamping x to the
 * feasible open interval and bisecting 200 times → |Δx| far below any
 * displayable precision).
 */
export function solveEquilibrium(input: EquilibriumInput): EquilibriumOutcome {
  const { k, a, b, a0, b0, volume } = input;
  if (![k, a, b, a0, b0, volume].every((v) => Number.isFinite(v))) {
    return { ok: false, error: "All equilibrium inputs must be finite numbers." };
  }
  if (k <= 0) return { ok: false, error: "Kc must be greater than 0." };
  if (a < 1 || b < 1 || a > 4 || b > 4) {
    return { ok: false, error: "Stoichiometric coefficients must be whole numbers 1–4." };
  }
  if (a0 < 0 || b0 < 0) return { ok: false, error: "Initial amounts cannot be negative." };
  if (a0 === 0 && b0 === 0) {
    return { ok: false, error: "Start with some A or some B — an empty vessel never reaches equilibrium." };
  }
  if (volume <= 0) return { ok: false, error: "Volume must be greater than 0." };

  const concA0 = a0 / volume;
  const concB0 = b0 / volume;

  const q =
    concA0 > 0 ? Math.pow(concB0, b) / Math.pow(concA0, a) : concB0 > 0 ? Number.POSITIVE_INFINITY : 0;

  /** f(x) using concentrations, with a tiny guard inside the open interval. */
  const f = (x: number): number => {
    const ca = concA0 - (a * x) / volume;
    const cb = concB0 + (b * x) / volume;
    if (ca <= 0 || cb < 0) return Number.NaN;
    return Math.pow(cb, b) / Math.pow(ca, a);
  };

  // Feasible interval: A can't go negative (x < [A]0·V/a) and B can't go
  // negative (x ≥ −[B]0·V/b). f is evaluated slightly inside the A-bound.
  const eps = 1e-15;
  let lo = concB0 > 0 ? (-concB0 * volume) / b : 0;
  let hi = concA0 > 0 ? ((concA0 * volume) / a) * (1 - 1e-9) : -eps;

  const fLo = f(lo);
  const fHi = f(hi);
  // f is strictly increasing on [lo, hi] with f(lo) = 0 < K, so a root is
  // bracketed unless K lies beyond what the interval can reach — then we
  // clamp to the reachable end (the mixture sits at the boundary).
  let x: number;
  if (!Number.isFinite(fLo) || fLo > k) {
    x = lo;
  } else if (!Number.isFinite(fHi) || fHi < k) {
    x = hi;
  } else {
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      const value = f(mid);
      if (!Number.isFinite(value) || value > k) hi = mid;
      else lo = mid;
    }
    x = (lo + hi) / 2;
  }

  const eqA = concA0 - (a * x) / volume;
  const eqB = concB0 + (b * x) / volume;
  const changeA = -((a * x) / volume);
  const changeB = (b * x) / volume;

  let direction: "forward" | "reverse" | "at-equilibrium" = "forward";
  if (q !== null && Number.isFinite(q)) {
    if (Math.abs(q - k) <= 1e-9 * Math.max(1, k)) direction = "at-equilibrium";
    else if (q > k) direction = "reverse";
  } else if (q === Number.POSITIVE_INFINITY) {
    direction = "reverse";
  }

  return {
    ok: true,
    initialA: concA0,
    initialB: concB0,
    eqA: Math.max(0, eqA),
    eqB: Math.max(0, eqB),
    extent: x,
    changeA,
    changeB,
    direction,
    q: Number.isFinite(q) ? q : null,
    percentAConverted: concA0 > 0 ? Math.max(0, Math.min(100, ((-changeA) / concA0) * 100)) : 0,
  };
}

export const EQUILIBRIUM_ASSUMPTIONS = [
  "One reversible reaction aA ⇌ bB at constant temperature — coupled reactions are not modelled.",
  "Ideal dilute solution: concentrations stand in for activities (no activity coefficients).",
  "Equilibrium is dynamic: both reactions continue; the tool shows the steady concentrations, not a frozen state.",
  "A large Kc means the mixture sits far to the right — it does NOT mean the reaction is fast (kinetics is a separate question).",
  "Balancing an equation or finding Kc says nothing about whether the reaction is actually feasible.",
];
