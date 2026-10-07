/**
 * Target Success — "how consistently did I complete what I planned?"
 *
 * Weekly rate is total completed / total planned × 100, never an average of
 * daily percentages. Days with zero planned targets render "—": on the chart
 * they are `null`, which produces a real gap rather than a fake 0%.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";
import {
  dayPerformance,
  formatPoints,
  growthPoints,
  lastDays,
  previousWeekSuccess,
  weekSuccess,
} from "@/lib/student-os/performance";
import { useTargets } from "@/state/targets";
import { useStudyLog } from "@/state/study-log";

export function TargetSuccessSection() {
  const { targets } = useTargets();
  const { log } = useStudyLog();

  const days = useMemo(() => lastDays(7), []);
  const rows = useMemo(
    () => dayPerformance(targets, log.sessions, days),
    [targets, log.sessions, days],
  );

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        label: row.label,
        key: row.key,
        // null (not 0) for unplanned days → the line breaks there.
        rate: row.rate,
        planned: row.planned,
        completed: row.completed,
      })),
    [rows],
  );

  // Fixed for this mount so the week memos below stay stable.
  const now = useMemo(() => new Date(), []);
  const week = useMemo(() => weekSuccess(targets, now), [targets, now]);
  const previous = useMemo(
    () => previousWeekSuccess(targets, now),
    [targets, now],
  );
  const points = growthPoints(week.rate, previous.rate);
  const pointsLabel = formatPoints(points);

  const hasPlannedData = rows.some((row) => row.planned > 0);

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex w-full flex-wrap items-between justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" aria-hidden />
              Target success
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              How consistently did I complete what I planned?
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              This week
            </p>
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              {week.rate === null ? "—" : `${week.rate}%`}
            </p>
            {pointsLabel === null ? (
              <p className="text-xs text-muted-foreground tabular-nums">—</p>
            ) : (
              <p
                className={
                  points !== null && points >= 0
                    ? "text-xs font-medium text-emerald-600 tabular-nums dark:text-emerald-400"
                    : "text-xs font-medium text-destructive tabular-nums"
                }
              >
                {pointsLabel} vs last week
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {!hasPlannedData ? (
          <div className="rounded-lg border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-semibold tracking-tight">
              No missions planned yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Plan your first mission and your success rate will start tracking
              automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(value: number) => `${value}%`}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    formatter={(value: unknown, _name, item) => {
                      const payload = item?.payload as {
                        rate?: number | null;
                        planned?: number;
                        completed?: number;
                      };
                      if (payload?.rate === null || payload?.rate === undefined) {
                        return ["—", "Success"];
                      }
                      return [
                        `${payload.rate}% (${payload.completed} / ${payload.planned})`,
                        "Success",
                      ];
                    }}
                  />
                  {/* connectNulls is left false: unplanned days break the line. */}
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2 border-t pt-4">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Daily history
              </p>
              <ul className="space-y-1.5">
                {rows.map((row) => (
                  <li key={row.key} className="flex items-center gap-3 text-sm">
                    <span className="w-9 shrink-0 text-muted-foreground">
                      {row.label}
                    </span>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      {row.rate === null ? (
                        <div className="h-full w-0" />
                      ) : (
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-500"
                          style={{ width: `${row.rate}%` }}
                        />
                      )}
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">
                      {row.rate === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${row.rate}%`
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
