/**
 * Centralized progress calculations.
 *
 * All percentages come from real trackable item counts — never by averaging
 * subject percentages, and never hardcoded:
 *
 *   chapter/subject = completedItems / totalItems × 100
 *   overall         = allCompletedItems / allTrackableItems × 100
 */

import { lookupItem } from "./syllabus";
import type { Chapter, ItemLocation, ProgressSummary, StudyItem, Subject } from "./types";

/** itemId → completion timestamp (ms). */
export type CompletionMap = Record<string, number>;

function summarize(completed: number, total: number): ProgressSummary {
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function isItemCompleted(
  item: Pick<StudyItem, "id">,
  completions: CompletionMap,
): boolean {
  return typeof completions[item.id] === "number";
}

/** 1 when the item is completed, otherwise 0. */
export function calculateItemProgress(
  item: Pick<StudyItem, "id">,
  completions: CompletionMap,
): number {
  return isItemCompleted(item, completions) ? 1 : 0;
}

export function calculateChapterProgress(
  chapter: Chapter,
  completions: CompletionMap,
): ProgressSummary {
  const completed = chapter.items.reduce(
    (sum, item) => sum + calculateItemProgress(item, completions),
    0,
  );
  return summarize(completed, chapter.items.length);
}

export function calculateSubjectProgress(
  subject: Subject,
  completions: CompletionMap,
): ProgressSummary {
  let completed = 0;
  let total = 0;
  for (const chapter of subject.chapters) {
    for (const item of chapter.items) {
      total += 1;
      completed += calculateItemProgress(item, completions);
    }
  }
  return summarize(completed, total);
}

/** Overall progress across the given subjects, weighted by actual item counts. */
export function calculateOverallProgress(
  subjects: Subject[],
  completions: CompletionMap,
): ProgressSummary {
  let completed = 0;
  let total = 0;
  for (const subject of subjects) {
    const summary = calculateSubjectProgress(subject, completions);
    completed += summary.completed;
    total += summary.total;
  }
  return summarize(completed, total);
}

/** First incomplete item in syllabus order — powers "Continue Studying". */
export function findFirstIncompleteItem(
  subjects: Subject[],
  completions: CompletionMap,
): ItemLocation | null {
  for (const subject of subjects) {
    for (const chapter of subject.chapters) {
      for (const item of chapter.items) {
        if (!isItemCompleted(item, completions)) {
          return { subject, chapter, item };
        }
      }
    }
  }
  return null;
}

/**
 * Real completions, newest first. Items that no longer exist in the syllabus
 * catalog are ignored rather than shown as fake history.
 */
export function listRecentCompletions(
  completions: CompletionMap,
  limit: number,
): Array<ItemLocation & { completedAt: number }> {
  const entries: Array<ItemLocation & { completedAt: number }> = [];
  for (const [itemId, completedAt] of Object.entries(completions)) {
    const location = lookupItem(itemId);
    if (location) entries.push({ ...location, completedAt });
  }
  entries.sort((a, b) => b.completedAt - a.completedAt);
  return entries.slice(0, limit);
}
