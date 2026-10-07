/**
 * Targets state — one provider owns the daily mission list and persists it to
 * `student-os:targets:v1`. `student-os:v1` is never touched, so existing
 * profile/completion data survives untouched.
 *
 * This provider only owns the *target records*. Awarding XP lives in
 * `GamificationProvider` and applying syllabus completion lives in
 * `StudentOSProvider`; the `useMissionActions` hook composes all three so a
 * single click does the right thing everywhere.
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
  createDailyTarget,
  findTargetById,
  loadTargets,
  saveTargets,
  todayTargets,
} from "@/lib/student-os/targets";
import { targetStore } from "@/lib/student-os/target-store";

interface TargetsContextValue {
  targets: Target[];
  /** Missions planned for today (completed or not). */
  today: Target[];
  getTarget: (id: string) => Target | undefined;
  /** Plans for a given local date key. */
  plannedFor: (dateKey: string) => Target[];
  /** True when this syllabus item is already planned on that date. */
  isPlanned: (itemId: string, dateKey: string) => boolean;
  /**
   * Adds missions for a date, silently skipping anything already planned
   * there. Returns how many were actually added.
   */
  addMissions: (itemIds: readonly string[], dateKey: string, xpById: Record<string, number>) => number;
  removeMission: (id: string) => void;
  /** Sets the completion flag. Never touches the syllabus or XP. */
  setCompleted: (id: string, completed: boolean) => void;
}

const TargetsContext = createContext<TargetsContextValue | null>(null);

export function TargetsProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<Target[]>(() => loadTargets());

  // Persist on every change so missions survive a refresh.
  useEffect(() => {
    saveTargets(targets);
  }, [targets]);

  const today = useMemo(() => todayTargets(targets), [targets]);

  const getTarget = useCallback(
    (id: string) => findTargetById(targets, id),
    [targets],
  );

  const plannedFor = useCallback(
    (dateKey: string) =>
      targets.filter((t) => t.period === "daily" && t.targetDate === dateKey),
    [targets],
  );

  const isPlanned = useCallback(
    (itemId: string, dateKey: string) =>
      targets.some(
        (t) =>
          t.period === "daily" &&
          t.targetDate === dateKey &&
          t.syllabusItemId === itemId,
      ),
    [targets],
  );

  const addMissions = useCallback(
    (itemIds: readonly string[], dateKey: string, xpById: Record<string, number>) => {
      let added = 0;
      setTargets((previous) => {
        const next = [...previous];
        for (const itemId of itemIds) {
          const exists = next.some(
            (t) =>
              t.period === "daily" &&
              t.targetDate === dateKey &&
              t.syllabusItemId === itemId,
          );
          if (exists) continue;
          next.push(
            createDailyTarget(itemId, dateKey, xpById[itemId] ?? 25),
          );
          added += 1;
        }
        return added > 0 ? next : previous;
      });
      return added;
    },
    [],
  );

  const removeMission = useCallback((id: string) => {
    setTargets((previous) => {
      const target = previous.find((t) => t.id === id);
      if (!target) return previous;
      if (target.completed) {
        // A finished mission is history — deleting it would erase real
        // progress, so removal only applies to plans still in progress.
        return previous;
      }
      return previous.filter((t) => t.id !== id);
    });
  }, []);

  const setCompleted = useCallback((id: string, completed: boolean) => {
    setTargets((previous) => {
      const target = previous.find((t) => t.id === id);
      if (!target || target.completed === completed) return previous;
      return previous.map((t) =>
        t.id === id
          ? {
              ...t,
              completed,
              completedAt: completed ? Date.now() : undefined,
            }
          : t,
      );
    });
  }, []);

  const value = useMemo(
    () => ({
      targets,
      today,
      getTarget,
      plannedFor,
      isPlanned,
      addMissions,
      removeMission,
      setCompleted,
    }),
    [targets, today, getTarget, plannedFor, isPlanned, addMissions, removeMission, setCompleted],
  );

  return <TargetsContext.Provider value={value}>{children}</TargetsContext.Provider>;
}

export function useTargets(): TargetsContextValue {
  const context = useContext(TargetsContext);
  if (!context) {
    throw new Error("useTargets must be used within a TargetsProvider");
  }
  return context;
}

/** Exposed so callers can force a reload after external writes. */
export function reloadTargets(): Target[] {
  return targetStore.load().targets;
}
