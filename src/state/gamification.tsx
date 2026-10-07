/**
 * Gamification state — XP, level, streak and achievements.
 *
 * XP is **derived**, never accumulated:
 *
 *   XP = Σ (XP of completed missions) + Σ (XP of recorded study sessions)
 *
 * That single change gives both behaviours we need:
 *
 *   - completing a mission adds its XP;
 *   - unchecking it removes that XP;
 *   - toggling a mission over and over nets zero, because there is no ledger
 *     to farm — the number is always recomputed from current state.
 *
 * Syllabus progress is deliberately *not* affected by unchecking; that lives
 * in `StudentOSProvider` and is only ever filled in, never reverted.
 *
 * Streak and achievements are derived from the same records, so they cannot
 * drift from what actually happened. The figures are cached to
 * `student-os:gamification:v1` for inspection, but that cache is never read
 * back as truth — `student-os:v1` and the target/session stores remain the
 * source of truth.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  computeAchievements,
  currentStreak,
  emptyGamification,
  levelProgress,
  saveGamification,
  todayTargetXp,
  totalXp,
  type Achievement,
  type LevelProgress,
} from "@/lib/student-os/gamification";
import { useStudyLog } from "@/state/study-log";
import { useTargets } from "@/state/targets";

interface GamificationContextValue {
  /** Total XP currently held. Falls when a mission is unchecked. */
  xp: number;
  level: LevelProgress;
  /** Consecutive days with real study activity. */
  streak: number;
  achievements: Achievement[];
  /** XP from missions completed today. */
  xpToday: number;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function GamificationProvider({ children }: { children: ReactNode }) {
  const { log } = useStudyLog();
  const { targets } = useTargets();

  // Recomputed from the records on every relevant change — this is the truth.
  const xp = useMemo(
    () => totalXp(targets, log.sessions),
    [targets, log.sessions],
  );

  const level = useMemo(() => levelProgress(xp), [xp]);
  const streak = useMemo(() => currentStreak(log.sessions), [log.sessions]);
  const achievements = useMemo(
    () => computeAchievements({ targets, sessions: log.sessions }),
    [targets, log.sessions],
  );
  const xpToday = useMemo(
    () => todayTargetXp(targets, localDayKey(new Date())),
    [targets],
  );

  // Cache the derived figures in their own namespace. Write-only: a corrupt
  // or missing copy can never change what the UI shows, because nothing reads
  // this back as truth. Refreshed whenever the derived values change.
  useEffect(() => {
    saveGamification({
      ...emptyGamification(),
      xp,
      level: level.level,
      updatedAt: Date.now(),
    });
  }, [xp, level.level]);

  const value = useMemo(
    () => ({ xp, level, streak, achievements, xpToday }),
    [xp, level, streak, achievements, xpToday],
  );

  return (
    <GamificationContext.Provider value={value}>
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification(): GamificationContextValue {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error("useGamification must be used within a GamificationProvider");
  }
  return context;
}

/** Kept so callers can read the shape of a zeroed snapshot. */
export { emptyGamification };
