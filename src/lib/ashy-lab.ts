/**
 * Ashy lab-tool spec validation (Phase 4 / Issue 2).
 *
 * Mirrors the server's parseLabPayload constraints (src/convex/ashyShared.ts):
 * every spec that reaches the UI — from a stored message row, a fresh reply
 * or a hand-edited local draft — is re-checked HERE before any tool renders.
 * There is deliberately no code path from model output to execution: the
 * spec is a whitelisted kind plus bounded, charset-checked text, or nothing.
 *
 * Pure and DOM-free so the routing decisions are unit-testable in `bun test`.
 */

import { findMolecule } from "../components/lab/structures";
import type { AshyLab } from "./ashy";

/** Whitelisted simulation kinds — same order as the server. */
export const LAB_SIM_KINDS = [
  "motion",
  "projectile",
  "forces",
  "waves",
  "circuits",
  "optics",
] as const;

/** Same arrow set the equation parser accepts (src/lib/lab/equation.ts). */
const LAB_ARROW = /(<=>|<->|-->|->|→|⇒|⇌|=)/;
/** Mirrors MAX_EQUATION_LENGTH (300) in src/lib/lab/equation.ts. */
const LAB_EQUATION_CHARSET = /^[A-Za-z0-9+\-*^()<>=[\].\s→⇌⇒]+$/;
/** Mirrors MAX_FORMULA_LENGTH (120) in src/lib/lab/formula.ts. */
const LAB_FORMULA_CHARSET = /^[A-Za-z0-9+\-^().·]+$/;
const LAB_TARGET_CHARSET = /^[A-Za-z0-9()\- ]+$/;

function validEquation(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 4 || text.length > 300) return false;
  if (!LAB_ARROW.test(text)) return false;
  return LAB_EQUATION_CHARSET.test(text);
}

function validFormula(raw: string): boolean {
  const compact = raw.replace(/\s+/g, "");
  if (compact.length === 0 || compact.length > 120) return false;
  return LAB_FORMULA_CHARSET.test(compact);
}

/**
 * Re-validates a lab spec from ANY source. Returns the spec when every
 * field passes (molecule targets must resolve to a bundled structure, so an
 * unsupported molecule simply renders no tool), else null — and null always
 * degrades to the normal text answer, never to a broken widget.
 */
export function validateLabSpec(lab: AshyLab | undefined | null): AshyLab | null {
  if (!lab || typeof lab !== "object") return null;

  switch (lab.type) {
    case "balance":
      return validEquation(String(lab.equation ?? "")) ? lab : null;
    case "moles":
    case "lewis":
      return validFormula(String(lab.formula ?? "")) ? lab : null;
    case "molecule": {
      const target = String(lab.target ?? "");
      if (target.length === 0 || target.length > 60) return null;
      if (!LAB_TARGET_CHARSET.test(target)) return null;
      // Supported molecules only — the viewer never silently swaps in a
      // different structure for a name it doesn't have.
      return findMolecule(target) ? lab : null;
    }
    case "sim":
      return (LAB_SIM_KINDS as readonly string[]).includes(lab.kind) ? lab : null;
    case "equilibrium":
      return { type: "equilibrium" };
    default:
      return null;
  }
}

/**
 * Stable tool id for a validated spec — same id scheme the lab-tools host
 * uses (`physics-<kind>` / `chem-<kind>` / `molecules-3d`), so tests can pin
 * routing decisions without importing any React component.
 */
export function labToolId(lab: AshyLab): string {
  switch (lab.type) {
    case "sim":
      return `physics-${lab.kind}`;
    case "balance":
      return "chem-balance";
    case "moles":
      return "chem-quantities";
    case "lewis":
      return "chem-structure";
    case "equilibrium":
      return "chem-equilibrium";
    case "molecule":
      return "molecules-3d";
  }
}
