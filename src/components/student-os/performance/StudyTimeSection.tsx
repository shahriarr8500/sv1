/**
 * Study Time — "how long did I study?"
 *
 * Weekly total, week-over-week comparison (only when last week has real
 * data), and a bar chart of daily hours. A day with no sessions reads 0h,
 * because that is the truth; the comparison renders "—" rather than
 * inventing a delta.
 */

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Clock } from "lucide-react";
import {
  dayPerformance,
  formatStudyTime,
  lastDays,
  mondayKey,
  shiftKey,
  studySecondsBetween,
  weekOverWeekSeconds,
  localDayKey,
} from "@/lib/student-os/performance";
import { useStudyLog } from "@/state/study-log";
import { useTargets } from "@/state/targets";

export function StudyTimeSection() {
  const { log } = useStudyLog();
  const { targets } = useTargets();

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
        hours: Number((row.studySeconds / 3600).toFixed(2)),
        display: formatStudyTime(row.studySeconds),
      })),
    [rows],
  );

  const now = new Date();
  const thisMonday = mondayKey(now);
  const weekSeconds = useMemo(
    () => studySecondsBetween(log.sessions, thisMonday, localDayKey(now)),
    [log.sessions, thisMonday],
  );
  const delta = useMemo(() => weekOverWeekSeconds(log.sessions, now), [log.sessions]);
  const lastWeekSeconds = useMemo(
    () => studySecondsBetween(log.sessions, shiftKey(thisMonday, -7), shiftKey(thisMonday, -1)),
    [log.sessions, thisMonday],
  );

  const hasAnyData = chartData.some((point) => point.hours > 0);

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex w-full flex-wrap items-between justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" aria-hidden />
              Study time
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              How long did I study?
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              This week
            </p>
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              {formatStudyTime(weekSeconds)}
            </p>
            {delta === null ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {lastWeekSeconds > 0 ? "—" : "No data last week"}
              </p>
            ) : (
              <p
                className={
                  delta >= 0
                    ? "inline-flex items-center gap-1 text-xs font-medium text-emerald-600 tabular-nums dark:text-emerald-400"
                    : "inline-flex items-center gap-1 text-xs font-medium text-destructive tabular-nums"
                }
              >
                {delta >= 0 ? (
                  <ArrowUpRight className="size-3.5" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden />
                )}
                {formatStudyTime(Math.abs(delta))} vs last week
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {!hasAnyData ? (
          <div className="rounded-lg border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-semibold tracking-tight">
              No study data yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Complete your first study session to start tracking your progress.
            </p>
          </div>
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
                barCategoryGap="28%"
              >
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value: number) => `${value}h`}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number, _name, item) => [
                    (item?.payload as { display?: string })?.display ?? `${value}h`,
                    "Studied",
                  ]}
                />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {chartData.map((point) => (
                    <Cell
                      key={point.key}
                      fill={point.hours > 0 ? "var(--primary)" : "var(--muted)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
