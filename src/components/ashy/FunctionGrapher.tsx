/**
 * FunctionGrapher — the interactive graphing tool (Phase 3).
 *
 * Application-owned by design: expressions go through the SAFE parser in
 * `@/lib/ashy-graph` (a whitelisted AST — never `eval`, never a Function
 * constructor, never AI-supplied code), and the plot is drawn here from the
 * same deterministic sampling every readout uses.
 *
 * Students can edit up to three expressions, drive parameters a–d with
 * sliders, and change the visible bounds — everything validated and clamped.
 */

import { useId, useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_BOUNDS,
  GRAPH_PARAMETERS,
  MAX_EXPRESSION_LENGTH,
  normalizeBounds,
  parseExpression,
  plotSegments,
  type PlotBounds,
  type PlotPoint,
} from "@/lib/ashy-graph";
import { formatNumber, isFiniteNumber } from "@/lib/ashy-math";

/** One colour per expression slot — legible on light and dark backgrounds. */
const SERIES_COLORS = ["#2563eb", "#d97706", "#059669"];
const MAX_EXPRESSIONS = 3;

export interface FunctionGrapherProps {
  /** Starting expression (e.g. from an Ashy "Explore this visually" marker). */
  initialExpression?: string;
}

/* -------------------------------------------------------------------------- */

function gridStep(span: number): number {
  for (const step of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]) {
    if (span / step <= 12) return step;
  }
  return 200;
}

function segmentsToPaths(
  segments: PlotPoint[][],
  bounds: PlotBounds,
  width: number,
  height: number,
): string[] {
  const sx = (x: number) => ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * width;
  const sy = (y: number) => height - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * height;
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) =>
      segment
        .map((point, index) =>
          `${index === 0 ? "M" : "L"}${sx(point.x).toFixed(1)} ${sy(point.y).toFixed(1)}`,
        )
        .join(" "),
    );
}

/* -------------------------------------------------------------------------- */

