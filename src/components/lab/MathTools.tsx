/**
 * Mathematics lab tools (application-owned components).
 *
 * The quadratic explorer pairs the pure algebra in `src/lib/lab/quadratic.ts`
 * with a directly DRAGGABLE plot: the vertex handle rewrites the equation in
 * vertex form, the arm handle changes the leading coefficient, and the
 * sliders, the equation line, the curve and every readout all read from the
 * same coefficient triple — so they can never disagree. No AI-generated code
 * ever reaches these components.
 */

import { useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from "react";
import {
  discriminantLabel,
  formatQuadratic,
  clampA,
  quadraticFeatures,
  quadraticY,
  sampleParabola,
  vertexToStandard,
  type Quadratic,
} from "@/lib/lab/quadratic";
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
/* Shared plot geometry                                                       */
/* -------------------------------------------------------------------------- */

const WIDTH = 560;
const HEIGHT = 320;
const PAD = { left: 42, right: 14, top: 16, bottom: 30 };
/** Fixed view window — dragging stays predictable on every screen size. */
const X_RANGE: [number, number] = [-6, 6];
const Y_RANGE: [number, number] = [-9, 9];
/** The vertex handle may sit anywhere inside this inner box. */
const VERTEX_BOX = { x: [-4, 4] as [number, number], y: [-7.5, 7.5] as [number, number] };
/** Horizontal distance from the vertex to the arm handle (world units). */
const ARM_DX = 2;

const mapX = (x: number): number =>
  PAD.left + ((x - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0])) * (WIDTH - PAD.left - PAD.right);
const mapY = (y: number): number =>
  HEIGHT - PAD.bottom - ((y - Y_RANGE[0]) / (Y_RANGE[1] - Y_RANGE[0])) * (HEIGHT - PAD.top - PAD.bottom);
