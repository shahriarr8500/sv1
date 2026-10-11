/**
 * VectorExplorer — the interactive 2D vector tool (Phase 3).
 *
 * Every number on screen — components, magnitudes, directions, the dot
 * product and its explanation — is computed by the pure functions in
 * `@/lib/ashy-math`, and the arrows are drawn from those SAME values, so the
 * picture and the readouts can never disagree.
 *
 * Accessibility: the component inputs are plain labelled number fields
 * (fully keyboard-operable), the plot is an `img` with a text summary, and
 * Reset restores the initial values in one click.
 */

import { useId, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addVectors,
  directionDegrees,
  dotProduct,
  dotRelation,
  explainDot,
  formatNumber,
  isFiniteNumber,
  magnitude,
  makeVec,
  type Vec2,
} from "@/lib/ashy-math";

/** Range for TYPED components. Marker-provided initials may go up to the
 *  engine's ±1000 cap — the grid auto-fits either way. */
const COMPONENT_LIMIT = 100;

export interface VectorExplorerProps {
  /** Starting components (e.g. from an Ashy "Explore this visually" marker). */
  initial?: { ax: number; ay: number; bx: number; by: number };
}

const DEFAULT_INITIAL = { ax: 3, ay: 4, bx: -1, by: 2 };

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function clampComponent(value: number): number {
  return Math.min(COMPONENT_LIMIT, Math.max(-COMPONENT_LIMIT, value));
}

/** Grid step that keeps ~10 lines per axis for a given half-width. */
function gridStep(half: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 20]) {
    if (half / step <= 10) return step;
  }
  return 50;
}

/* -------------------------------------------------------------------------- */
/* Component input with local text state (typing stays pleasant)               */
/* -------------------------------------------------------------------------- */

function ComponentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(() => formatNumber(value, 2));
  const [editing, setEditing] = useState(false);
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min={-COMPONENT_LIMIT}
        max={COMPONENT_LIMIT}
        step={0.5}
        value={editing ? text : formatNumber(value, 2)}
        onChange={(event) => {
          setText(event.target.value);
          setEditing(true);
          const parsed = Number(event.target.value);
          if (isFiniteNumber(parsed)) {
            onChange(clampComponent(parsed));
          }
        }}
        onBlur={() => {
          setEditing(false);
          setText(formatNumber(value, 2));
        }}
        className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-center text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={label}
      />
    </label>
  );
}

/* -------------------------------------------------------------------------- */

