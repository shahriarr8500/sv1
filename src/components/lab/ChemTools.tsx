/**
 * Chemistry tools (Phase 4 lab, application-owned components).
 *
 * Every panel below is a thin UI over the pure, tested engines in
 * `src/lib/lab/*`: balance, quantities, Lewis/electron structure and
 * equilibrium are all computed by deterministic code — never by a model,
 * never by executing generated code. Free-text inputs (equations, formulas,
 * symbols) go through the lab parsers first; anything they reject is shown
 * as an error message, never rendered blindly.
 *
 * Every tool states its limits on screen (what balancing cannot tell you,
 * what an approximate atomic weight means, what a Lewis picture does not
 * prove), so an educational result is never mistaken for a real-world claim.
 */

import { useState, type ComponentType, type ReactNode } from "react";
import {
  balanceEquation,
  checkEquation,
  parseEquation,
  type AtomRow,
} from "@/lib/lab/equation";
import {
  AVOGADRO,
  concentration,
  massFromMoles,
  molesFromMass,
  molarMass,
  parseFormula,
  percentComposition,
  particlesFromMoles,
  solveDilution,
  type DilutionSolved,
} from "@/lib/lab/formula";
import { EQUILIBRIUM_ASSUMPTIONS, solveEquilibrium } from "@/lib/lab/equilibrium";
import { atomInfo, solveLewis, type LewisAtom, type LewisBond } from "@/lib/lab/structure";
import { ELEMENT_SYMBOLS } from "@/lib/lab/elements";
import {
  Equations,
  ModelLimits,
  Readout,
  ReadoutGrid,
  SimSegmented,
  SimSlider,
  SimTitle,
  fmt,
} from "./framework";

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

/** 3.14 × 10²³-style formatting (unicode superscripts, no HTML). */
const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function superDigits(n: number): string {
  return String(n)
    .split("")
    .map((ch) => (ch === "-" || ch === "−" ? "⁻" : SUPER[Number(ch)] ?? ch))
    .join("");
}
export function sci(value: number, digits = 3): string {
  if (Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "−∞";
  if (value === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const mant = value / 10 ** exp;
  return `${mant.toFixed(digits)} × 10${superDigits(exp)}`;
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h4>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  list,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  list?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        list={list}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
  unit,
  width = "w-full",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  unit?: string;
  width?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${width} rounded-lg border bg-background px-2 py-1.5 font-mono text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
        />
        {unit ? <span className="text-[11px] whitespace-nowrap text-muted-foreground">{unit}</span> : null}
      </span>
    </label>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      {message}
    </p>
  );
}

/** Left / right / balanced counts for an equation (balance or check). */
function CountTable({ rows }: { rows: readonly AtomRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b text-left text-[11px] text-muted-foreground">
          <th className="py-1 font-medium">Counted item</th>
          <th className="py-1 text-right font-medium">Left</th>
          <th className="py-1 text-right font-medium">Right</th>
          <th className="py-1 text-right font-medium">Match</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-border/50 last:border-0">
            <td className="py-1 font-mono">{row.key === "charge" ? "charge (e⁻)" : row.key}</td>
            <td className="py-1 text-right font-mono tabular-nums">{row.left}</td>
            <td className="py-1 text-right font-mono tabular-nums">{row.right}</td>
            <td className="py-1 text-right font-mono">
              {row.ok ? (
                <span className="text-emerald-600 dark:text-emerald-400">✓</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">✗</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */