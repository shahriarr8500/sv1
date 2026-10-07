/**
 * Syllabus integration for targets.
 *
 * Completing a target can complete the underlying syllabus item — but only if
 * that item is not already complete. Unchecking a target never touches
 * syllabus progress.
 */

import type { Target } from "./target-model";
import type { CompletionMap } from "./progress";

export function syllabusItemsForTargets(targets: readonly Target[]): readonly string[] {
  return [...new Set(targets.map((t) => t.syllabusItemId))];
}

export function isSyllabusItemComplete(syllabusItemId: string, completions: CompletionMap): boolean {
  return typeof completions[syllabusItemId] === "number";
}

export function markTargetComplete(
  state: readonly Target[],
  target: Target,
  completions: CompletionMap,
  now = new Date(),
): { updatedTargets: Target[]; syllabusItemsToComplete: readonly string[] } {
  if (target.completed) {
    return { updatedTargets: state as Target[], syllabusItemsToComplete: [] };
  }

  const updated = state.map((t) =>
    t.id === target.id ? { ...t, completed: true, completedAt: now.getTime() } : t,
  );

  const idsToComplete = new Set<string>();
  for (const t of updated) {
    if (!t.completed) continue;
    if (isSyllabusItemComplete(t.syllabusItemId, completions)) continue;
    idsToComplete.add(t.syllabusItemId);
  }

  return { updatedTargets: updated, syllabusItemsToComplete: [...idsToComplete] };
}

export function unmarkTarget(
  state: readonly Target[],
  target: Target,
): Target[] {
  if (!target.completed) return state as Target[];
  return state.map((t) =>
    t.id === target.id ? { ...t, completed: false, completedAt: undefined } : t,
  );
}

export function applySyllabusCompletion(completions: CompletionMap, ids: readonly string[]): CompletionMap {
  const updated = { ...completions };
  for (const id of ids) {
    if (!isSyllabusItemComplete(id, updated)) {
      updated[id] = Date.now();
    }
  }
  return updated;
}

export function applySyllabusRevocation(completions: CompletionMap): CompletionMap {
  return { ...completions };
}
