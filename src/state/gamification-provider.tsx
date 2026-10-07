import { useCallback, useMemo, type ReactNode, useState } from "react";
import { createContext, useContext } from "react";
import type { StudySession } from "@/lib/student-os/study-log";
import {
  type GamificationState,
  type Achievement,
  addXp,
  achievementsFromState,
  computeStreak,
  progressInLevel,
  recordActivity,
  studyDaysFromSessions,
  unlockAchievement,
  EMPTY_GAMIFICATION,
} from "./gamification";

interface GamificationContextValue {
  state: GamificationState;
  xp: number;
  level: number;
  xpProgress: { current: number; max: number; percent: number };
  streak: number;
  achievements: readonly Achievement[];
  totalStudySeconds: number;
  setTotalStudySeconds: (seconds: number) => void;
  awardTargetXp: (amount: number, completions: Record<string, number>, targets: readonly { id: string; syllabusItemId: string; completed: boolean }[]) => void;
  hasAchievement: (id: string) => boolean;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GamificationState>(() => {
    try {
      const raw = window.localStorage.getItem("student-os:gamification:v1");
      if (!raw) return { ...EMPTY_GAMIFICATION };
      const parsed = JSON.parse(raw) as Partial<GamificationState>;
      return {
        xp: typeof parsed.xp === "number" ? parsed.xp : 0,
        level: typeof parsed.level === "number" ? parsed.level : 1,
        lastActiveDate:
          typeof parsed.lastActiveDate === "string" ? parsed.lastActiveDate : null,
        unlockedAchievements:
          Array.isArray(parsed.unlockedAchievements)
            ? parsed.unlockedAchievements
            : [],
      };
    } catch {
      return { ...EMPTY_GAMIFICATION };
    }
  });

  const persist = useCallback((next: GamificationState) => {
    setState(next);
    try {
      window.localStorage.setItem("student-os:gamification:v1", JSON.stringify(next));
    } catch {
      // Storage blocked — continue in memory.
    }
  }, []);

  const xp = state.xp;
  const level = state.level;
  const xpProgress = useMemo(() => progressInLevel(xp, level), [xp, level]);

  const totalStudySeconds = useMemo(() => {
    const raw = window.localStorage.getItem("student-os:total-study-seconds:v1");
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const setTotalStudySeconds = useCallback((seconds: number) => {
    try {
      window.localStorage.setItem("student-os:total-study-seconds:v1", String(seconds));
    } catch {
      // Storage blocked.
    }
  }, []);

  const awardTargetXp = useCallback(
    (amount: number, completions: Record<string, number>, targets: readonly { id: string; syllabusItemId: string; completed: boolean }[]) => {
      const next = addXp(state, amount);
      const studyDays = studyDaysFromSessions([]);
      const after = recordActivity(next, studyDays);
      persist(after);
    },
    [state, persist],
  );

  const streak = useMemo(() => computeStreak(state, studyDaysFromSessions([])), [state]);

  const achievements = useMemo(() => achievementsFromState(state), [state]);

  const hasAchievement = useCallback(
    (id: string) => state.unlockedAchievements.includes(id),
    [state],
  );

  return (
    <GamificationContext.Provider
      value={{
        state,
        xp,
        level,
        xpProgress,
        streak,
        achievements,
        totalStudySeconds,
        setTotalStudySeconds,
        awardTargetXp,
        hasAchievement,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification(): GamificationContextValue {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error("useGamification must be used within GamificationProvider");
  }
  return context;
}
