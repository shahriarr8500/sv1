/**
 * AshyProgressStatsSync — a headless mirror for Ashy's progress awareness.
 *
 * Syllabus completions are already synced by StudentOSProvider. Study time
 * and streak are derived here (from the same records the dashboard shows)
 * and merged into the same `users.progress` document as `stats`, so Ashy's
 * server-side summary can quote real numbers. Renders nothing; lives inside
 * the Gamification/StudyLog providers in main.tsx.
 */

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useGamification } from "@/state/gamification";
import { useStudyLog } from "@/state/study-log";

/** Study time doesn't change second-to-second; mirror it gently. */
const SYNC_DEBOUNCE_MS = 15_000;

export function AshyProgressStatsSync() {
  const { isAuthenticated } = useConvexAuth();
  const { log } = useStudyLog();
  const { streak } = useGamification();
  const syncStats = useMutation(api.progress.syncMyProgress);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Derived at sync time (inside the timer callback), never during render.
      const now = Date.now();
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      let today = 0;
      let week = 0;
      let total = 0;
      for (const session of log.sessions) {
        total += session.durationSeconds;
        if (session.startedAt >= weekAgo) week += session.durationSeconds;
        if (session.startedAt >= dayStart.getTime()) {
          today += session.durationSeconds;
        }
      }
      const stats = {
        studySecondsToday: today,
        studySecondsWeek: week,
        studySecondsTotal: total,
        streakDays: streak,
        computedAt: now,
      };
      // A failed mirror is silent — the summary simply says "not tracked yet".
      syncStats({ stats }).catch(() => {});
    }, SYNC_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [log.sessions, streak, isAuthenticated, syncStats]);

  return null;
}
