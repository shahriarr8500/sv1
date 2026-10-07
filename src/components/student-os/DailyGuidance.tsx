/**
 * Daily Guidance (🌙) — one verse a day, chosen deterministically so a
 * refresh never reshuffles it.
 *
 * Deliberate rules:
 *   - the verse and the reflection are separate, individually labelled
 *     blocks so app-written copy is never mistaken for scripture;
 *   - a content failure shows a compact retry instead of blanking the
 *     Dashboard — the rest of Student OS keeps working;
 *   - no XP, no streak, no points, no achievements. Listening to the Quran
 *     is intentionally outside the gamification system;
 *   - nothing plays until the student presses Listen.
 */

import { useEffect, useState } from "react";
import { BookOpen, Headphones, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadDailyGuidance,
  type GuidanceEntry,
} from "@/lib/student-os/quran";
import { quranPlayer } from "@/state/quran-player";
import { useGuidanceLanguage } from "@/state/guidance-language";

type Status = "loading" | "ready" | "error";

/** The last attempt that actually resolved, so loading never needs setState. */
interface GuidanceResult {
  attempt: number;
  entry: GuidanceEntry | null;
  error: boolean;
}

export function DailyGuidance() {
  const language = useGuidanceLanguage();
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadDailyGuidance()
      .then((entry) => {
        if (cancelled) return;
        setResult({ attempt, entry, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ attempt, entry: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Derived, never set: bumping `attempt` reads as loading until the new
  // result lands, with no synchronous setState inside the effect.
  const settled = result !== null && result.attempt === attempt;
  const status: Status = !settled ? "loading" : result.error ? "error" : "ready";
  const entry = settled ? result.entry : null;

  const reference = entry
    ? `${entry.surah}:${entry.ayah}`
    : "";

  return (
    <section
      aria-labelledby="daily-guidance-heading"
      className="relative overflow-hidden rounded-xl border bg-card"
    >
      {/* Quiet, non-gamified treatment: a soft edge rather than a reward cue. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />

      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <h2
          id="daily-guidance-heading"
          className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
            <BookOpen className="size-3.5" aria-hidden />
          </span>
          Daily Guidance
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Today&apos;s reflection
        </span>
      </div>

      {status === "loading" ? (
        <div className="space-y-3 px-4 py-5 sm:px-5">
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}

      {status === "error" ? (
        <div className="px-4 py-6 text-center sm:px-5">
          <p className="text-sm font-medium">Daily Guidance</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Unable to load today&apos;s Quranic content.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 cursor-pointer gap-1.5"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Try Again
          </Button>
        </div>
      ) : null}

      {status === "ready" && entry ? (
        <div className="space-y-4 px-4 py-5 sm:px-5">
          {/* 1. Verse */}
          <p
            dir="rtl"
            lang="ar"
            className="text-right text-xl leading-[2.1] font-medium text-foreground sm:text-2xl"
          >
            {entry.arabic}
          </p>

          {/* 2. Reference */}
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">
            Quran {reference}
          </p>

          {/* Translation — labelled as a translation, never as app copy. */}
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {language === "bn" ? "বাংলা অনুবাদ" : "English translation"}
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">
              {language === "bn" ? entry.bangla : entry.english}
            </p>
          </div>

          {/* 3. Reflection — Student OS, clearly separated from the verse. */}
          <div className="rounded-lg border border-dashed bg-muted/30 px-3.5 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <Sparkles className="size-3 text-primary" aria-hidden />
              Reflection
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {entry.reflection}
            </p>
          </div>

          {/* 4. Tawakkul reminder */}
          <p className="text-sm italic text-muted-foreground/90">
            {entry.reminder}
          </p>

          {/* 5. Action */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
              onClick={() => {
                if (!entry) return;
                quranPlayer.setExpanded(true);
                quranPlayer.play(entry.surah);
              }}
            >
              <Headphones className="size-3.5" aria-hidden />
              Listen
            </Button>
            <span className="text-xs text-muted-foreground">
              Opens the Quran player. Nothing plays until you press it.
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