export function VectorExplorer({ initial }: VectorExplorerProps) {
  const start = initial ?? DEFAULT_INITIAL;
  // Initial values from a marker are honored exactly (validated by makeVec,
  // which enforces the engine's ±1000 cap); only typed input is clamped to
  // the friendlier ±100 range.
  const [a, setA] = useState<Vec2>(
    () => makeVec(start.ax, start.ay) ?? { x: 3, y: 4 },
  );
  const [b, setB] = useState<Vec2>(
    () => makeVec(start.bx, start.by) ?? { x: -1, y: 2 },
  );

  // The single source of truth for every displayed value and every arrow.
  const calc = useMemo(() => {
    const r = addVectors(a, b);
    const relation = dotRelation(a, b);
    return {
      r,
      aMag: magnitude(a),
      bMag: magnitude(b),
      rMag: magnitude(r),
      aDir: directionDegrees(a),
      bDir: directionDegrees(b),
      rDir: directionDegrees(r),
      dot: dotProduct(a, b),
      relation,
      explanation: explainDot(relation),
    };
  }, [a, b]);

  const reset = () => {
    setA(makeVec(start.ax, start.ay) ?? { x: 3, y: 4 });
    setB(makeVec(start.bx, start.by) ?? { x: -1, y: 2 });
  };

  /* --- geometry (derived from the same values) -------------------------- */

  const size = 420;
  const center = size / 2;
  const maxAbs = Math.max(
    Math.abs(a.x), Math.abs(a.y),
    Math.abs(b.x), Math.abs(b.y),
    Math.abs(calc.r.x), Math.abs(calc.r.y),
    4,
  );
  const worldHalf = maxAbs + 1;
  const scale = (center - 20) / worldHalf;
  const step = gridStep(worldHalf);

  const sx = (x: number) => center + x * scale;
  const sy = (y: number) => center - y * scale;

  const gridLines: number[] = [];
  for (let v = -Math.floor(worldHalf / step) * step; v <= worldHalf; v += step) {
    gridLines.push(Math.round(v * 1000) / 1000);
  }

  const arrowId = useId();

  // Markers inherit styles from where they are DEFINED, not where they are
  // used — so each colour gets its own marker with an explicit fill.
  const arrow = (v: Vec2, color: string, marker: string, dashed = false) => (
    <line
      x1={sx(0)}
      y1={sy(0)}
      x2={sx(v.x)}
      y2={sy(v.y)}
      stroke={color}
      strokeWidth={2.5}
      strokeDasharray={dashed ? "6 4" : undefined}
      markerEnd={`url(#${arrowId}-${marker})`}
    />
  );

  const vectorLabel = (text: string, v: Vec2, color: string) => (
    <text
      x={sx(v.x) + (v.x >= 0 ? 8 : -8)}
      y={sy(v.y) + (v.y >= 0 ? -8 : 14)}
      textAnchor={v.x >= 0 ? "start" : "end"}
      fontSize={13}
      fontWeight={700}
      fill={color}
      stroke="var(--background)"
      strokeWidth={3}
      style={{ paintOrder: "stroke" }}
    >
      {text}
    </text>
  );

  const rows: Array<{ label: string; v: Vec2; dir: number | null }> = [
    { label: "A", v: a, dir: calc.aDir },
    { label: "B", v: b, dir: calc.bDir },
    { label: "R = A + B", v: calc.r, dir: calc.rDir },
  ];

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* Plot */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full max-w-[440px] shrink-0 rounded-lg border bg-background"
        role="img"
        aria-label={`Vector plot: A equals ${formatNumber(a.x)} comma ${formatNumber(a.y)}, B equals ${formatNumber(b.x)} comma ${formatNumber(b.y)}, resultant R equals ${formatNumber(calc.r.x)} comma ${formatNumber(calc.r.y)}.`}
      >
        <defs>
          {[
            { id: "a", fill: "#059669" },
            { id: "b", fill: "#d97706" },
            { id: "r", fill: "#2563eb" },
          ].map(({ id, fill }) => (
            <marker
              key={id}
              id={`${arrowId}-${id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
            </marker>
          ))}
        </defs>

        {/* Grid */}
        {gridLines.map((v) => (
          <g key={`g${v}`}>
            <line x1={sx(v)} y1={0} x2={sx(v)} y2={size} stroke="var(--muted)" strokeWidth={v === 0 ? 0 : 1} />
            <line x1={0} y1={sy(v)} x2={size} y2={sy(v)} stroke="var(--muted)" strokeWidth={v === 0 ? 0 : 1} />
          </g>
        ))}

        {/* Axes */}
        <line x1={0} y1={sy(0)} x2={size} y2={sy(0)} stroke="var(--muted-foreground)" strokeWidth={1.2} />
        <line x1={sx(0)} y1={0} x2={sx(0)} y2={size} stroke="var(--muted-foreground)" strokeWidth={1.2} />
        <text x={size - 8} y={sy(0) - 6} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">x</text>
        <text x={sx(0) + 6} y={12} fontSize={11} fill="var(--muted-foreground)">y</text>

        {/* Tick labels */}
        {gridLines.map((v) =>
          v === 0 ? null : (
            <g key={`t${v}`}>
              <text x={sx(v)} y={sy(0) + 12} textAnchor="middle" fontSize={8.5} fill="var(--muted-foreground)">
                {formatNumber(v, 1)}
              </text>
              <text x={sx(0) - 5} y={sy(v) + 3} textAnchor="end" fontSize={8.5} fill="var(--muted-foreground)">
                {formatNumber(v, 1)}
              </text>
            </g>
          ),
        )}

        {arrow(calc.r, "#2563eb", "r", true)}
        {arrow(b, "#d97706", "b")}
        {arrow(a, "#059669", "a")}

        {vectorLabel("A", a, "#059669")}
        {vectorLabel("B", b, "#d97706")}
        {vectorLabel("R", calc.r, "#2563eb")}
      </svg>

      {/* Controls + readouts */}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Components</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 cursor-pointer gap-1 text-xs"
              onClick={reset}
              aria-label="Reset vectors to their starting values"
            >
              <RotateCcw className="size-3" aria-hidden /> Reset
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <ComponentInput label="A x" value={a.x} onChange={(x) => setA((v) => ({ ...v, x }))} />
            <ComponentInput label="A y" value={a.y} onChange={(y) => setA((v) => ({ ...v, y }))} />
            <ComponentInput label="B x" value={b.x} onChange={(x) => setB((v) => ({ ...v, x }))} />
            <ComponentInput label="B y" value={b.y} onChange={(y) => setB((v) => ({ ...v, y }))} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold">Vector</th>
                <th className="px-2.5 py-1.5 font-semibold">Components</th>
                <th className="px-2.5 py-1.5 font-semibold">Magnitude</th>
                <th className="px-2.5 py-1.5 font-semibold">Direction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t">
                  <td className="px-2.5 py-1.5 font-medium">{row.label}</td>
                  <td className="px-2.5 py-1.5 font-mono text-xs">
                    ({formatNumber(row.v.x)}, {formatNumber(row.v.y)})
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-xs">
                    {formatNumber(magnitude(row.v))}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-xs">
                    {row.dir === null ? "undefined" : `${formatNumber(row.dir)}°`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs">
          <p className="font-mono text-sm">
            A · B = {formatNumber(calc.dot)}
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {calc.explanation}
          </p>
        </div>
      </div>
    </div>
  );
}
