/**
 * Performance card — the compact dashboard summary. Deliberately small: the
 * full charts live on the Performance page.
 *
 * Both metrics stay separate: study time (how long) and target success (how
 * consistently). The vs-yesterday figure is percentage *points* and only
 * appears when both days actually had planned targets.
 */

import { Link } from "react-router";
import { ChevronRight, Clock, Flame, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatStudyTime, growthPoints, localDayKey, shiftKey, successBetween, formatPoints } from "@/lib/student-os/performance";
import { useStudyLog } from "@/state/study-log";
import { useTargets } from "@/state/targets";
import { useGamification } from "@/state/gamification";

function secondsFor(key: string, sessions: readonly { mode: string; startedAt: number; durationSeconds: number }[]): number {
  let total = 0;
  for (const session of sessions) {
    if (session.mode !== "study") continue;
    const d = new Date(session.startedAt);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (day === key) total += session.durationSeconds;
  }
  return total;
}

export function PerformanceCard() {
  const { log } = useStudyLog();
  const { targets } = useTargets();
  const { streak } = useGamification();

  const now = new Date();
  const todayKey = localDayKey(now);
  const yesterdayKey = shiftKey(todayKey, -1);

  const studiedToday = secondsFor(todayKey, log.sessions);
  const today = successBetween(targets, todayKey, todayKey);
  const yesterday = successBetween(targets, yesterdayKey, yesterdayKey);
  const points = growthPoints(today.rate, yesterday.rate);
  const pointsLabel = formatPoints(points);

  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <div className="flex w-full items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            <Target className="size-4 text-primary" aria-hidden />
            Performance
          </CardTitle>
          <Link
            to="/performance"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-primary transition-opacity hover:opacity-80"
          >
            Details
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4" aria-hidden />
            Studied today
          </span>
          <span className="font-semibold tabular-nums">
            {formatStudyTime(studiedToday)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Missions</span>
          <span className="font-semibold tabular-nums">
            {today.planned === 0 ? (
              "—"
            ) : (
              <>
                {today.completed} / {today.planned}
                <span className="ml-2 text-muted-foreground">
                  {today.rate}%
                </span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Flame
              className={streak > 0 ? "size-4 text-orange-500" : "size-4"}
              aria-hidden
            />
            Streak
          </span>
          <span className="font-semibold tabular-nums">
            {streak} day{streak === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-muted-foreground">vs yesterday</span>
          {pointsLabel === null ? (
            <span className="text-muted-foreground tabular-nums">—</span>
          ) : (
            <span
              className={
                points !== null && points >= 0
                  ? "font-semibold text-emerald-600 tabular-nums dark:text-emerald-400"
                  : "font-semibold text-destructive tabular-nums"
              }
            >
              {pointsLabel}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
