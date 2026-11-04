/**
 * My Consistency — the Daily Success Rate, over time.
 *
 * Three views of the same number (completed ÷ planned across academic missions
 * *and* personal tasks): today's live summary, a seven-day chart with the
 * best day and the average, and a month grid where every day carries its own
 * rate and counts. Any day can be opened to see what was actually planned,
 * what got done and what didn't — past days read as final, today reads as
 * live, future days are still only a plan.
 *
 * Days with nothing planned show "—", never 100%: an empty day is not a
 * perfect day.
 */

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addDaysKey,
  combineCounts,
  counts,
  dayStatus,
  formatDateKey,
  monthGridKeys,
  successRate,
  summarizeDay,
  summarizeRange,
  todayKey,
  weekStartKeyFor,
  type DayCounts,
} from "@/lib/student-os/daily-tasks";
import { cn } from "@/lib/utils";
import { useDailyTaskRange, useDailyTasks } from "@/state/daily-tasks";
import { useTargets } from "@/state/targets";

type TabId = "today" | "week" | "month";

const WEEKDAY_LETTERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_LABEL: Record<"past" | "today" | "future", string> = {
  past: "Final",
  today: "Live today",
  future: "Planned",
};

function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function dayNumber(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}

function weekdayLetter(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "short",
  });
}

/** Background strength for a day's rate — readable, never garish. */
function rateSurface(rate: number | null, planned: number): string {
  if (planned === 0) return "bg-muted/30 text-muted-foreground";
  if (rate === 100) return "border-primary/50 bg-primary/20 text-foreground";
  if (rate !== null && rate >= 60) return "border-primary/25 bg-primary/10";
  if (rate !== null && rate > 0) return "border-border bg-muted/70";
  return "border-destructive/30 bg-destructive/10";
}

