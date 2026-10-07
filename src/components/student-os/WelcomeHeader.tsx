/**
 * Welcome header — the 5-second answer to "what is this and what do I do?".
 *
 * Order matches the ideal loop: greet → show streak/level → show today →
 * one obvious next action. No shame language anywhere: a quiet day is
 * described as a fresh start, never as a failure.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Clock3,
  Flame,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useGamification } from "@/state/gamification";
import { useStudyLog } from "@/state/study-log";
import { useTargets } from "@/state/targets";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatStudied(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function isSameLocalDay(timestamp: number, now = new Date()): boolean {
  const then = new Date(timestamp);
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { today } = useTargets();
  const { log, active, startTimer } = useStudyLog();
  const { level, streak } = useGamification();

  const name = user?.name?.trim() || "";
  const greeting = greetingForHour(new Date().getHours());

  const planned = today.length;
  const completed = useMemo(
    () => today.filter((target) => target.completed).length,
    [today],
  );
  const percent = planned === 0 ? 0 : Math.round((completed / planned) * 100);

  const studiedSeconds = useMemo(
    () =>
      log.sessions
        .filter(
          (session) =>
            session.mode === "study" && isSameLocalDay(session.startedAt),
        )
        .reduce((total, session) => total + session.durationSeconds, 0),
    [log.sessions],
  );

  /** The next mission that is actually worth starting right now. */
  const nextTarget = useMemo(
    () => today.find((target) => !target.completed) ?? null,
    [today],
  );

  const handlePrimary = () => {
    if (planned === 0) {
      // Nothing planned yet — hand the student straight to the planner.
      window.dispatchEvent(new CustomEvent("student-os:add-mission"));
      return;
    }
    if (!nextTarget) {
      navigate("/performance");
      return;
    }
    if (active) {
      navigate("/timer");
      return;
    }
    startTimer("study", "stopwatch", undefined, nextTarget.syllabusItemId);
    // The loop says: start → study. Land on the timer, not back on the plan.
    navigate("/timer");
  };

  const primaryLabel =
    planned === 0
      ? "Plan today's missions"
      : !nextTarget
        ? "See today's summary"
        : active
          ? "Go to timer"
          : "Start today's mission";

  const stats = [
    {
      icon: Target,
      label: "missions",
      value: planned === 0 ? "None yet" : `${completed} / ${planned}`,
    },
    {
      icon: Clock3,
      label: "studied",
      value: formatStudied(studiedSeconds),
    },
    {
      icon: TrendingUp,
      label: "complete",
      value: `${percent}%`,
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      aria-label="Today"
      className="space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting}
            {name ? `, ${name}` : ""}.
          </h1>
          <p className="mt-2 text-muted-foreground">
            {momentumLine(planned, completed)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium">
            <Flame
              className={cn("size-3.5", streak > 0 ? "text-primary" : "text-muted-foreground")}
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

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Today
        </p>

        <dl className="mt-3 grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <stat.icon className="size-3.5 text-primary" aria-hidden />
                {stat.label}
              </dt>
              <dd className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        {planned > 0 ? (
          <div className="mt-4 space-y-1.5">
            <Progress value={percent} aria-label="Today's progress" />
            <p className="text-xs text-muted-foreground tabular-nums">
              {percent}% of today&apos;s plan
            </p>
          </div>
        ) : null}

        <Button className="mt-4 w-full cursor-pointer sm:w-auto" onClick={handlePrimary}>
          {primaryLabel}
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </motion.section>
  );
}
