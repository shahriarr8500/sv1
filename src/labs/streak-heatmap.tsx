/**
 * Lab — Study streak heatmap.
 *
 * This file is the template to copy when you start a new experiment. It is
 * deliberately self-contained: mock data lives at the top so the component can
 * be judged on its looks alone, with nothing real wired in yet.
 *
 * To start your own:
 *   1. copy this file and rename it
 *   2. replace the mock block with `useStudentOS()` / `useStudyLog()`
 *   3. add a row to `LABS_INDEX` in `Labs.tsx`
 */

import { cn } from "@/lib/utils";
import { addDays, format, isAfter, startOfWeek, subWeeks } from "date-fns";
import { useMemo } from "react";

/* ------------------------------------------------------------------ *
 * Mock data — replace with `useStudyLog()` once the look is settled.  *
 * ------------------------------------------------------------------ */

const GRID_WEEKS = 18;

/**
 * Deterministic study minutes for a day. Seeded from the date itself rather
 * than `Math.random()` so the grid doesn't reshuffle on every render.
 */
function fakeMinutes(date: Date): number {
  if (isAfter(date, new Date())) return 0;
  const seed =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const wave = (Math.sin(seed * 1.7) + 1) / 2;
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const likelihood = weekend ? wave * 0.45 : wave;
  if (likelihood < 0.3) return 0; // rest day
  return Math.round(15 + likelihood * 105); // 15–120 min
}

/* ------------------------------------------------------------------ *
 * Presentation                                                       *
 * ------------------------------------------------------------------ */

const LEVEL_CLASS = [
  "bg-muted",
  "bg-primary/30",
  "bg-primary/60",
  "bg-primary",
] as const;

function level(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  return 3;
}

/** Consecutive days with study, counting back from today. */
function currentStreak(minutesByDay: Map<string, number>): number {
  const now = new Date();
  let streak = 0;
  // A streak isn't broken until a full day passes with nothing logged, so
  // start from yesterday when today is still empty.
  let cursor = minutesByDay.get(format(now, "yyyy-MM-dd"))
    ? now
    : addDays(now, -1);
  while ((minutesByDay.get(format(cursor, "yyyy-MM-dd")) ?? 0) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export default function StreakHeatmap() {
  const { rows, minutesByDay, stats } = useMemo(() => {
    const today = new Date();
    const firstMonday = subWeeks(
      startOfWeek(today, { weekStartsOn: 1 }),
      GRID_WEEKS - 1,
    );

    const cells: Date[] = [];
    for (let index = 0; index < GRID_WEEKS * 7; index++) {
      cells.push(addDays(firstMonday, index));
    }

    const minutesByDay = new Map<string, number>(
      cells.map((date) => [format(date, "yyyy-MM-dd"), fakeMinutes(date)]),
    );

    // startOfWeek is always a Monday, so index % 7 lines up by weekday.
    const rows = Array.from({ length: 7 }, (_, weekday) =>
      cells.filter((_, index) => index % 7 === weekday),
    );

    const tracked = cells.filter((date) => !isAfter(date, today));
    const active = tracked.filter(
      (date) => (minutesByDay.get(format(date, "yyyy-MM-dd")) ?? 0) > 0,
    );
    const totalMinutes = tracked.reduce(
      (sum, date) => sum + (minutesByDay.get(format(date, "yyyy-MM-dd")) ?? 0),
      0,
    );

    return {
      rows,
      minutesByDay,
      stats: {
        streak: currentStreak(minutesByDay),
        activeDays: active.length,
        hours: Math.round(totalMinutes / 60),
      },
    };
  }, []);

  const weekdayLabels = ["Mon", "", "Wed", "", "Fri", "", ""];

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Study streak
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Last {GRID_WEEKS} weeks of logged study time
          </p>
        </div>
        <div className="flex gap-5 text-right">
          <div>
            <p className="text-xl font-bold tracking-tight tabular-nums">
              {stats.streak}
            </p>
            <p className="text-[11px] text-muted-foreground">day streak</p>
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight tabular-nums">
              {stats.activeDays}
            </p>
            <p className="text-[11px] text-muted-foreground">active days</p>
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight tabular-nums">
              {stats.hours}h
            </p>
            <p className="text-[11px] text-muted-foreground">this window</p>
          </div>
        </div>
      </div>

      <div className="mt-5 inline-flex gap-1.5">
        <div className="flex flex-col gap-1">
          {weekdayLabels.map((label, index) => (
            <span
              key={index}
              className="flex h-3.5 w-7 items-center text-[10px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1">
              {row.map((date) => {
                const key = format(date, "yyyy-MM-dd");
                const minutes = minutesByDay.get(key) ?? 0;
                const future = isAfter(date, new Date());
                const today = key === format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={key}
                    className={cn(
                      "size-3.5 rounded-[3px] transition-colors",
                      future
                        ? "border border-border/60 bg-transparent"
                        : LEVEL_CLASS[level(minutes)],
                      today &&
                        "ring-2 ring-ring ring-offset-1 ring-offset-background",
                    )}
                    title={
                      future
                        ? `${format(date, "EEE d MMM yyyy")} · upcoming`
                        : `${format(date, "EEE d MMM yyyy")} · ${minutes} min`
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Less</span>
        {LEVEL_CLASS.map((className, index) => (
          <span
            key={index}
            className={cn("size-3.5 rounded-[3px]", className)}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}
