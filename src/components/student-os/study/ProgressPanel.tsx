import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  dailySeries,
  formatDuration,
  groupByDay,
  groupByMonth,
  monthlySeries,
  monthsOfYear,
  totalSeconds,
  yearKey,
  yearsWithStudyTime,
  type SeriesPoint,
} from "@/lib/student-os/study-log";
import { cn } from "@/lib/utils";
import { useStudyLog } from "@/state/study-log";
import { format } from "date-fns";
import { useMemo, useState } from "react";

function BarChart({
  data,
  ariaLabel,
  emptyLabel,
}: {
  data: SeriesPoint[];
  ariaLabel: string;
  emptyLabel: string;
}) {
  const hasData = data.some((point) => point.seconds > 0);
  if (!hasData) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  const max = Math.max(...data.map((point) => point.seconds), 1);

  return (
    <div className="flex h-44 gap-1.5" role="img" aria-label={ariaLabel}>
      {data.map((point, index) => (
        <div
          key={`${point.sub}-${index}`}
          className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
        >
          <div className="flex h-full w-full items-end justify-center">
            <div
              className={cn(
                "w-full rounded-t transition-[height] duration-300",
                point.seconds > 0
                  ? point.current
                    ? "bg-primary"
                    : "bg-primary/50"
                  : "bg-muted",
              )}
              style={{
                height:
                  point.seconds > 0
                    ? `${Math.max(6, (point.seconds / max) * 100)}%`
                    : "4%",
              }}
              title={`${point.sub} · ${formatDuration(point.seconds)}`}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">
            {point.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/** Progress — real study hours aggregated daily, monthly, and yearly. */
export function ProgressPanel() {
  const { log } = useStudyLog();
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const study = useMemo(
    () => log.sessions.filter((session) => session.mode === "study"),
    [log.sessions],
  );
  const rest = useMemo(
    () => log.sessions.filter((session) => session.mode === "rest"),
    [log.sessions],
  );

  const now = new Date();
  const todayKey = format(now, "yyyy-MM-dd");
  const currentMonthKey = format(now, "yyyy-MM");
  const currentYearKey = yearKey(now.getTime());

  const dayTotals = useMemo(() => groupByDay(study), [study]);
  const monthTotals = useMemo(() => groupByMonth(study), [study]);
  const restMonthTotals = useMemo(() => groupByMonth(rest), [rest]);

  const todaySessions = study.filter(
    (session) => format(session.startedAt, "yyyy-MM-dd") === todayKey,
  );
  const todaySeconds = totalSeconds(todaySessions);
  const monthSeconds = monthTotals.get(currentMonthKey) ?? 0;
  const yearSeconds = totalSeconds(
    study.filter((session) => yearKey(session.startedAt) === currentYearKey),
  );
  const allSeconds = totalSeconds(study);
  const restThisMonth = restMonthTotals.get(currentMonthKey) ?? 0;

  const daily = useMemo(() => dailySeries(dayTotals, 14), [dayTotals]);
  const monthly = useMemo(() => monthlySeries(monthTotals, 12), [monthTotals]);

  const years = useMemo(() => yearsWithStudyTime(study), [study]);
  const activeYear = selectedYear ?? years[0] ?? currentYearKey;
  // Cheap enough to compute directly — 12 map lookups per render.
  const yearMonths = monthsOfYear(monthTotals, activeYear);

  const dailyAverage = Math.round(
    daily.reduce((sum, point) => sum + point.seconds, 0) / 14,
  );
  const yearSecondsForActiveYear = yearMonths.reduce(
    (sum, point) => sum + point.seconds,
    0,
  );

  const stats = [
    {
      label: "Today",
      value: formatDuration(todaySeconds),
      sub: `${todaySessions.length} session${todaySessions.length === 1 ? "" : "s"}`,
    },
    {
      label: "This month",
      value: formatDuration(monthSeconds),
      sub: format(now, "MMMM yyyy"),
    },
    {
      label: "This year",
      value: formatDuration(yearSeconds),
      sub: currentYearKey,
    },
    {
      label: "All time",
      value: formatDuration(allSeconds),
      sub: `${study.length} session${study.length === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="space-y-6">
      {study.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm font-semibold tracking-tight">
            No study hours recorded yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start the timer and every session you record will build your daily,
            monthly, and yearly progress automatically.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex w-full flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Daily study hours</CardTitle>
            <p className="text-xs text-muted-foreground tabular-nums">
              Last 14 days · avg {formatDuration(dailyAverage)} per day
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <BarChart
            data={daily}
            ariaLabel="Study hours per day for the last 14 days"
            emptyLabel="No sessions in the last 14 days."
          />
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex w-full flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Monthly study hours</CardTitle>
            <p className="text-xs text-muted-foreground">
              Break time this month: {formatDuration(restThisMonth)}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <BarChart
            data={monthly}
            ariaLabel="Study hours per month for the last 12 months"
            emptyLabel="No sessions in the last 12 months."
          />
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex w-full flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Yearly progress</CardTitle>
            <p className="text-xs text-muted-foreground tabular-nums">
              {activeYear}: {formatDuration(yearSecondsForActiveYear)}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {years.length > 1 ? (
            <div
              role="group"
              aria-label="Choose a year"
              className="flex flex-wrap gap-2"
            >
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  aria-pressed={activeYear === year}
                  onClick={() => setSelectedYear(year)}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    activeYear === year
                      ? "border-primary/60 bg-primary/10 font-medium text-primary"
                      : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : null}

          <BarChart
            data={yearMonths}
            ariaLabel={`Study hours per month in ${activeYear}`}
            emptyLabel={`No sessions recorded in ${activeYear}.`}
          />

          {years.length > 1 ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                By year
              </p>
              {years.map((year) => {
                const seconds = totalSeconds(
                  study.filter((session) => yearKey(session.startedAt) === year),
                );
                return (
                  <div
                    key={year}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{year}</span>
                    <span className="font-medium tabular-nums">
                      {formatDuration(seconds)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