const unmapX = (px: number): number =>
  X_RANGE[0] + ((px - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (X_RANGE[1] - X_RANGE[0]);
const unmapY = (py: number): number =>
  Y_RANGE[0] + ((HEIGHT - PAD.bottom - py) / (HEIGHT - PAD.top - PAD.bottom)) * (Y_RANGE[1] - Y_RANGE[0]);

const clamp = (value: number, range: [number, number]): number =>
  Math.min(range[1], Math.max(range[0], value));

/* -------------------------------------------------------------------------- */
/* 1. Quadratic explorer                                                      */
/* -------------------------------------------------------------------------- */

const PRESETS: readonly { label: string; q: Quadratic }[] = [
  { label: "Two roots", q: { a: 1, b: 0, c: -4 } },
  { label: "One root", q: { a: 1, b: -4, c: 4 } },
  { label: "No real roots", q: { a: 1, b: 0, c: 4 } },
  { label: "Opens down", q: { a: -1, b: 2, c: 3 } },
];

export function QuadraticLab() {
  const [q, setQ] = useState<Quadratic>({ a: 1, b: 0, c: -4 });
  const [drag, setDrag] = useState<null | "vertex" | "arm">(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const features = quadraticFeatures(q);
  const equation = formatQuadratic(q);

  const curve = sampleParabola(q, X_RANGE[0], X_RANGE[1], 200);
  const armX = features.vertex.h + ARM_DX;
  const armY = quadraticY(q, armX);
  const discriminant = discriminantLabel(features.discriminant);

  /** Client pixel → world coordinates inside the SVG. */
  const toWorld = (event: ReactPointerEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const py = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    return { x: unmapX(px), y: unmapY(py) };
  };

  const startDrag = (kind: "vertex" | "arm") => (event: ReactPointerEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag(kind);
  };

  const onDrag = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (drag === null) return;
    const world = toWorld(event);
    if (drag === "vertex") {
      // Move the whole curve: a is preserved, b and c follow the vertex.
      const h = clamp(world.x, VERTEX_BOX.x);
      const k = clamp(world.y, VERTEX_BOX.y);
      setQ(vertexToStandard(q.a, h, k));
    } else {
      // Pull the arm: the vertex stays put, only the steepness changes.
      const k = features.vertex.k;
      const raw = (world.y - k) / (ARM_DX * ARM_DX);
      setQ(vertexToStandard(clampA(raw), features.vertex.h, k));
    }
  };

  const stopDrag = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  };

  const setCoefficient = (key: keyof Quadratic) => (value: number) => {
    setQ((current) => ({
      ...current,
      [key]: key === "a" ? clampA(value) : value,
    }));
  };

  return (
    <div className="space-y-4">
      <SimTitle
        title="Quadratic functions — drag the parabola"
        subtitle="Drag the vertex to slide the curve, drag the arm point to change its steepness, or move the sliders. The equation, the roots and the discriminant update live."
      />
      <SimLayout
        controls={
          <>
            <p className="rounded-lg border bg-muted/40 px-2.5 py-2 font-mono text-sm tabular-nums">
              {equation}
            </p>
            <SimSlider
              label="Coefficient a"
              value={q.a}
              min={-3}
              max={3}
              step={0.05}
              onChange={setCoefficient("a")}
            />
            <SimSlider
              label="Coefficient b"
              value={q.b}
              min={-8}
              max={8}
              step={0.25}
              onChange={setCoefficient("b")}
            />
            <SimSlider
              label="Coefficient c"
              value={q.c}
              min={-8}
              max={8}
              step={0.25}
              onChange={setCoefficient("c")}
            />
            <SimSegmented
              label="Jump to a known shape"
              value={PRESETS.some((preset) => sameQuadratic(preset.q, q)) ? formatQuadratic(q) : "custom"}
              options={[
                ...PRESETS.map((preset) => ({ value: formatQuadratic(preset.q), label: preset.label })),
                { value: "custom", label: "Custom" },
              ]}
              onChange={(value) => {
                const preset = PRESETS.find((candidate) => formatQuadratic(candidate.q) === value);
                if (preset) setQ({ ...preset.q });
              }}
            />
            <button
              type="button"
              onClick={() => setQ((current) => ({ ...current, a: clampA(-current.a) }))}
              className="w-full cursor-pointer rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Flip it over (negate a)
            </button>
          </>
        }
      >
        <figure className="min-w-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full touch-none rounded-lg border bg-card"
            role="img"
            aria-label={`Parabola ${equation}, vertex at (${fmt(features.vertex.h, 2)}, ${fmt(features.vertex.k, 2)})`}
          >
            {/* gridlines */}
            {Array.from({ length: 13 }, (_, i) => X_RANGE[0] + i).map((x) => (
              <line
                key={`gx-${x}`}
                x1={mapX(x)}
                y1={PAD.top}
                x2={mapX(x)}
                y2={HEIGHT - PAD.bottom}
                className="stroke-border/60"
                strokeWidth={x === 0 ? 0 : 0.5}
              />
            ))}
            {Array.from({ length: 19 }, (_, i) => Y_RANGE[0] + i).map((y) => (
              <line
                key={`gy-${y}`}
                x1={PAD.left}
                y1={mapY(y)}
                x2={WIDTH - PAD.right}
                y2={mapY(y)}
                className="stroke-border/60"
                strokeWidth={y === 0 ? 0 : 0.5}
              />
            ))}
            {/* axes */}
            <line x1={PAD.left} y1={mapY(0)} x2={WIDTH - PAD.right} y2={mapY(0)} className="stroke-border" strokeWidth={1.25} />
            <line x1={mapX(0)} y1={PAD.top} x2={mapX(0)} y2={HEIGHT - PAD.bottom} className="stroke-border" strokeWidth={1.25} />
            {/* axis of symmetry */}
            <line
              x1={mapX(features.axisX)}
              y1={PAD.top}
              x2={mapX(features.axisX)}
              y2={HEIGHT - PAD.bottom}
              className="stroke-primary/40"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            {/* the parabola */}
            <path
              d={curve
                .map((point, index) => `${index === 0 ? "M" : "L"}${mapX(point.x).toFixed(2)},${mapY(point.y).toFixed(2)}`)
                .join(" ")}
              fill="none"
              className="stroke-primary"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            {/* real roots on the x-axis */}
            {features.roots.map((root) => (
              <g key={`root-${root}`}>
                <circle cx={mapX(root)} cy={mapY(0)} r={4.5} className="fill-emerald-500" />
                <text x={mapX(root)} y={mapY(0) - 10} textAnchor="middle" fontSize={10} className="fill-emerald-600 dark:fill-emerald-400">
                  {fmt(root, 2)}
                </text>
              </g>
            ))}
            {/* y-intercept */}
            <circle cx={mapX(0)} cy={mapY(q.c)} r={3} className="fill-muted-foreground" />
            {/* vertex crosshair */}
            <line
              x1={mapX(features.vertex.h)}
              y1={mapY(features.vertex.k)}
              x2={mapX(0)}
              y2={mapY(features.vertex.k)}
              className="stroke-border"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            {/* draggable vertex handle */}
            <circle
              cx={mapX(features.vertex.h)}
              cy={mapY(features.vertex.k)}
              r={9}
              className={`cursor-grab fill-primary stroke-background stroke-2 ${drag === "vertex" ? "opacity-70" : ""}`}
              onPointerDown={startDrag("vertex")}
              onPointerMove={onDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              role="slider"
              aria-label="Vertex handle — drag to move the parabola"
              aria-valuetext={`vertex ${fmt(features.vertex.h, 2)}, ${fmt(features.vertex.k, 2)}`}
            />
            {/* draggable arm handle (sets a) */}
            <circle
              cx={mapX(armX)}
              cy={mapY(armY)}
              r={7}
              className={`cursor-grab fill-emerald-500 stroke-background stroke-2 ${drag === "arm" ? "opacity-70" : ""}`}
              onPointerDown={startDrag("arm")}
              onPointerMove={onDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              role="slider"
              aria-label="Arm handle — drag vertically to change the steepness a"
              aria-valuetext={`a ${fmt(q.a, 2)}`}
            />
            {/* labels */}
            <text x={mapX(features.vertex.h) + 12} y={mapY(features.vertex.k) + 4} fontSize={10} className="fill-foreground">
              vertex
            </text>
            <text x={mapX(armX) + 10} y={mapY(armY) + 4} fontSize={10} className="fill-emerald-600 dark:fill-emerald-400">
              arm (sets a)
            </text>
            <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" fontSize={10} className="fill-muted-foreground">
              x
            </text>
            <text x={4} y={PAD.top + 8} fontSize={10} className="fill-muted-foreground">
              y
            </text>
          </svg>
          <figcaption className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-primary" /> vertex handle
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-500" /> arm handle (a)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-500" /> real roots
            </span>
            <span>axis of symmetry (dashed)</span>
          </figcaption>
        </figure>

        <ReadoutGrid>
          <Readout label="Vertex (h, k)" value={`(${fmt(features.vertex.h, 2)}, ${fmt(features.vertex.k, 2)})`} />
          <Readout label="Axis of symmetry" value={`x = ${fmt(features.axisX, 2)}`} />
          <Readout label="Discriminant b²−4ac" value={fmt(features.discriminant, 2)} tone={discriminant.tone} />
          <Readout
            label="Real roots"
            value={features.roots.length === 0 ? "none" : features.roots.map((root) => fmt(root, 2)).join(", ")}
            tone={features.roots.length === 2 ? "good" : features.roots.length === 0 ? "warn" : "default"}
          />
          <Readout label="y-intercept" value={`(0, ${fmt(q.c, 2)})`} />
          <Readout label="Opens" value={features.opensUp ? "upward (a > 0)" : "downward (a < 0)"} />
        </ReadoutGrid>

        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Why it moved:</span>{" "}
          {drag === "vertex"
            ? "dragging the vertex keeps a the same — the whole curve translates, so only b and c change to follow it."
            : drag === "arm"
              ? "dragging the arm keeps the vertex fixed and changes a — a larger |a| makes the parabola narrower."
              : "moving a slider changes one coefficient; every other feature is recomputed from it with exact algebra."}{" "}
          Same curve in vertex form: <span className="font-mono">{vertexForm(q, features.vertex)}</span>
        </p>

        <Equations>
          <span>y = a·x² + b·x + c, vertex at x = −b/(2a)</span>
          <span>discriminant Δ = b² − 4ac — Δ &gt; 0: two roots, Δ = 0: one, Δ &lt; 0: none</span>
        </Equations>
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Challenge:</span> drag the vertex until the two
          green roots merge into one — you have just made the discriminant exactly zero. Then flip a
          over and watch the roots swap sides.
        </p>
        <ModelLimits
          assumptions={[
            "Only real roots are marked — when the discriminant is negative the curve simply does not touch the x-axis (the complex roots are not drawn).",
            "The view is a fixed window (x from −6 to 6, y from −9 to 9); parts of the curve outside it are clipped.",
            "Displayed numbers are rounded to two decimals; the curve itself is computed at full precision.",
          ]}
        />
      </SimLayout>
    </div>
  );
}

function sameQuadratic(a: Quadratic, b: Quadratic): boolean {
  return (
    Math.abs(a.a - b.a) < 1e-9 && Math.abs(a.b - b.b) < 1e-9 && Math.abs(a.c - b.c) < 1e-9
  );
}

/** y = a(x − h)² + k with typographic signs — the identity just shown above. */
function vertexForm(q: Quadratic, vertex: { h: number; k: number }): string {
  const { h, k } = vertex;
  const aText = Math.abs(q.a - Math.round(q.a)) < 1e-9 ? String(Math.round(q.a)) : q.a.toFixed(2);
  const xPart = Math.abs(h) < 1e-9 ? "x²" : `(x ${h < 0 ? "+" : "−"} ${fmt(Math.abs(h), 2)})²`;
  const kPart = Math.abs(k) < 1e-9 ? "" : ` ${k < 0 ? "−" : "+"} ${fmt(Math.abs(k), 2)}`;
  return `y = ${aText}${xPart}${kPart}`;
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export type MathToolKind = "quadratic";

export interface MathToolEntry {
  kind: MathToolKind;
  title: string;
  subtitle: string;
  Component: ComponentType;
}

export const MATH_TOOLS: readonly MathToolEntry[] = [
  {
    kind: "quadratic",
    title: "Quadratic functions",
    subtitle: "Drag the vertex and arm of a parabola; roots, vertex and discriminant update live",
    Component: QuadraticLab,
  },
];
