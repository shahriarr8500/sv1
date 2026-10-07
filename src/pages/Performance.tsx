import { Flame, Trophy } from "lucide-react";
import { StudyTimeSection } from "@/components/student-os/performance/StudyTimeSection";
import { TargetSuccessSection } from "@/components/student-os/performance/TargetSuccessSection";
import { WeeklySummary } from "@/components/student-os/performance/WeeklySummary";
import { useGamification } from "@/state/gamification";

/**
 * Performance — two deliberately separate metrics.
 *
 *   Study Time     → how long did I study?
 *   Target Success → how consistently did I finish what I planned?
 *
 * Nothing on this page is hardcoded: every figure is computed from stored
 * target records and recorded study sessions.
 */
export default function PerformancePage() {
  const { streak, level, xp } = useGamification();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Performance
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Two different questions: how long you studied, and how consistently
          you finished what you planned.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400">
          <Flame className="size-4" aria-hidden />
          {streak > 0
            ? `${streak} day streak`
            : "0 day streak — study today to start one"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium text-muted-foreground">
          <Trophy className="size-4 text-primary" aria-hidden />
          Level {level.level} · {xp.toLocaleString()} XP
        </span>
      </div>

      <MetricSections />
    </div>
  );
}

function MetricSections() {
  return (
    <div className="space-y-6">
      <StudyTimeSection />
      <TargetSuccessSection />
      <WeeklySummary />
    </div>
  );
}