export function FunctionGrapher({ initialExpression }: FunctionGrapherProps) {
  const start = initialExpression?.trim() || "sin(x)";
  const [expressions, setExpressions] = useState<string[]>([start]);
  const [paramValues, setParamValues] = useState<Record<string, number>>({
    a: 1,
    b: 0,
    c: 0,
    d: 0,
  });
  const [bounds, setBounds] = useState<PlotBounds>(DEFAULT_BOUNDS);
  const [boundsDraft, setBoundsDraft] = useState<Record<string, string>>({});

  const parsed = useMemo(
    () => expressions.map((expression) => parseExpression(expression)),
    [expressions],
  );

  const usedParams = useMemo(() => {
    const set = new Set<string>();
    for (const result of parsed) {
      if (result.ok) for (const param of result.params) set.add(param);
    }
    return GRAPH_PARAMETERS.filter((param) => set.has(param));
  }, [parsed]);

  const width = 420;
  const height = 300;
  const arrowId = useId();

  const plot = useMemo(() => {
    const paths: string[][] = [];
    parsed.forEach((result, index) => {
      if (!result.ok) {
        paths[index] = [];
        return;
      }
      paths[index] = segmentsToPaths(
        plotSegments(result, paramValues, bounds),
        bounds,
        width,
        height,
      );
    });
    return paths;
  }, [parsed, paramValues, bounds]);

  const xStep = gridStep(bounds.xMax - bounds.xMin);
  const yStep = gridStep(bounds.yMax - bounds.yMin);
  const sx = (x: number) => ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * width;
  const sy = (y: number) => height - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * height;

  const ticksX: number[] = [];
  for (let v = Math.ceil(bounds.xMin / xStep) * xStep; v <= bounds.xMax + 1e-9; v += xStep) {
    ticksX.push(Math.round(v * 1e6) / 1e6);
  }
  const ticksY: number[] = [];
  for (let v = Math.ceil(bounds.yMin / yStep) * yStep; v <= bounds.yMax + 1e-9; v += yStep) {
    ticksY.push(Math.round(v * 1e6) / 1e6);
  }

  const updateExpression = (index: number, next: string) => {
    setExpressions((current) =>
      current.map((expression, i) => (i === index ? next.slice(0, MAX_EXPRESSION_LENGTH) : expression)),
    );
  };

  const commitBounds = (key: keyof PlotBounds, raw: string) => {
    const value = Number(raw);
    if (!isFiniteNumber(value)) {
      setBoundsDraft((current) => ({ ...current, [key]: formatNumber(bounds[key], 2) }));
      return;
    }
    const next = normalizeBounds({ ...bounds, [key]: value });
    setBounds(next);
    setBoundsDraft({});
  };

  const validCount = parsed.filter((result) => result.ok).length;

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* Plot */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-[460px] shrink-0 rounded-lg border bg-background"
        role="img"
        aria-label={`Function graph of ${expressions.join(", ") || "no expressions"} for x from ${formatNumber(bounds.xMin, 1)} to ${formatNumber(bounds.xMax, 1)}.`}
      >
        {/* Grid */}
        {ticksX.map((v) => (
          <line key={`gx${v}`} x1={sx(v)} y1={0} x2={sx(v)} y2={height} stroke="var(--muted)" strokeWidth={1} />
        ))}
        {ticksY.map((v) => (
          <line key={`gy${v}`} x1={0} y1={sy(v)} x2={width} y2={sy(v)} stroke="var(--muted)" strokeWidth={1} />
        ))}

        {/* Axes (clamped into view when off-screen) */}
        <line
          x1={0}
          y1={Math.min(height, Math.max(0, sy(0)))}
          x2={width}
          y2={Math.min(height, Math.max(0, sy(0)))}
          stroke="var(--muted-foreground)"
          strokeWidth={1.2}
        />
        <line
          x1={Math.min(width, Math.max(0, sx(0)))}
          y1={0}
          x2={Math.min(width, Math.max(0, sx(0)))}
          y2={height}
          stroke="var(--muted-foreground)"
          strokeWidth={1.2}
        />

        {/* Tick labels */}
        {ticksX.map((v) => (
          <text key={`tx${v}`} x={sx(v)} y={Math.min(height - 2, Math.max(10, sy(0) + 11))} textAnchor="middle" fontSize={8} fill="var(--muted-foreground)">
            {formatNumber(v, 2)}
          </text>
        ))}
        {ticksY.map((v) => (
          <text key={`ty${v}`} x={Math.min(width - 2, Math.max(18, sx(0) - 4))} y={sy(v) + 3} textAnchor="end" fontSize={8} fill="var(--muted-foreground)">
            {formatNumber(v, 2)}
          </text>
        ))}

        {/* Curves */}
        <defs>
          <clipPath id={`${arrowId}-plot`}>
            <rect x={0} y={0} width={width} height={height} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${arrowId}-plot)`}>
          {plot.map((paths, index) =>
            paths.map((d, pathIndex) => (
              <path
                key={`${index}-${pathIndex}`}
                d={d}
                fill="none"
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )),
          )}
        </g>
      </svg>

      {/* Controls */}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-2">
          {expressions.map((expression, index) => {
            const result = parsed[index];
            return (
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
                  />
                  <input
                    type="text"
                    value={expression}
                    maxLength={MAX_EXPRESSION_LENGTH}
                    onChange={(event) => updateExpression(index, event.target.value)}
                    placeholder="e.g. a*sin(x)+b"
                    aria-label={`Expression ${index + 1}`}
                    aria-invalid={result.ok ? undefined : true}
                    className="h-8 w-full min-w-0 rounded-md border bg-background px-2 font-mono text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                  {expressions.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={`Remove expression ${index + 1}`}
                      onClick={() =>
                        setExpressions((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {!result.ok ? (
                  <p className="text-[11px] text-destructive">{result.error}</p>
                ) : null}
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            {expressions.length < MAX_EXPRESSIONS ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 cursor-pointer gap-1 text-xs"
                onClick={() => setExpressions((current) => [...current, ""]) }
                disabled={expressions.length >= MAX_EXPRESSIONS}
              >
                <Plus className="size-3" aria-hidden /> Add expression
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-7 cursor-pointer gap-1 text-xs"
              onClick={() => {
                setExpressions([start]);
                setParamValues({ a: 1, b: 0, c: 0, d: 0 });
                setBounds(DEFAULT_BOUNDS);
                setBoundsDraft({});
              }}
              aria-label="Reset graph"
            >
              <RotateCcw className="size-3" aria-hidden /> Reset
            </Button>
          </div>
        </div>

        {/* Parameter sliders — only for parameters the expressions use */}
        {usedParams.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border bg-muted/40 p-2.5">
            <p className="text-[11px] font-semibold text-foreground">Parameters</p>
            {usedParams.map((param) => (
              <label key={param} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-3 font-mono font-semibold text-foreground">{param}</span>
                <input
                  type="range"
                  min={-5}
                  max={5}
                  step={0.1}
                  value={paramValues[param] ?? 0}
                  onChange={(event) =>
                    setParamValues((current) => ({
                      ...current,
                      [param]: Number(event.target.value),
                    }))
                  }
                  aria-label={`Value of parameter ${param}`}
                  className="min-w-0 flex-1 accent-primary"
                />
                <span className="w-10 text-right font-mono text-foreground">
                  {formatNumber(paramValues[param] ?? 0, 1)}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {/* Bounds */}
        <div className="space-y-1.5 rounded-lg border p-2.5">
          <p className="text-[11px] font-semibold text-foreground">Viewing window</p>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ["xMin", "x min"],
                ["xMax", "x max"],
                ["yMin", "y min"],
                ["yMax", "y max"],
              ] as Array<[keyof PlotBounds, string]>
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <input
                  type="number"
                  step={0.5}
                  value={boundsDraft[key] ?? formatNumber(bounds[key], 2)}
                  onChange={(event) =>
                    setBoundsDraft((current) => ({ ...current, [key]: event.target.value }))
                  }
                  onBlur={(event) => commitBounds(key, event.target.value)}
                  aria-label={label}
                  className="h-8 w-full min-w-0 rounded-md border bg-background px-1.5 text-center text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
              </label>
            ))}
          </div>
          {validCount === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Fix an expression above to see its curve.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
