/**
 * Today's Plan — the dashboard's day view.
 *
 * One card, one date: step backwards and forwards through days (or jump
 * straight to one), read the Daily Success Rate for that date — academic
 * missions and personal tasks summed into a single honest number — and work
 * both lists for the same day without leaving the dashboard.
 *
 * The rate is `completed ÷ planned × 100` across *both* systems, counts every
 * task once for its date, ignores anything deleted, and says "No tasks
 * planned" instead of claiming 100% on an empty day. A past day reads as
 * final; today reads as live; a future day is still just a plan.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TodayMissions } from "@/components/student-os/TodayMissions";
import { MyDailyTasks } from "@/components/student-os/MyDailyTasks";
import {
  addDaysKey,
  combineCounts,
  counts,
  dayStatus,
  formatDateKey,
  successRate,
  todayKey,
} from "@/lib/student-os/daily-tasks";
import { useDailyTaskRange, useDailyTasks } from "@/state/daily-tasks";
import { useTargets } from "@/state/targets";

/** Days of surrounding context kept in sync around the focused date. */
const RANGE_PAD = 14;

function weekdayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

const STATUS_LABEL: Record<"past" | "today" | "future", string> = {
  past: "Final",
  today: "Live today",
  future: "Planned",
};

export function TodayPlan() {
  const [focus, setFocus] = useState(() => todayKey());
  const { forDate, loading } = useDailyTasks();
  const { plannedFor } = useTargets();

  useDailyTaskRange(addDaysKey(focus, -RANGE_PAD), addDaysKey(focus, RANGE_PAD));

  const isToday = focus === todayKey();
  const personal = forDate(focus);
  const academic = plannedFor(focus);

  const academicCounts = counts(
    academic.length,
    academic.filter((target) => target.completed).length,
  );
  const personalCounts = counts(
    personal.length,
    personal.filter((task) => task.completed).length,
  );
  const combined = combineCounts(academicCounts, personalCounts);
  const rate = successRate(combined);
  const status = dayStatus(focus);

  const goTo = (dateKey: string) => {
    if (dateKey) setFocus(dateKey);
  };

  return (
    <Card className="gap-4">
      <CardHeader className="gap-4">
        {/* Date navigation — yesterday, tomorrow, or straight to a date. */}
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Previous day"
                title="Previous day"
                onClick={() => setFocus(addDaysKey(focus, -1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Next day"
                title="Next day"
                onClick={() => setFocus(addDaysKey(focus, 1))}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="size-4 text-primary" aria-hidden />
                {isToday ? "Today's Plan" : "Plan"}
              </CardTitle>
              <p className="truncate text-sm text-muted-foreground">
                {weekdayLabel(focus)} · {formatDateKey(focus)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isToday ? (
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={() => setFocus(todayKey())}
              >
                Today
              </Button>
            ) : null}
            <Input
              type="date"
              value={focus}
              aria-label="Jump to date"
              className="h-8 w-[9.5rem] text-xs"
              onChange={(event) => goTo(event.target.value)}
            />
          </div>
        </div>

        {/* Daily Success Rate — both systems, one honest number. */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Daily Success Rate
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {combined.planned === 0 ? (
                  loading ? (
                    "Loading your day…"
                  ) : (
                    "No tasks planned"
                  )
                ) : (
                  <>
                    <span className="font-semibold text-foreground tabular-nums">
                      {combined.completed} of {combined.planned}
                    </span>{" "}
                    completed
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <p className="text-3xl leading-none font-semibold tabular-nums">
                {rate === null ? "—" : `${rate}%`}
              </p>
              <Badge variant="outline" className="text-[11px] font-medium">
                {STATUS_LABEL[status]}
              </Badge>
            </div>
          </div>

          <Progress
            value={rate ?? 0}
            className="mt-3"
            aria-label="Daily success rate"
          />

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>
              Academic{" "}
              <span className="font-medium text-foreground">
                {academicCounts.completed}/{academicCounts.planned}
              </span>
            </span>
            <span>
              Personal{" "}
              <span className="font-medium text-foreground">
                {personalCounts.completed}/{personalCounts.planned}
              </span>
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        <TodayMissions dateKey={focus} variant="section" />
        <div className="border-t pt-4">
          <MyDailyTasks dateKey={focus} variant="section" />
        </div>
      </CardContent>
    </Card>
  );
}
