/**
 * Simulation framework for the Phase 4 lab (application-owned UI).
 *
 * Everything the student touches here feeds straight into the pure,
 * deterministic engines in `src/lib/lab/*`: the same control values always
 * produce the same numbers and the same curves, so visuals and readouts can
 * never disagree. Animation is driven by an explicit SIMULATION clock (see
 * `useSimClock`) rather than by wall-clock state — every frame is a pure
 * function of the current simulation time.
 *
 * No AI-generated code ever reaches these components; the only external
 * input is validated numbers (and validated formulas/equations parsed by
 * the lab parsers).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** Human-friendly number: fixed decimals, ∞ for infinities, — for NaN. */
export function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "−∞" : "—";
  const rounded = value.toFixed(digits);
  return rounded.replace(/^-/, "−"); // typographic minus for display
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

export function SimSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  digits = 2,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums text-foreground">
          {fmt(value, digits)}
          {unit ? <span className="ml-1 text-muted-foreground">{unit}</span> : null}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={(next) => {
          const parsed = next[0];
          if (typeof parsed === "number" && Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}

/** Segmented control for small mode switches (series/parallel, style…). */
export function SimSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      ) : null}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              option.value === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Play/pause + reset (and an optional single step), wired to the clock. */
export function SimTransport({
  playing,
  onToggle,
  onReset,
  onStep,
  hint,
}: {
  playing: boolean;
  onToggle: () => void;
  onReset: () => void;
  /** When provided, shows a Step button that advances one fixed tick. */
  onStep?: () => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        {playing ? "Pause" : "Play"}
      </button>
      {onStep ? (
        <button
          type="button"
          onClick={onStep}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StepForward className="size-3.5" />
          Step
        </button>
      ) : null}
      <button
        type="button"
        onClick={onReset}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <RotateCcw className="size-3.5" />
        Reset
      </button>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Deterministic simulation clock                                             */
/* -------------------------------------------------------------------------- */

/**
 * Simulation time advances only while playing, in fixed steps derived from
 * rAF timestamps, looping at `tEnd`. Every animated pixel is computed from
 * the returned `t` through a pure function — pausing or resuming never makes
 * the physics jump, and two runs with the same control values trace the same
 * path.
 */
export function useSimClock(tEnd: number): {
  t: number;
  playing: boolean;
  toggle: () => void;
  reset: () => void;
  step: (dt?: number) => void;
  setPlaying: (playing: boolean) => void;
} {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  // Keep the playhead inside the (possibly shortened) window.
  useEffect(() => {
    setT((previous) => Math.min(previous, tEnd));
  }, [tEnd]);

  useEffect(() => {
    if (!playing) {
      lastRef.current = null;
      return;
    }
    const step = (now: number): void => {
      if (lastRef.current === null) lastRef.current = now;
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;
      setT((previous) => {
        const next = previous + dt;
        return next >= tEnd ? 0 : next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = null;
    };
  }, [playing, tEnd]);

  const toggle = useCallback(() => setPlaying((current) => !current), []);
  const reset = useCallback(() => {
    setPlaying(false);
    setT(0);
  }, []);
  // Single fixed tick ("Step") — pauses first so play and step never fight,
  // and clamps at tEnd instead of wrapping, so a step never hides the result.
  const step = useCallback(
    (dt = 0.25) => {
      setPlaying(false);
      setT((previous) => Math.min(previous + Math.max(0, dt), tEnd));
    },
    [tEnd],
  );
  return { t, playing, toggle, reset, step, setPlaying };
}

/* -------------------------------------------------------------------------- */
/* Readouts                                                                   */
/* -------------------------------------------------------------------------- */

export function Readout({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "warn" | "good";
}) {
  return (
    <div className="rounded-lg border bg-card px-2.5 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm tabular-nums",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
        {unit ? <span className="ml-1 text-[11px] text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

export function ReadoutGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Equations & assumptions                                                    */
/* -------------------------------------------------------------------------- */

export function Equations({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title ?? "Equations in use"}
      </p>
      <div className="mt-1.5 space-y-1 font-mono text-xs text-foreground">{children}</div>
    </div>
  );
}

/**
 * The honesty box: every simulation states the model's limits in the UI, so
 * an educational approximation is never mistaken for a real prediction.
 */
export function ModelLimits({ assumptions }: { assumptions: readonly string[] }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
        What this model leaves out
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground marker:text-amber-500/70">
        {assumptions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SVG line plot                                                              */
/* -------------------------------------------------------------------------- */

export interface PlotSeries {
  points: { x: number; y: number }[];
  /** Tailwind stroke classes, e.g. "stroke-primary". */
  stroke: string;
  label?: string;
  dashed?: boolean;
  width?: number;
}

export function LinePlot({
  series,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  markerX,
  height = 170,
  title,
}: {
  series: PlotSeries[];
  xLabel: string;
  yLabel: string;
  /** Fixed domains (auto-scaled when omitted). */
  xDomain?: [number, number];
  yDomain?: [number, number];
  /** Vertical playhead line (e.g. the current simulation time). */
  markerX?: number | null;
  height?: number;
  title?: string;
}) {
  const width = 560;
  const padLeft = 46;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 28;

  const all = series.flatMap((entry) => entry.points).filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  if (all.length === 0) return null;

  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  const rawX: [number, number] = [Math.min(...xs), Math.max(...xs)];
  const rawY: [number, number] = [Math.min(...ys), Math.max(...ys)];
  const xSpan = rawX[1] - rawX[0] || 1;
  const ySpan = rawY[1] - rawY[0] || 1;
  const xRange: [number, number] = xDomain ?? [rawX[0] - xSpan * 0.04, rawX[1] + xSpan * 0.04];
  const yRange: [number, number] = yDomain ?? [rawY[0] - ySpan * 0.1, rawY[1] + ySpan * 0.1];

  const mapX = (x: number): number =>
    padLeft + ((x - xRange[0]) / (xRange[1] - xRange[0] || 1)) * (width - padLeft - padRight);
  const mapY = (y: number): number =>
    height - padBottom - ((y - yRange[0]) / (yRange[1] - yRange[0] || 1)) * (height - padTop - padBottom);

  return (
    <figure className="min-w-0">
      {title ? (
        <figcaption className="mb-1 text-[11px] font-semibold text-muted-foreground">
          {title}
        </figcaption>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full rounded-lg border bg-card"
        role="img"
        aria-label={title ?? `${yLabel} against ${xLabel}`}
      >
        {/* frame + axes */}
        <line
          x1={padLeft}
          y1={padTop}
          x2={padLeft}
          y2={height - padBottom}
          className="stroke-border"
          strokeWidth={1}
        />
        <line
          x1={padLeft}
          y1={height - padBottom}
          x2={width - padRight}
          y2={height - padBottom}
          className="stroke-border"
          strokeWidth={1}
        />
        {/* zero line when the domain crosses zero */}
        {yRange[0] < 0 && yRange[1] > 0 ? (
          <line
            x1={padLeft}
            y1={mapY(0)}
            x2={width - padRight}
            y2={mapY(0)}
            className="stroke-border"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ) : null}
        {series.map((entry, index) => {
          const path = entry.points
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
            .map((point, i) => `${i === 0 ? "M" : "L"}${mapX(point.x).toFixed(2)},${mapY(point.y).toFixed(2)}`)
            .join(" ");
          return (
            <path
              key={`${entry.label ?? "series"}-${index}`}
              d={path}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={entry.dashed ? "5 4" : undefined}
              className={entry.stroke}
            />
          );
        })}
        {markerX !== null && markerX !== undefined && Number.isFinite(markerX) ? (
          <line
            x1={mapX(markerX)}
            y1={padTop}
            x2={mapX(markerX)}
            y2={height - padBottom}
            className="stroke-primary/60"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}
        {/* axis labels */}
        <text x={padLeft} y={height - 8} className="fill-muted-foreground" fontSize={10}>
          {xLabel}
        </text>
        <text x={4} y={padTop + 8} className="fill-muted-foreground" fontSize={10}>
          {yLabel}
        </text>
        <text x={width - padRight} y={height - 8} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
          {fmt(xRange[1], 1)}
        </text>
        <text x={padLeft - 6} y={mapY(yRange[1]) + 10} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
          {fmt(yRange[1], 1)}
        </text>
        <text x={padLeft - 6} y={mapY(yRange[0])} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
          {fmt(yRange[0], 1)}
        </text>
      </svg>
      {series.some((entry) => entry.label) ? (
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {series.map((entry, index) =>
            entry.label ? (
              <span key={`${entry.label}-${index}`} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-0.5 w-4 rounded-full",
                    entry.stroke.replace("stroke-", "bg-"),
                  )}
                />
                {entry.label}
              </span>
            ) : null,
          )}
        </div>
      ) : null}
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Two-column layout: controls on the left, visuals on the right. */
export function SimLayout({
  controls,
  children,
}: {
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-4">{controls}</div>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

export function SimTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}
