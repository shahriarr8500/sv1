/**
 * Weekly summary + achievements.
 *
 * The weekly XP figure is recomputed from the records themselves — missions
 * finished this week plus this week's recorded sessions — so it can never
 * drift from what actually happened.
 */

import { useMemo } from "react";
import { Lock, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatStudyTime,
  localDayKey,
  mondayKey,
  shiftKey,
  studySecondsBetween,
  weekSuccess,
} from "@/lib/student-os/performance";
import { perfectDayKeys, xpForStudySession } from "@/lib/student-os/gamification";
import { useTargets } from "@/state/targets";
import { useStudyLog } from "@/state/study-log";
import { useGamification } from "@/state/gamification";

export function WeeklySummary() {
  const { targets } = useTargets();
  const { log } = useStudyLog();
  const { streak, xp, achievements } = useGamification();

  const now = new Date();
  const thisMonday = mondayKey(now);
  const todayKey = localDayKey(now);

  const week = useMemo(() => weekSuccess(targets, now), [targets, now]);
  const weekSeconds = useMemo(
    () => studySecondsBetween(log.sessions, thisMonday, todayKey),
    [log.sessions, thisMonday, todayKey],
  );

  const weekXp = useMemo(() => {
    const weekStart = thisMonday;
    const weekEnd = todayKey;
    const missionXp = targets
      .filter(
        (t) =>
          t.completed &&
          t.targetDate !== undefined &&
          t.targetDate >= weekStart &&
          t.targetDate <= weekEnd,
      )
      .reduce((sum, t) => sum + (t.xp > 0 ? t.xp : 25), 0);
    const sessionXp = log.sessions
      .filter((s) => {
        if (s.mode !== "study") return false;
        const d = new Date(s.startedAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return key >= weekStart && key <= weekEnd;
      })
      .reduce((sum, s) => sum + xpForStudySession(s.durationSeconds), 0);
    return missionXp + sessionXp;
  }, [targets, log.sessions, thisMonday, todayKey]);

  const perfectDays = useMemo(() => perfectDayKeys(targets).size, [targets]);

  const stats = [
    { label: "Missions", value: `${week.completed} / ${week.planned}`, sub: "completed / planned" },
    { label: "Study time", value: formatStudyTime(weekSeconds), sub: "this week" },
    { label: "Streak", value: `${streak}d`, sub: streak === 1 ? "day" : "days" },
    { label: "XP earned", value: `+${weekXp}`, sub: `level total ${xp.toLocaleString()}` },
  ];

  return (
    <div className="space-y-6">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Weekly summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border p-3">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {stat.label}
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            ))}
          </div>
          {perfectDays > 0 ? (
            <p className="mt-3 text-sm font-medium text-primary">
              🎯 {perfectDays} perfect day{perfectDays === 1 ? "" : "s"} so far
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-primary" aria-hidden />
            Achievements
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Unlocked only from real activity.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((achievement) => (
              <li
                key={achievement.id}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  achievement.unlocked
                    ? "border-primary/40 bg-primary/5"
                    : "opacity-80",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg text-sm",
                      achievement.unlocked
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {achievement.unlocked ? <Trophy className="size-4" /> : <Lock className="size-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-tight">
                      {achievement.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {achievement.description}
                    </p>
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-2 text-xs font-medium tabular-nums",
                    achievement.unlocked ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {achievement.unlocked
                    ? "Unlocked"
                    : `${achievement.progressLabel}`}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