export function MyConsistency() {
  const [tab, setTab] = useState<TabId>("week");
  const [weekAnchor, setWeekAnchor] = useState(() => todayKey());
  const [monthAnchor, setMonthAnchor] = useState(() => monthKeyOf(todayKey()));
  const [selected, setSelected] = useState<string | null>(null);

  const { tasks, loading } = useDailyTasks();
  const { targets } = useTargets();

  const today = todayKey();

  const personalByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const bucket = map.get(task.date);
      if (bucket) bucket.push(task);
      else map.set(task.date, [task]);
    }
    return map;
  }, [tasks]);

  const academicByDate = useMemo(() => {
    const map = new Map<string, typeof targets>();
    for (const target of targets) {
      if (target.period !== "daily" || !target.targetDate) continue;
      const bucket = map.get(target.targetDate);
      if (bucket) bucket.push(target);
      else map.set(target.targetDate, [target]);
    }
    return map;
  }, [targets]);

  const countsFor = useMemo(() => {
    return (dateKey: string): DayCounts => {
      const academic = academicByDate.get(dateKey) ?? [];
      const personal = personalByDate.get(dateKey) ?? [];
      return combineCounts(
        counts(
          academic.length,
          academic.filter((target) => target.completed).length,
        ),
        counts(
          personal.length,
          personal.filter((task) => task.completed).length,
        ),
      );
    };
  }, [academicByDate, personalByDate]);

  const weekStart = weekStartKeyFor(weekAnchor);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysKey(weekStart, index)),
    [weekStart],
  );
  const monthGrid = useMemo(() => monthGridKeys(monthAnchor), [monthAnchor]);

  // Keep whatever the visible tab shows inside a synced window.
  const visibleFrom =
    tab === "week" ? weekStart : tab === "month" ? monthGrid[0] ?? today : today;
  const visibleTo =
    tab === "week"
      ? addDaysKey(weekStart, 6)
      : tab === "month"
        ? monthGrid[monthGrid.length - 1] ?? today
        : today;
  useDailyTaskRange(visibleFrom, visibleTo);

  const weekSummaries = useMemo(
    () => weekDays.map((date) => summarizeDay(date, countsFor(date))),
    [weekDays, countsFor],
  );
  const weekRange = useMemo(
    () => summarizeRange(weekSummaries),
    [weekSummaries],
  );

  const todayCounts = countsFor(today);
  const todaySummary = summarizeDay(today, todayCounts);
  const todayAcademic = academicByDate.get(today) ?? [];
  const todayPersonal = personalByDate.get(today) ?? [];

  const openDay = (dateKey: string) =>
    setSelected((previous) => (previous === dateKey ? null : dateKey));

  return (
    <Card className="gap-4">
      <CardHeader className="gap-3">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarRange className="size-4 text-primary" aria-hidden />
            My Consistency
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Academic + personal, every day
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as TabId)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today" className="cursor-pointer">
              Today
            </TabsTrigger>
            <TabsTrigger value="week" className="cursor-pointer">
              Week
            </TabsTrigger>
            <TabsTrigger value="month" className="cursor-pointer">
              Month
            </TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* Today                                                            */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="today" className="mt-4 space-y-4">
            {loading && todayCounts.planned === 0 ? (
              <p className="text-sm text-muted-foreground">Loading your day…</p>
            ) : todayCounts.planned === 0 ? (
              <EmptyDay message="No tasks planned for today yet." />
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-4xl leading-none font-semibold tabular-nums">
                      {todaySummary.rate}%
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {todaySummary.completed}
                      </span>{" "}
                      completed ·{" "}
                      <span className="font-medium text-foreground">
                        {todaySummary.planned - todaySummary.completed}
                      </span>{" "}
                      remaining of{" "}
                      <span className="font-medium text-foreground">
                        {todaySummary.planned}
                      </span>{" "}
                      planned
                    </p>
                  </div>
                  <Badge variant="outline">{STATUS_LABEL[dayStatus(today)]}</Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SplitCard
                    label="Academic missions"
                    planned={todayAcademic.length}
                    completed={todayAcademic.filter((item) => item.completed).length}
                  />
                  <SplitCard
                    label="My daily tasks"
                    planned={todayPersonal.length}
                    completed={todayPersonal.filter((item) => item.completed).length}
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Week                                                             */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="week" className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={() => setWeekAnchor(addDaysKey(weekStart, -7))}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </Button>
              <p className="text-sm font-medium">
                {formatDateKey(weekStart)} – {formatDateKey(addDaysKey(weekStart, 6))}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={() => setWeekAnchor(addDaysKey(weekStart, 7))}
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>

            {/* Seven-day chart: height = that day's success rate. */}
            <div className="flex h-36 items-end gap-1.5">
              {weekSummaries.map((summary) => {
                const empty = summary.planned === 0;
                const rate = summary.rate ?? 0;
                const isFuture = summary.date > today;
                return (
                  <button
                    key={summary.date}
                    type="button"
                    title={`${formatDateKey(summary.date)} — ${
                      empty ? "no tasks planned" : `${summary.completed}/${summary.planned} · ${rate}%`
                    }`}
                    aria-label={`Open ${formatDateKey(summary.date)}`}
                    className="group flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-1"
                    onClick={() => openDay(summary.date)}
                  >
                    <span
                      className={cn(
                        "text-[10px] tabular-nums",
                        empty ? "text-muted-foreground/60" : "font-medium text-foreground",
                      )}
                    >
                      {empty ? "—" : `${rate}%`}
                    </span>
                    <div
                      className={cn(
                        "w-full rounded-t-md transition-colors",
                        empty
                          ? "h-1.5 border border-dashed border-border"
                          : summary.rate === 100
                            ? "bg-primary group-hover:bg-primary/80"
                            : "bg-primary/60 group-hover:bg-primary/75",
                        isFuture && !empty && "opacity-50",
                      )}
                      style={empty ? undefined : { height: `${Math.max(8, rate)}%` }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="flex gap-1.5">
              {weekDays.map((date) => {
                const summary = summarizeDay(date, countsFor(date));
                return (
                  <div
                    key={date}
                    className="flex flex-1 flex-col items-center gap-0.5 text-center"
                  >
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        date === today ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {WEEKDAY_LETTERS[
                        (new Date(
                          Number(date.slice(0, 4)),
                          Number(date.slice(5, 7)) - 1,
                          Number(date.slice(8, 10)),
                        ).getDay() +
                          6) %
                          7
                      ] ?? weekdayLetter(date)}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {summary.planned > 0
                        ? `${summary.completed}/${summary.planned}`
                        : "–"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Average rate" value={weekRange.averageRate === null ? "—" : `${weekRange.averageRate}%`} />
              <Stat
                label="Best day"
                value={
                  weekRange.bestDay
                    ? `${weekRange.bestDay.rate}%`
                    : "—"
                }
                hint={
                  weekRange.bestDay
                    ? formatDateKey(weekRange.bestDay.date)
                    : "No tasks yet"
                }
              />
              <Stat label="Completed" value={String(weekRange.completed)} hint={`of ${weekRange.planned} planned`} />
              <Stat
                label="Perfect days"
                value={String(weekRange.perfectDays)}
                hint={`${weekRange.daysWithTasks} day${weekRange.daysWithTasks === 1 ? "" : "s"} with tasks`}
              />
            </div>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Month                                                            */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="month" className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  setMonthAnchor((previous) => shiftMonth(previous, -1));
                  setSelected(null);
                }}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <p className="text-sm font-medium">{monthLabel(monthAnchor)}</p>
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  setMonthAnchor((previous) => shiftMonth(previous, 1));
                  setSelected(null);
                }}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {WEEKDAY_LETTERS.map((letter) => (
                <span key={letter}>{letter}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {monthGrid.map((date) => {
                const summary = summarizeDay(date, countsFor(date));
                const inMonth = monthKeyOf(date) === monthAnchor;
                const isToday = date === today;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-label={`Open ${formatDateKey(date)}`}
                    aria-pressed={selected === date}
                    className={cn(
                      "flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border text-xs transition-all",
                      rateSurface(summary.rate, summary.planned),
                      !inMonth && "opacity-40",
                      isToday && "ring-1 ring-primary",
                      selected === date && "ring-2 ring-primary",
                      "hover:border-primary/50",
                    )}
                    onClick={() => openDay(date)}
                  >
                    <span className="font-medium tabular-nums">{dayNumber(date)}</span>
                    <span className="text-[10px] tabular-nums opacity-80">
                      {summary.planned > 0 ? `${summary.rate}%` : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary/20 ring-1 ring-primary/50" />
                All done
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary/10" />
                In progress
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-destructive/10 ring-1 ring-destructive/30" />
                Nothing finished
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-muted/40" />
                No tasks planned
              </span>
            </div>
          </TabsContent>
        </Tabs>
      </CardHeader>

      {/* Day detail — what was planned, done and left on any chosen date. */}
      {selected ? (
        <CardContent className="pt-0">
          <DayDetail
            dateKey={selected}
            counts={countsFor(selected)}
            academic={academicByDate.get(selected) ?? []}
            personal={personalByDate.get(selected) ?? []}
            onClose={() => setSelected(null)}
          />
        </CardContent>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SplitCard({
  label,
  planned,
  completed,
}: {
  label: string;
  planned: number;
  completed: number;
}) {
  const rate = successRate(counts(planned, completed));
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        <span className="text-sm font-semibold tabular-nums">
          {rate === null ? "—" : `${rate}%`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${rate ?? 0}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
        {completed} of {planned} completed
      </p>
    </div>
  );
}

function EmptyDay({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-8 text-center">
      <p className="flex items-center justify-center gap-2 text-sm font-semibold">
        <Target className="size-4 text-primary" aria-hidden />
        Nothing planned
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function DayDetail({
  dateKey,
  counts: dayCounts,
  academic,
  personal,
  onClose,
}: {
  dateKey: string;
  counts: DayCounts;
  academic: Array<{ completed: boolean }>;
  personal: Array<{ completed: boolean }>;
  onClose: () => void;
}) {
  const summary = summarizeDay(dateKey, dayCounts);
  const status = dayStatus(dateKey);

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{formatDateKey(dateKey)}</p>
          <p className="text-xs text-muted-foreground">
            {status === "past"
              ? "Final — this day is in the record"
              : status === "today"
                ? "Live — still in progress"
                : "Planned ahead"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Close day detail"
            onClick={onClose}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Planned" value={String(summary.planned)} />
        <Stat label="Completed" value={String(summary.completed)} />
        <Stat
          label="Incomplete"
          value={String(summary.planned - summary.completed)}
        />
        <Stat
          label="Success rate"
          value={summary.rate === null ? "—" : `${summary.rate}%`}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SplitCard
          label="Academic missions"
          planned={academic.length}
          completed={academic.filter((item) => item.completed).length}
        />
        <SplitCard
          label="My daily tasks"
          planned={personal.length}
          completed={personal.filter((item) => item.completed).length}
        />
      </div>
    </div>
  );
}
