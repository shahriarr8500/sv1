/**
 * Daily Guidance (🌙) — one verse a day in a single line.
 *
 * Deliberately tiny: it is a quiet moment between the greeting and the
 * work, not a content section. Deterministic per date, so a refresh never
 * reshuffles it, and a content failure shows a small retry instead of
 * blanking the Dashboard.
 *
 * No XP, no streak, no points — listening to the Quran stays outside the
 * gamification system, and playback only ever starts from the player button.
 */

import { useEffect, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadDailyGuidance, type GuidanceEntry } from "@/lib/student-os/quran";

interface GuidanceResult {
  attempt: number;
  entry: GuidanceEntry | null;
  error: boolean;
}

export function DailyGuidance() {
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadDailyGuidance()
      .then((entry) => {
        if (!cancelled) setResult({ attempt, entry, error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ attempt, entry: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Derived rather than set inside the effect, so loading never cascades.
  const settled = result !== null && result.attempt === attempt;
  const error = settled && result.error;
  const entry = settled && !result.error ? result.entry : null;

  return (
    <section
      aria-labelledby="daily-guidance-heading"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3"
    >
      <h2
        id="daily-guidance-heading"
        className="flex shrink-0 items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
      >
        <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
          <BookOpen className="size-3.5" aria-hidden />
        </span>
        Daily Guidance
      </h2>

      <div className="min-w-0 flex-1">
        {!settled ? (
          <Skeleton className="h-4 w-2/3" />
        ) : error ? (
          <span className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            Unable to load today&apos;s Quranic content.
            <Button
              variant="ghost"
              size="sm"
              className="h-7 cursor-pointer gap-1.5 px-2"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RotateCcw className="size-3" aria-hidden />
              Try Again
            </Button>
          </span>
        ) : entry ? (
          <p className="line-clamp-2 text-sm break-words text-foreground">
            “{entry.english}”{" "}
            <span className="text-muted-foreground">
              — Quran {entry.surah}:{entry.ayah}
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
