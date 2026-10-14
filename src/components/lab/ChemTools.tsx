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
  SimLayout,
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
/* 1. Equation balancer                                                       */
/* -------------------------------------------------------------------------- */

const PRESETS: readonly { label: string; equation: string }[] = [
  { label: "Combustion of propane", equation: "C3H8 + O2 -> CO2 + H2O" },
  { label: "Haber process", equation: "N2 + H2 -> NH3" },
  { label: "Neutralisation", equation: "NaOH + HCl -> NaCl + H2O" },
  { label: "Redox titration (KMnO4)", equation: "KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2" },
  { label: "Rusting of iron", equation: "Fe + O2 -> Fe2O3" },
  { label: "Photosynthesis", equation: "CO2 + H2O -> C6H12O6 + O2" },
];

const BALANCE_LIMITS = [
  "Balancing only counts atoms and charge. It cannot tell you whether the reaction happens, how fast it goes, or how much product you get — that needs experiments, kinetics and energetics.",
  "The smallest whole-number coefficients are shown; any multiple of them (×2, ×3 …) describes the same reaction.",
  "State symbols, yields of real processes and side reactions are not modelled — this is a bookkeeping check, not a prediction.",
];

type BalanceMode = "balance" | "check";

export function BalanceTool({ initialEquation }: ChemToolProps = {}) {
  const [text, setText] = useState(initialEquation?.trim() || PRESETS[0].equation);
  const [mode, setMode] = useState<BalanceMode>("balance");
  const [guess, setGuess] = useState<string[]>([]);

  const parsed = parseEquation(text);
  const speciesLabels = parsed.ok
    ? [...parsed.value.reactants, ...parsed.value.products].map((entry) =>
        entry.raw.replace(/^\d+/, ""),
      )
    : [];

  const coeffs = speciesLabels.map((_, i) =>
    guess[i] !== undefined && guess[i].trim() !== "" ? Number(guess[i]) : Number.NaN,
  );
  const canCheck = speciesLabels.length > 0 && coeffs.every((c) => Number.isInteger(c) && c >= 0);
  const check = parsed.ok && canCheck && mode === "check" ? checkEquation(text, coeffs) : null;

  return (
    <div className="space-y-4">
      <SimTitle
        title="Equation balancer & checker"
        subtitle="Exact integer balancing by linear algebra — then verify the coefficients you enter yourself against the code's own atom counts."
      />

      <Panel title="Equation" hint="Arrows →, ⇌, -> or = between the two sides. Type an equation, or load an example.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Reaction</span>
            <input
              type="text"
              value={text}
              spellCheck={false}
              onChange={(event) => setText(event.target.value)}
              className="w-full rounded-lg border bg-background px-2.5 py-1.5 font-mono text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Example</span>
            <select
              onChange={(event) => setText(event.target.value)}
              defaultValue={text}
              className="block w-56 cursor-pointer rounded-lg border bg-background px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {PRESETS.map((preset) => (
                <option key={preset.label} value={preset.equation}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <SimSegmented
          label="Mode"
          value={mode}
          options={[
            { value: "balance", label: "Balance it for me" },
            { value: "check", label: "Check my coefficients" },
          ]}
          onChange={setMode}
        />
        {!parsed.ok ? <ErrorNote message={parsed.error} /> : null}
      </Panel>

      {mode === "balance" ? (
        <Panel title="Smallest balanced form">
          {(() => {
            const result = balanceEquation(text);
            if (!result.ok) return <ErrorNote message={result.error} />;
            return (
              <div className="space-y-3">
                <p className="rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-sm break-words">
                  {result.text}
                </p>
                <CountTable rows={result.rows} />
                <p className="text-[11px] text-muted-foreground">
                  Every row matches with these coefficients — the counts shown are computed FROM the
                  answer above, not assumed.
                </p>
              </div>
            );
          })()}
        </Panel>
      ) : (
        <Panel
          title="Check my coefficients"
          hint="Enter one whole number per species (left to right, then the products). The code recomputes every count itself."
        >
          {!parsed.ok ? null : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                {speciesLabels.map((label, i) => (
                  <label key={`${label}-${i}`} className="block space-y-1">
                    <span className="block max-w-24 truncate font-mono text-[11px] text-muted-foreground">
                      {label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      step={1}
                      value={guess[i] ?? ""}
                      placeholder="?"
                      onChange={(event) => {
                        const next = [...guess];
                        next[i] = event.target.value;
                        setGuess(next);
                      }}
                      className="w-16 rounded-lg border bg-background px-2 py-1.5 text-center font-mono text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    />
                  </label>
                ))}
              </div>
              {!canCheck ? (
                <p className="text-xs text-muted-foreground">
                  Enter a whole-number coefficient for every species to run the check.
                </p>
              ) : check === null ? null : !check.ok ? (
                <ErrorNote message={check.error} />
              ) : check.balanced ? (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  ✓ Correct — every element and the total charge match on both sides.
                </p>
              ) : (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <p className="font-semibold">Not balanced yet:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 marker:text-amber-500/70">
                    {check.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </div>
              )}
              {check?.ok ? <CountTable rows={check.rows} /> : null}
            </div>
          )}
        </Panel>
      )}

      <ModelLimits assumptions={BALANCE_LIMITS} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Moles, mass, concentration & dilution                                    */
/* -------------------------------------------------------------------------- */

const QUANTITY_LIMITS = [
  "Atomic weights are bundled standard (CIAAW) values. When a verified weight is missing the lab refuses to compute rather than invent one.",
  "Standard atomic weight is an isotope-weighted average — a mole is a count of particles, so the grams-per-mole figure is an average, not the mass of any single atom.",
  "c = n/V assumes an ideal, homogeneous solution in a constant-volume vessel; temperature-driven volume changes and non-ideal behaviour are not modelled.",
];

type ConvertMode = "mass-to-moles" | "moles-to-mass" | "concentration";

function parsePositive(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function QuantitiesTool({ initialFormula }: ChemToolProps = {}) {
  const [formula, setFormula] = useState(initialFormula?.trim() || "C6H12O6");
  const [mode, setMode] = useState<ConvertMode>("mass-to-moles");
  const [mass, setMass] = useState("180");
  const [moles, setMoles] = useState("1");
  const [nConc, setNConc] = useState("0.5");
  const [volume, setVolume] = useState("0.25");
  const [c1, setC1] = useState("");
  const [v1, setV1] = useState("100");
  const [c2, setC2] = useState("");
  const [v2, setV2] = useState("");

  const parsed = parseFormula(formula);
  const massOf = parsed.ok ? molarMass(parsed.value) : null;
  const composition = parsed.ok ? percentComposition(parsed.value) : null;
  const molarMassG = massOf?.ok ? massOf.value : null;

  // Dilution: exactly three of the four boxes must be filled in.
  const dilutionInputs: Record<DilutionSolved, string> = { c1, v1, c2, v2 };
  const filledCount = (Object.keys(dilutionInputs) as DilutionSolved[]).filter(
    (key) => dilutionInputs[key].trim() !== "",
  ).length;
  const missingCount = 4 - filledCount;

  let dilutionBody: ReactNode = null;
  if (missingCount === 1) {
    const provided: Partial<Record<DilutionSolved, number>> = {};
    let bad = "";
    for (const key of Object.keys(dilutionInputs) as DilutionSolved[]) {
      const raw = dilutionInputs[key].trim();
      if (raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) bad = raw;
      provided[key] = value;
    }
    if (bad !== "") {
      dilutionBody = <ErrorNote message={`“${bad}” must be a positive number.`} />;
    } else {
      const solved = solveDilution(provided);
      if (!solved.ok) {
        dilutionBody = <ErrorNote message={solved.error} />;
      } else {
        const unitOf = (key: DilutionSolved): string => (key.startsWith("v") ? "mL" : "mol/L");
        const labelOf = (key: DilutionSolved): string =>
          key === "c1"
            ? "C₁ stock"
            : key === "v1"
              ? "V₁ taken"
              : key === "c2"
                ? "C₂ final"
                : "V₂ final";
        dilutionBody = (
          <ReadoutGrid>
            {(Object.keys(dilutionInputs) as DilutionSolved[]).map((key) => (
              <Readout
                key={key}
                label={`${labelOf(key)}${solved.solved === key ? " (solved)" : ""}`}
                value={fmt(solved[key], key.startsWith("v") ? 2 : 4)}
                unit={unitOf(key)}
                tone={solved.solved === key ? "good" : "default"}
              />
            ))}
          </ReadoutGrid>
        );
      }
    }
  } else {
    dilutionBody = (
      <p className="text-xs text-muted-foreground">
        {missingCount === 0
          ? "All four boxes are filled — clear one (leave it empty) and it will be solved for you."
          : `Fill ${missingCount} more ${missingCount === 1 ? "box" : "boxes"} — exactly three of C₁, V₁, C₂, V₂ are needed.`}
      </p>
    );
  }

  const nFromMass = molarMassG !== null ? molesFromMass(parsePositive(mass) ?? Number.NaN, molarMassG) : null;
  const massFromN = molarMassG !== null ? massFromMoles(parsePositive(moles) ?? Number.NaN, molarMassG) : null;
  const nOnly = parsePositive(nConc);
  const cValue = nOnly !== null ? concentration(nOnly, parsePositive(volume) ?? Number.NaN) : null;

  return (
    <div className="space-y-4">
      <SimTitle
        title="Moles, mass, concentration & dilution"
        subtitle="One formula drives every conversion: molar mass from the bundled weights, then n = m/M, N = n·Nₐ, c = n/V and C₁V₁ = C₂V₂."
      />

      <Panel
        title="1. Formula & molar mass"
        hint="Type any formula — e.g. C6H12O6, Ca(OH)2, CuSO4·5H2O, or an ion like CO3^2-."
      >
        <TextField
          label="Formula"
          value={formula}
          onChange={setFormula}
          placeholder="C6H12O6"
        />
        {!parsed.ok ? <ErrorNote message={parsed.error} /> : null}
        {parsed.ok && massOf && !massOf.ok ? <ErrorNote message={massOf.error} /> : null}
        {massOf?.ok ? (
          <ReadoutGrid>
            <Readout label="Molar mass M" value={fmt(massOf.value, 3)} unit="g/mol" />
            <Readout
              label="Atoms per formula unit"
              value={String(Object.values(parsed.ok ? parsed.value.atoms : {}).reduce((s, n) => s + n, 0))}
            />
            <Readout label="Species charge" value={`${parsed.ok ? parsed.value.charge : 0} e`} />
          </ReadoutGrid>
        ) : null}
        {composition?.ok ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[11px] text-muted-foreground">
                <th className="py-1 font-medium">Element</th>
                <th className="py-1 text-right font-medium">Count</th>
                <th className="py-1 text-right font-medium">Mass (g/mol)</th>
                <th className="py-1 text-right font-medium">By mass</th>
              </tr>
            </thead>
            <tbody>
              {composition.rows.map((row) => (
                <tr key={row.symbol} className="border-b border-border/50 last:border-0">
                  <td className="py-1 font-mono">{row.symbol}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{row.count}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(row.mass, 3)}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(row.percent, 2)}%</td>
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="py-1" colSpan={2}>
                  Total
                </td>
                <td className="py-1 text-right font-mono tabular-nums">{fmt(composition.total, 3)}</td>
                <td className="py-1 text-right font-mono tabular-nums">100%</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </Panel>

      <Panel title="2. Quantity converter">
        <SimSegmented
          label="What are you converting?"
          value={mode}
          options={[
            { value: "mass-to-moles", label: "Mass → moles" },
            { value: "moles-to-mass", label: "Moles → mass" },
            { value: "concentration", label: "Concentration c = n/V" },
          ]}
          onChange={setMode}
        />
        {mode === "mass-to-moles" ? (
          <div className="space-y-3">
            <NumField label="Mass of sample" value={mass} onChange={setMass} unit="g" placeholder="180" />
            <ReadoutGrid>
              <Readout label="Molar mass M (from the formula)" value={molarMassG !== null ? fmt(molarMassG, 3) : "—"} unit="g/mol" />
              <Readout label="n = m / M" value={nFromMass !== null ? fmt(nFromMass, 5) : "—"} unit="mol" />
              <Readout
                label="Particles N = n · Nₐ"
                value={nFromMass !== null ? sci(particlesFromMoles(nFromMass) ?? Number.NaN) : "—"}
              />
            </ReadoutGrid>
            {molarMassG === null ? (
              <ErrorNote message="Molar mass is unknown until the formula above parses with verified weights — this conversion will not guess." />
            ) : null}
          </div>
        ) : mode === "moles-to-mass" ? (
          <div className="space-y-3">
            <NumField label="Amount" value={moles} onChange={setMoles} unit="mol" placeholder="1" />
            <ReadoutGrid>
              <Readout label="Molar mass M (from the formula)" value={molarMassG !== null ? fmt(molarMassG, 3) : "—"} unit="g/mol" />
              <Readout label="m = n · M" value={massFromN !== null ? fmt(massFromN, 4) : "—"} unit="g" />
              <Readout
                label="Particles N = n · Nₐ"
                value={parsePositive(moles) !== null ? sci(particlesFromMoles(parsePositive(moles) ?? Number.NaN) ?? Number.NaN) : "—"}
              />
            </ReadoutGrid>
            {molarMassG === null ? (
              <ErrorNote message="Molar mass is unknown until the formula above parses with verified weights — this conversion will not guess." />
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumField label="Amount n" value={nConc} onChange={setNConc} unit="mol" placeholder="0.5" />
              <NumField label="Volume V" value={volume} onChange={setVolume} unit="L" placeholder="0.25" />
            </div>
            <ReadoutGrid>
              <Readout label="c = n / V" value={cValue !== null ? fmt(cValue, 4) : "—"} unit="mol/L" />
              <Readout label="Amount n" value={fmt(nOnly ?? Number.NaN, 4)} unit="mol" />
              <Readout label="Volume V" value={fmt(parsePositive(volume) ?? Number.NaN, 3)} unit="L" />
            </ReadoutGrid>
            {cValue === null ? (
              <p className="text-xs text-muted-foreground">
                Both n and V must be positive numbers for c = n/V to apply.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel
        title="3. Dilution  C₁V₁ = C₂V₂"
        hint="Fill in any three boxes; the fourth is solved (concentrations in mol/L, volumes in mL — any consistent pair works)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="C₁  stock concentration" value={c1} onChange={setC1} unit="mol/L" placeholder="(empty = solve)" />
          <NumField label="V₁  stock volume taken" value={v1} onChange={setV1} unit="mL" placeholder="100" />
          <NumField label="C₂  final concentration" value={c2} onChange={setC2} unit="mol/L" placeholder="(empty = solve)" />
          <NumField label="V₂  final volume" value={v2} onChange={setV2} unit="mL" placeholder="(empty = solve)" />
        </div>
        {dilutionBody}
      </Panel>

      <Equations>
        <span>n = m / M — moles from mass and molar mass</span>
        <span>N = n · Nₐ — particles; Nₐ = {sci(AVOGADRO, 8)} mol⁻¹ (exact by definition)</span>
        <span>c = n / V — concentration in mol/L</span>
        <span>C₁V₁ = C₂V₂ — dilution: the amount of solute never changes</span>
      </Equations>
      <ModelLimits assumptions={QUANTITY_LIMITS} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Electron configuration & Lewis structures                               */
/* -------------------------------------------------------------------------- */

const STRUCTURE_LIMITS = [
  "Electron configurations are neutral-atom ground states (Aufbau order with the classic exceptions applied). Ions and excited states are not modelled.",
  "Aufbau exceptions are encoded up to uranium (Z 92); beyond that the lab shows plain Aufbau order and says so rather than inventing a configuration.",
  "A Lewis structure is one valid electron-pair bookkeeping for main-group species — not proof of the real 3D shape, bond strength, or whether the species exists. Resonance is drawn as a single contributor and formal charges are bookkeeping numbers, not measured partial charges.",
  "Radicals, hydrates and non-main-group elements are refused by the Lewis builder rather than guessed.",
];

type StructureMode = "electron" | "lewis";

function formatCharge(fc: number): string {
  if (fc === 0) return "0";
  if (fc === 1) return "+";
  if (fc === -1) return "−";
  return fc > 0 ? `${fc}+` : `${-fc}−`;
}

/** Atom positions: pairs side by side, otherwise a ring around the centre. */
function lewisLayout(count: number, central: number): { x: number; y: number }[] {
  const cx = 280;
  const cy = 150;
  const points: { x: number; y: number }[] = new Array(count);
  if (count === 1) {
    points[0] = { x: cx, y: cy };
  } else if (count === 2) {
    points[0] = { x: cx - 70, y: cy };
    points[1] = { x: cx + 70, y: cy };
  } else {
    const centre = central >= 0 && central < count ? central : 0;
    const ring: number[] = [];
    for (let i = 0; i < count; i += 1) if (i !== centre) ring.push(i);
    ring.forEach((index, position) => {
      const angle = -Math.PI / 2 + (position / ring.length) * 2 * Math.PI;
      points[index] = { x: cx + 96 * Math.cos(angle), y: cy + 96 * Math.sin(angle) };
    });
    points[centre] = { x: cx, y: cy };
  }
  return points;
}

/**
 * One Lewis picture: bond lines (parallel lines for multiple bonds), atom
 * circles drawn ON TOP so lines never poke into them, lone-pair dots on a
 * ring around each atom, formal charges as superscripts.
 */
function LewisDiagram({
  atoms,
  bonds,
  central,
}: {
  atoms: readonly LewisAtom[];
  bonds: readonly LewisBond[];
  central: number;
}) {
  const points = lewisLayout(atoms.length, central);
  return (
    <svg
      viewBox="0 0 560 300"
      className="h-auto w-full rounded-lg border bg-card"
      role="img"
      aria-label={`Lewis structure with ${atoms.length} atoms`}
    >
      {bonds.map((bond, index) => {
        const start = points[bond.from];
        const end = points[bond.to];
        if (!start || !end) return null;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;
        const x1 = start.x + ux * 14;
        const y1 = start.y + uy * 14;
        const x2 = end.x - ux * 14;
        const y2 = end.y - uy * 14;
        const offsets = bond.order <= 1 ? [0] : bond.order === 2 ? [-3.5, 3.5] : [-6, 0, 6];
        return offsets.map((offset, lineIndex) => (
          <line
            key={`${index}-${lineIndex}`}
            x1={x1 + nx * offset}
            y1={y1 + ny * offset}
            x2={x2 + nx * offset}
            y2={y2 + ny * offset}
            className="stroke-foreground"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ));
      })}
      {atoms.map((atom, index) => {
        const point = points[index];
        if (!point) return null;
        const dots = Array.from({ length: atom.loneElectrons }, (_, dot) => {
          const angle =
            -Math.PI / 2 +
            (atom.loneElectrons === 0 ? 0 : (dot / atom.loneElectrons) * 2 * Math.PI);
          return { x: point.x + 17.5 * Math.cos(angle), y: point.y + 17.5 * Math.sin(angle) };
        });
        return (
          <g key={`${atom.symbol}-${index}`}>
            {dots.map((dot, dotIndex) => (
              <circle key={dotIndex} cx={dot.x} cy={dot.y} r={1.8} className="fill-foreground" />
            ))}
            <circle cx={point.x} cy={point.y} r={13} className="fill-card stroke-foreground" strokeWidth={1.25} />
            <text
              x={point.x}
              y={point.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              className="fill-foreground"
            >
              {atom.symbol}
            </text>
            {atom.formalCharge !== 0 ? (
              <text x={point.x + 11} y={point.y - 8} fontSize={10} fontWeight={700} className="fill-foreground">
                {formatCharge(atom.formalCharge)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function StructureTool({ initialFormula, initialMode }: ChemToolProps = {}) {
  const [mode, setMode] = useState<StructureMode>(initialMode ?? "electron");
  const [symbol, setSymbol] = useState("Fe");
  const [formula, setFormula] = useState(initialFormula?.trim() || "H2O");

  const atom = atomInfo(symbol.trim());
  const lewis = solveLewis(formula.trim());

  return (
    <div className="space-y-4">
      <SimTitle
        title="Electron configuration & Lewis structures"
        subtitle="Ground-state configurations from the bundled exception table, and deterministic Lewis diagrams for main-group species."
      />
      <SimSegmented
        label="Tool"
        value={mode}
        options={[
          { value: "electron", label: "Electron configuration" },
          { value: "lewis", label: "Lewis structure" },
        ]}
        onChange={setMode}
      />

      {mode === "electron" ? (
        <Panel title="Element" hint="Any element symbol, e.g. Fe, Cu, Cl — the table is bundled, nothing is fetched.">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <TextField label="Symbol" value={symbol} onChange={setSymbol} placeholder="Fe" list="lab-element-symbols" />
            </div>
            <datalist id="lab-element-symbols">
              {ELEMENT_SYMBOLS.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
          {!atom.ok ? (
            <ErrorNote message={atom.error} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-semibold">{atom.value.name}</span>{" "}
                <span className="font-mono text-muted-foreground">
                  ({atom.value.symbol}, Z = {atom.value.z})
                </span>
              </p>
              <ReadoutGrid>
                <Readout label="Atomic number Z" value={String(atom.value.z)} />
                <Readout
                  label="Standard atomic weight"
                  value={atom.value.weight !== null ? fmt(atom.value.weight, 3) : "—"}
                  unit="g/mol"
                />
                <Readout label="Period (shells filled)" value={String(atom.value.period)} />
                <Readout
                  label="Main-group number"
                  value={atom.value.group !== null ? String(atom.value.group) : "not main group"}
                />
                <Readout label="Electrons per shell" value={atom.value.shells.join(" · ")} />
                <Readout
                  label="Aufbau exception"
                  value={atom.value.exceptionApplied ? "applied" : "none needed"}
                />
              </ReadoutGrid>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm break-all">
                {atom.value.config}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {atom.value.shells.map((count, index) => (
                  <span
                    key={index}
                    className="rounded-md border px-2 py-1 font-mono text-[11px] text-muted-foreground"
                  >
                    Shell {index + 1}: {count} e⁻
                  </span>
                ))}
              </div>
              {atom.value.exceptionApplied ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  One of the documented exceptions to plain Aufbau order — the standard ground state is
                  applied instead. {atom.value.exceptionCoverageNote}
                </p>
              ) : null}
            </div>
          )}
        </Panel>
      ) : (
        <Panel
          title="Lewis structure"
          hint="Main-group formulas only (max 16 atoms), e.g. H2O, CO2, CO3^2-, C2H6O. Charges go after the formula."
        >
          <TextField label="Formula" value={formula} onChange={setFormula} placeholder="H2O" />
          {!lewis.ok ? (
            <ErrorNote message={lewis.error} />
          ) : (
            <div className="space-y-3">
              <LewisDiagram atoms={lewis.atoms} bonds={lewis.bonds} central={lewis.central} />
              <ReadoutGrid>
                <Readout label="Valence electrons total" value={String(lewis.totalValence)} />
                <Readout label="Species charge" value={`${formatCharge(lewis.speciesCharge)}`} />
                <Readout label="Bonds drawn" value={String(lewis.bonds.length)} />
                <Readout
                  label="Central atom"
                  value={
                    lewis.central >= 0
                      ? (lewis.atoms[lewis.central]?.symbol ?? "—")
                      : "none (simple)"
                  }
                />
              </ReadoutGrid>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[11px] text-muted-foreground">
                    <th className="py-1 font-medium">Atom</th>
                    <th className="py-1 text-right font-medium">Lone e⁻</th>
                    <th className="py-1 text-right font-medium">Formal charge</th>
                    <th className="py-1 text-right font-medium">Owns / target</th>
                    <th className="py-1 text-right font-medium">Shell rule</th>
                  </tr>
                </thead>
                <tbody>
                  {lewis.atoms.map((entry, index) => (
                    <tr key={`${entry.symbol}-${index}`} className="border-b border-border/50 last:border-0">
                      <td className="py-1 font-mono">{entry.symbol}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{entry.loneElectrons}</td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {formatCharge(entry.formalCharge)}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {entry.owns} / {entry.target}
                      </td>
                      <td className="py-1 text-right">
                        {entry.incomplete ? (
                          <span className="text-amber-600 dark:text-amber-400">incomplete</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">✓ filled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lewis.notes.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground marker:text-border">
                  {lewis.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Panel>
      )}

      <ModelLimits assumptions={STRUCTURE_LIMITS} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Equilibrium (ICE)                                                       */
/* -------------------------------------------------------------------------- */

export function EquilibriumTool() {
  const [logK, setLogK] = useState(1);
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const [a0, setA0] = useState(1);
  const [b0, setB0] = useState(0);
  const [volume, setVolume] = useState(1);

  const k = 10 ** logK;
  const outcome = solveEquilibrium({ k, a, b, a0, b0, volume });

  return (
    <div className="space-y-4">
      <SimTitle
        title="Equilibrium  aA ⇌ bB"
        subtitle="The ICE table solved exactly for one reversible reaction: Kc, the reaction quotient Q, and how far the mixture moves."
      />
      <SimLayout
        controls={
          <>
            <SimSlider
              label="log₁₀ Kc"
              value={logK}
              min={-4}
              max={4}
              step={0.1}
              digits={1}
              onChange={setLogK}
            />
            <SimSlider label="Coefficient a of A" value={a} min={1} max={4} step={1} digits={0} onChange={setA} />
            <SimSlider label="Coefficient b of B" value={b} min={1} max={4} step={1} digits={0} onChange={setB} />
            <SimSlider label="Start with A" unit="mol" value={a0} min={0} max={10} step={0.05} digits={2} onChange={setA0} />
            <SimSlider label="Start with B" unit="mol" value={b0} min={0} max={10} step={0.05} digits={2} onChange={setB0} />
            <SimSlider label="Volume V" unit="L" value={volume} min={0.1} max={10} step={0.1} digits={1} onChange={setVolume} />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Kc spans eight orders of magnitude on a log scale — small K means the mixture sits to the
              left, large K to the right.
            </p>
          </>
        }
      >
        {!outcome.ok ? (
          <ErrorNote message={outcome.error} />
        ) : (
          <div className="space-y-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[11px] text-muted-foreground">
                  <th className="py-1 font-medium">ICE step (mol/L)</th>
                  <th className="py-1 text-right font-medium">A</th>
                  <th className="py-1 text-right font-medium">B</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-1">Initial</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(outcome.initialA, 4)}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(outcome.initialB, 4)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1">Change</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(outcome.changeA, 4)}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(outcome.changeB, 4)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1">Equilibrium</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(outcome.eqA, 4)}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{fmt(outcome.eqB, 4)}</td>
                </tr>
              </tbody>
            </table>
            <ReadoutGrid>
              <Readout label="Kc" value={sci(k)} />
              <Readout label="Q at the start" value={outcome.q !== null ? sci(outcome.q) : "—"} />
              <Readout
                label="Net direction"
                value={
                  outcome.direction === "forward"
                    ? "forward →"
                    : outcome.direction === "reverse"
                      ? "← reverse"
                      : "at equilibrium"
                }
                tone={outcome.direction === "at-equilibrium" ? "good" : "default"}
              />
              <Readout label="Extent x" value={fmt(outcome.extent, 4)} unit="mol" />
              <Readout label="A converted" value={fmt(outcome.percentAConverted, 1)} unit="%" />
              <Readout
                label="[A] at equilibrium"
                value={fmt(outcome.eqA, 4)}
                unit="mol/L"
              />
            </ReadoutGrid>
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
              {outcome.direction === "forward"
                ? "Q < K: with the starting concentrations the ratio is too small, so the net reaction runs forward until Q reaches K."
                : outcome.direction === "reverse"
                  ? "Q > K: the starting mixture has too much product in ratio terms, so the net reaction runs in reverse until Q reaches K."
                  : "Q ≈ K: the starting mixture is already at equilibrium — concentrations hold steady (both directions still run, but at equal rates)."}
            </p>
          </div>
        )}
        <Equations>
          <span>{"Kc = [B]^b / [A]^a  —  evaluated with EQUILIBRIUM concentrations"}</span>
          <span>{"Q = same expression with the STARTING concentrations — Q < K runs forward, Q > K runs in reverse"}</span>
          <span>{"ICE: [A] = [A]₀ − a·x/V ,  [B] = [B]₀ + b·x/V   (x = extent in mol)"}</span>
          <span>{"% A converted = −Δ[A] / [A]₀ × 100"}</span>
        </Equations>
        <ModelLimits assumptions={EQUILIBRIUM_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export type ChemToolKind = "balance" | "quantities" | "structure" | "equilibrium";

/**
 * Optional prefills for tools launched from Ashy's `[[lab: …]]` marker
 * (Issue 2). Every field is bounded text already validated twice before it
 * gets here; tools fall back to their own defaults when the prop is absent.
 */
export interface ChemToolProps {
  /** Balance tool: a student/model-supplied equation to start from. */
  initialEquation?: string;
  /** Quantities / structure tools: a formula to start from (e.g. H2O). */
  initialFormula?: string;
  /** Structure tool: which half of the tool to open. */
  initialMode?: "electron" | "lewis";
}

export interface ChemToolEntry {
  kind: ChemToolKind;
  title: string;
  subtitle: string;
  Component: ComponentType<ChemToolProps>;
}

export const CHEM_TOOLS: readonly ChemToolEntry[] = [
  {
    kind: "balance",
    title: "Equation balancer",
    subtitle: "Balance any equation — or check the coefficients you entered",
    Component: BalanceTool,
  },
  {
    kind: "quantities",
    title: "Moles & concentration",
    subtitle: "Molar mass, n = m/M, c = n/V and dilution C₁V₁ = C₂V₂",
    Component: QuantitiesTool,
  },
  {
    kind: "structure",
    title: "Atomic & Lewis structure",
    subtitle: "Electron configurations and Lewis diagrams",
    Component: StructureTool,
  },
  {
    kind: "equilibrium",
    title: "Equilibrium (ICE table)",
    subtitle: "Kc, Q and the extent of reaction for aA ⇌ bB",
    Component: EquilibriumTool,
  },
];

/* -------------------------------------------------------------------------- */