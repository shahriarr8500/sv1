import { useCallback, useMemo, type ReactNode } from "react";
import { createContext, useContext } from "react";
import type { Target } from "@/lib/student-os/target-model";
import {
  loadTargets,
  saveTargets,
  createDailyTarget,
  findTargetById,
  todayTargets,
  isSelectedItem,
} from "@/lib/student-os/targets";
import { unmarkTarget, markTargetComplete } from "@/lib/student-os/target-syllabus-integration";
import type { CompletionMap } from "@/lib/student-os/progress";

interface TargetsContextValue {
  targets: Target[];
  today: Target[];
  getTarget: (id: string) => Target | undefined;
  hasPlannedToday: boolean;
  isPlanned: (itemId: string, date: string) => boolean;
  addTargets: (items: Array<{ itemId: string; xp: number }>, date: string) => void;
  removeTarget: (id: string) => void;
  completeTarget: (target: Target, completions: CompletionMap, now?: Date) => void;
  uncompleteTarget: (target: Target) => void;
}

const TargetsContext = createContext<TargetsContextValue | null>(null);

export function TargetsProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useMemo(() => loadTargets(), []);

  const save = useCallback((next: Target[]) => {
    setTargets(next);
    saveTargets(next);
  }, []);

  const today = useMemo(() => todayTargets(targets), [targets]);

  const getTarget = useCallback(
    (id: string) => findTargetById(targets, id),
    [targets],
  );

  const hasPlannedToday = today.length > 0;

  const isPlanned = useCallback(
    (itemId: string, date: string) =>
      isSelectedItem(targets, itemId, "daily", undefined, date),
    [targets],
  );

  const addTargets = useCallback(
    (items: Array<{ itemId: string; xp: number }>, date: string) => {
      const added: Target[] = [];
      for (const item of items) {
        if (isSelectedItem(targets, item.itemId, "daily", undefined, date)) continue;
        added.push(createDailyTarget(item.itemId, date));
      }
      if (added.length === 0) return;
      save([...targets, ...added]);
    },
    [targets, save],
  );

  const removeTarget = useCallback(
    (id: string) => {
      const target = findTargetById(targets, id);
      if (!target) return;
      save(targets.filter((t) => t.id !== id));
    },
    [targets, save],
  );

  const completeTarget = useCallback(
    (target: Target, completions: CompletionMap, now = new Date()) => {
      const { updatedTargets } = markTargetComplete(
        targets,
        target,
        completions,
        now,
      );
      save(updatedTargets);
    },
    [targets, save],
  );

  const uncompleteTarget = useCallback(
    (target: Target) => {
      save(unmarkTarget(targets, target));
    },
    [targets, save],
  );

  const value = useMemo(
    () => ({
      targets,
      today,
      getTarget,
      hasPlannedToday,
      isPlanned,
      addTargets,
      removeTarget,
      completeTarget,
      uncompleteTarget,
    }),
    [
      targets,
      today,
      getTarget,
      hasPlannedToday,
      isPlanned,
      addTargets,
      removeTarget,
      completeTarget,
      uncompleteTarget,
    ],
  );

  return (
    <TargetsContext.Provider value={value}>
      <div>{children}</div>
    </TargetsContext.Provider>
  );
}

export function useTargets(): TargetsContextValue {
  const context = useContext(TargetsContext);
  if (!context) {
    throw new Error("useTargets must be used within TargetsProvider");
  }
  return context;
}
