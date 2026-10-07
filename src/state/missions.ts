/**
 * Mission actions — the one place a "check a mission" click is turned into its
 * three side effects, in the right order and with the right guards:
 *
 *   1. mark the target complete;
 *   2. complete the syllabus item *only if it is not already complete*;
 *   3. award the mission's XP once (idempotent inside GamificationProvider).
 *
 * Unchecking reverses only step 1. The syllabus is never reverted and XP is
 * never subtracted, so toggling a mission repeatedly cannot farm anything.
 */

import { useCallback } from "react";
import type { Target } from "@/lib/student-os/target-model";
import { isSyllabusItemComplete } from "@/lib/student-os/target-syllabus-integration";
import { useStudentOS } from "@/state/student-os";
import { useTargets } from "@/state/targets";
import { useGamification } from "@/state/gamification";

export interface MissionActions {
  completeMission: (target: Target) => void;
  uncompleteMission: (target: Target) => void;
  toggleMission: (target: Target) => void;
  removeMission: (id: string) => void;
}

export function useMissionActions(): MissionActions {
  const { setCompleted, removeMission } = useTargets();
  const { awardTargetXp } = useGamification();
  const { completions, toggleItem } = useStudentOS();

  const completeMission = useCallback(
    (target: Target) => {
      setCompleted(target.id, true);
      if (!isSyllabusItemComplete(target.syllabusItemId, completions)) {
        toggleItem(target.syllabusItemId, true);
      }
      awardTargetXp(target);
    },
    [setCompleted, completions, toggleItem, awardTargetXp],
  );

  const uncompleteMission = useCallback(
    (target: Target) => {
      // Only the target flag moves. No syllabus revert, no XP refund.
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
