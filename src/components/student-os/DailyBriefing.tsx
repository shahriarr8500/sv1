/**
 * AI Summary — a two-line briefing beside Daily Guidance.
 *
 * Every number here is computed from the student's own records: study
 * sessions, today's missions, and syllabus completion. Nothing is invented
 * and nothing is padded — a summary that guesses is worse than no summary.
 *
 * Deliberately outside the game: no XP, no streak bonuses. It reads state,
 * it never writes it.
 */

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import {
  calculateSubjectProgress,
  findFirstIncompleteItem,
} from "@/lib/student-os/progress";
import { itemLabel, syllabusShortLabel } from "@/lib/student-os/format";
import {
  useSelectedSubjects,
  useStudentOS,
} from "@/state/student-os";
import { useStudyLog } from "@/state/study-log";
import { useTargets } from "@/state/targets";

function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function DailyBriefing() {
  const { log } = useStudyLog();
  const { today } = useTargets();
  const { completions } = useStudentOS();
  const subjects = useSelectedSubjects();

  const { yesterdaySeconds, yesterdaySessions } = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = dayKeyOf(yesterday);

    let seconds = 0;
    let count = 0;
    for (const session of log.sessions) {
      if (session.mode !== "study") continue;
      if (dayKeyOf(new Date(session.startedAt)) !== key) continue;
      seconds += session.durationSeconds;
      count += 1;
    }
    return { yesterdaySeconds: seconds, yesterdaySessions: count };
  }, [log.sessions]);

  const focus = useMemo(() => {
    const next = findFirstIncompleteItem(subjects, completions);
    if (!next) return null;

    let weakest = null as typeof subjects[number] | null;
    let weakestPercent: number | null = null;
    for (const subject of subjects) {
      const summary = calculateSubjectProgress(subject, completions);
      // Skip empty subjects rather than inventing a percentage for them.
      if (summary.total === 0) continue;
      if (weakestPercent === null || summary.percent < weakestPercent) {
        weakestPercent = summary.percent;
        weakest = subject;
      }
    }

    return {
      next,
      weakest,
      weakestPercent,
    };
  }, [subjects, completions]);

  const planned = today.length;
  const done = today.filter((target) => target.completed).length;

  // Line 1 — what actually happened yesterday.
  const headline =
    yesterdaySessions > 0
      ? `Yesterday you studied ${formatDuration(yesterdaySeconds)} across ${yesterdaySessions} session${yesterdaySessions === 1 ? "" : "s"}.`
      : "No study session recorded yesterday — a short one today is enough to restart.";

  // Line 2 — the single most useful next move, never a scold.
  const detail = (() => {
    if (!focus) {
      return `${syllabusShortLabel(subjects)} syllabus is complete. Nothing is left to chase.`;
    }
    if (planned === 0) {
      return `${focus.next.subject.name} ${itemLabel(focus.next.item)} is the next real thing on your syllabus.`;
    }
    const weakestNote =
      focus.weakest && focus.weakestPercent !== null
        ? ` ${focus.weakest.name} is at ${focus.weakestPercent}%.`
        : "";
    if (done >= planned) {
      return `All ${planned} mission${planned === 1 ? "" : "s"} done.${weakestNote} Keep it up.`;
    }
    const remaining = planned - done;
    return `${remaining} mission${remaining === 1 ? "" : "s"} left today.${weakestNote}`;
  })();

  return (
    <section
      aria-labelledby="ai-summary-heading"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3"
    >
      <h2
        id="ai-summary-heading"
        className="flex shrink-0 items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
      >
        <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        AI Summary
      </h2>

      <div className="min-w-0 flex-1 basis-56">
        {/* Wrap to 2 lines instead of truncating mid-sentence on phones. */}
        <p className="line-clamp-2 text-sm text-foreground">{headline}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {detail}
        </p>
      </div>
    </section>
  );
}
