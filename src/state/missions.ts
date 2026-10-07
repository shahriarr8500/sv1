/**
 * Mission actions — the one place a "check a mission" click is turned into its
 * side effects:
 *
 *   1. mark the target complete;
 *   2. complete the syllabus item *only if it is not already complete*.
 *
 * XP needs no action here: `GamificationProvider` derives it from the set of
 * currently-completed missions, so checking adds the reward and unchecking
 * takes it back automatically. Toggling repeatedly therefore nets zero.
 *
 * Unchecking reverses only step 1 — the syllabus is never reverted.
 */

import { useCallback } from "react";
import type { Target } from "@/lib/student-os/target-model";
import { isSyllabusItemComplete } from "@/lib/student-os/target-syllabus-integration";
import { useStudentOS } from "@/state/student-os";
import { useTargets } from "@/state/targets";

export interface MissionActions {
  completeMission: (target: Target) => void;
  uncompleteMission: (target: Target) => void;
  toggleMission: (target: Target) => void;
  removeMission: (id: string) => void;
}

export function useMissionActions(): MissionActions {
  const { setCompleted, removeMission } = useTargets();
  const { completions, toggleItem } = useStudentOS();

  const completeMission = useCallback(
    (target: Target) => {
      setCompleted(target.id, true);
      if (!isSyllabusItemComplete(target.syllabusItemId, completions)) {
        toggleItem(target.syllabusItemId, true);
      }
    },
    [setCompleted, completions, toggleItem],
  );

  const uncompleteMission = useCallback(
    (target: Target) => {
      // Only the target flag moves. The syllabus stays complete, and the
      // mission's XP drops back out because totals are derived from this flag.
      setCompleted(target.id, false);
    },
    [setCompleted],
  );

  const toggleMission = useCallback(
    (target: Target) => {
      if (target.completed) uncompleteMission(target);
      else completeMission(target);
    },
    [completeMission, uncompleteMission],
  );

  return { completeMission, uncompleteMission, toggleMission, removeMission };
}
