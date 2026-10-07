/**
 * Gamification state — total XP, level, streak and achievements, persisted to
 * `student-os:gamification:v1`.
 *
 * XP is only ever *added*, and every award is keyed by the thing that caused
 * it (target id / session id), so it cannot be farmed:
 *   - completing a mission pays out once, forever;
 *   - unchecking it never subtracts;
 *   - checking it again pays nothing because the id is already recorded;
 *   - a study session pays out once when it is recorded.
 *
 * Streaks and achievements are *derived* from the real target/session records
 * rather than stored, so they can never drift out of sync with reality.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Target } from "@/lib/student-os/target-model";
import {
  computeAchievements,
  currentStreak,
  emptyGamification,
  levelProgress,
  loadGamification,
  saveGamification,
  xpForStudySession,
  type Achievement,
  type GamificationState,
  type LevelProgress,
} from "@/lib/student-os/gamification";
import { useStudyLog } from "@/state/study-log";
import { useTargets } from "@/state/targets";

interface GamificationContextValue {
  xp: number;
  level: LevelProgress;
  /** Consecutive days with real study activity. */
  streak: number;
  achievements: Achievement[];
  /** XP paid by today's finished missions. */
  xpToday: number;
  awardTargetXp: (target: Target) => void;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

export function GamificationProvider({ children }: { children: ReactNode }) {
  const { log } = useStudyLog();
  const { targets } = useTargets();
  const [state, setState] = useState<GamificationState>(() => loadGamification());

  useEffect(() => {
    saveGamification(state);
  }, [state]);

  // Study sessions pay out once each. The functional update re-checks against
  // the *latest* state, so even a duplicated effect run cannot double-award.
  useEffect(() => {
    const sessions = log.sessions;
    if (sessions.length === 0) return;
    setState((previous) => {
      const pending = sessions.filter(
        (session) =>
          session.mode === "study" &&
          session.durationSeconds >= 60 &&
          !previous.awardedSessionIds.includes(session.id),
      );
      if (pending.length === 0) return previous;
      const gained = pending.reduce(
        (sum, session) => sum + xpForStudySession(session.durationSeconds),
        0,
      );
      if (gained === 0) return previous;
      return {
        ...previous,
        xp: previous.xp + gained,
        awardedSessionIds: [
          ...previous.awardedSessionIds,
          ...pending.map((session) => session.id),
        ],
      };
    });
  }, [log.sessions]);

  /**
   * Pays a mission out exactly once. Safe to call repeatedly: the guard is the
   * target id itself, so unchecking and re-checking adds nothing.
   */
  const awardTargetXp = useCallback((target: Target) => {
    setState((previous) => {
      if (previous.awardedTargetIds.includes(target.id)) return previous;
      const amount = Number.isFinite(target.xp) && target.xp > 0 ? target.xp : 25;
      return {
        ...previous,
        xp: previous.xp + amount,
        awardedTargetIds: [...previous.awardedTargetIds, target.id],
      };
    });
  }, []);

  const level = useMemo(() => levelProgress(state.xp), [state.xp]);
  const streak = useMemo(() => currentStreak(log.sessions), [log.sessions]);
  const achievements = useMemo(
    () => computeAchievements({ targets, sessions: log.sessions }),
    [targets, log.sessions],
  );

  // Today's mission XP: only targets completed today, paid out at most once.
  const xpToday = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return targets
      .filter(
        (t) =>
          t.completed &&
          t.targetDate === today &&
          state.awardedTargetIds.includes(t.id),
      )
      .reduce((sum, t) => sum + (t.xp > 0 ? t.xp : 25), 0);
  }, [targets, state.awardedTargetIds]);

  const value = useMemo(
    () => ({
      xp: state.xp,
      level,
      streak,
      achievements,
      xpToday,
      awardTargetXp,
    }),
    [state.xp, level, streak, achievements, xpToday, awardTargetXp],
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

/** Empty state helper re-exported for tests and story-style fixtures. */
export { emptyGamification };
