/**
 * Welcome header — compact and calm: greet, then goal, then streak/level.
 *
 * The academic goal sits first and heaviest; gamification is deliberately
 * smaller and to the side. The mission itself lives directly below in
 * `TodayMissions`, so the header never competes with it.
 *
 * No shame language anywhere: a quiet day is a fresh start, never a failure.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Flame, Star } from "lucide-react";
import { FutureGoalChip } from "@/components/student-os/FutureGoalChip";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useGamification } from "@/state/gamification";
import { useTargets } from "@/state/targets";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Short, encouraging line for how far today has actually got. No guilt. */
function momentumLine(planned: number, completed: number): string {
  if (planned === 0) return "Set your first mission and start building your streak.";
  if (completed === 0) return "Let's get the first one done.";
  if (completed >= planned) return "That's today's work done. Well earned.";
  if (completed === 1) return "Good start. Keep the momentum.";
  return "You're on a roll.";
}

export function WelcomeHeader() {
  const { user } = useAuth();
  const { today } = useTargets();
  const { level, streak } = useGamification();

  const name = user?.name?.trim() || "";
  const greeting = greetingForHour(new Date().getHours());

  const planned = today.length;
  const completed = useMemo(
    () => today.filter((target) => target.completed).length,
    [today],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      aria-label="Today"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting}
            {name ? `, ${name}` : ""}.
          </h1>
          <p className="mt-2 text-muted-foreground">
            {momentumLine(planned, completed)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FutureGoalChip />
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium">
            <Flame
              className={cn(
                "size-3.5",
                streak > 0 ? "text-primary" : "text-muted-foreground",
              )}
              aria-hidden
            />
            {streak} day{streak === 1 ? "" : "s"} streak
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium">
            <Star className="size-3.5 text-primary" aria-hidden />
            Level {level.level}
          </span>
        </div>
      </div>
    </motion.section>
  );
}
