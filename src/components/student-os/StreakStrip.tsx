/**
 * Streak strip — makes consistency visible at a glance.
 *
 * Shows the current week, Monday to Sunday, with a mark on every day that
 * recorded a real study session. It reports what happened; it never scolds
 * for a blank day. The streak is the number of consecutive active days, so
 * the strip and the counter can never disagree.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGamification } from "@/state/gamification";
import { useStudyLog } from "@/state/study-log";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Monday-anchored index (0 = Monday … 6 = Sunday). */
function mondayIndex(date: Date): number {
  return (date.getDate() + 6) % 7 === 0 ? 0 : (date.getDay() + 6) % 7;
}

export function StreakStrip() {
  const { log } = useStudyLog();
  const { streak } = useGamification();

  const week = useMemo(() => {
    const today = new Date();
    const activeDays = new Set<string>();
    for (const session of log.sessions) {
      if (session.mode !== "study") continue;
      activeDays.add(dayKeyOf(new Date(session.startedAt)));
    }

    const todayIndex = mondayIndex(today);
    return WEEKDAY_LABELS.map((label, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (todayIndex - index));
      return {
        label,
        key: dayKeyOf(date),
        isFuture: index > todayIndex,
        active: activeDays.has(dayKeyOf(date)),
        isToday: index === todayIndex,
      };
    });
  }, [log.sessions]);

  const activeCount = week.filter((day) => day.active).length;

  return (
    <section
      aria-labelledby="streak-heading"
      className="h-full rounded-xl border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="streak-heading"
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          <Flame
            className={cn("size-3.5", streak > 0 ? "text-primary" : "text-muted-foreground")}
            aria-hidden
          />
          Streak
        </h2>
        <span className="text-sm font-semibold tracking-tight tabular-nums">
          {streak} day{streak === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {week.map((day, index) => (
          <motion.div
            key={day.key}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: index * 0.03, ease: "easeOut" }}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                "text-[11px] font-medium",
                day.isToday ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {day.label}
            </span>
            <span
              aria-label={
                day.isFuture
                  ? "Upcoming"
                  : day.active
                    ? "Studied"
                    : "No study session"
              }
              className={cn(
                "grid size-7 place-items-center rounded-full border text-xs transition-colors",
                day.isFuture && "border-dashed border-border opacity-40",
                day.active && "border-primary/40 bg-primary/12 text-primary",
                !day.active &&
                  !day.isFuture &&
                  "border-border text-muted-foreground/60",
                day.isToday && !day.active && "ring-2 ring-primary/30",
              )}
            >
              {day.active ? "✓" : day.isFuture ? "" : "·"}
            </span>
          </motion.div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {activeCount === 0
          ? "One short session today is enough to start."
          : `${activeCount} day${activeCount === 1 ? "" : "s"} studied this week.`}
      </p>
    </section>
  );
}
