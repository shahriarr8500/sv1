/**
 * Target creation + list helpers.
 *
 * Builds + filters Target records from the syllabus catalog. This is the only
 * place where syllabus items turn into candidate targets for the creation UI.
 */

import type { Target } from "./target-model";
import type { Subject, Chapter } from "./types";
import { TARGETS_KEY, targetStore } from "./target-store";
import { SYLLABUS, getSubject, getChapter, lookupItem } from "./syllabus";
import { todayKey, weekStartKey, weekEndKey } from "./target-calendar";
import { BASE_MISSION_XP } from "./gamification";

export function loadTargets(): Target[] {
  return targetStore.load().targets;
}

export function saveTargets(targets: Target[]): void {
  targetStore.save({ targets });
}

export function findTargetById(targets: Target[], id: string): Target | undefined {
  return targets.find((t) => t.id === id);
}

export function subjectTreeForSelection(): Array<{ subject: Subject; chapters: Array<{ chapter: Chapter; selectedItems: string[] }> }> {
  return SYLLABUS.map((subject) => ({
    subject,
    chapters: subject.chapters.map((chapter) => ({
      chapter,
      selectedItems: [],
    })),
  }));
}

export function itemLabel(itemId: string): string {
  const loc = lookupItem(itemId);
  if (!loc) return itemId;
  const name = loc.chapter.title ?? loc.chapter.number
    ? `Ch ${loc.chapter.number}`
    : "";
  const item = loc.item.title ?? loc.item.itemNumber;
  return `${name ? `${name} · ` : ""}${item}`;
}

export function createDailyTarget(
  syllabusItemId: string,
  targetDate = todayKey(),
  xp: number = BASE_MISSION_XP,
): Target {
  return {
    id: `daily--${syllabusItemId}--${targetDate}`,
    syllabusItemId,
    period: "daily",
    targetDate,
    createdAt: Date.now(),
    completed: false,
    xp: Math.round(xp),
  };
}

export function createWeeklyTarget(
  syllabusItemId: string,
  weekStart = weekStartKey(new Date()),
  xp: number = BASE_MISSION_XP,
): Target {
  return {
    id: `weekly--${syllabusItemId}--${weekStart}`,
    syllabusItemId,
    period: "weekly",
    weekStart,
    createdAt: Date.now(),
    completed: false,
    xp: Math.round(xp),
  };
}

/**
 * Every mission planned for today, completed or not.
 *
 * Completed missions must stay in this list: the dashboard shows them
 * checked, counts them toward "3 / 5", and a Perfect Day is only detectable
 * when finished missions are still present.
 */
export function todayTargets(targets: Target[]): Target[] {
  return targets.filter(
    (t) => t.period === "daily" && t.targetDate === todayKey(),
  );
}

export function weekTargetsFor(targets: Target[], weekStart: string): Target[] {
  return targets.filter(
    (t) =>
      (t.period === "weekly" && t.weekStart === weekStart) ||
      (t.period === "daily" && t.targetDate && t.targetDate >= weekStart && t.targetDate <= weekEndKey(weekStart) && !t.completed),
  );
}

export function allTargetsForSubject(targets: Target[], subjectId: string): Target[] {
  return targets.filter((t) => t.syllabusItemId.startsWith(subjectId));
}

export function allTargetsForChapter(targets: Target[], chapterId: string): Target[] {
  return targets.filter((t) => t.syllabusItemId.startsWith(chapterId));
}

export function isSelectedItem(targets: Target[], syllabusItemId: string, period: "daily" | "weekly", weekStart?: string, targetDate?: string): boolean {
  if (period === "daily") {
    return targets.some(
      (t) => t.syllabusItemId === syllabusItemId && t.period === "daily" && t.targetDate === targetDate,
    );
  }
  if (period === "weekly") {
    return targets.some(
      (t) => t.syllabusItemId === syllabusItemId && t.period === "weekly" && t.weekStart === weekStart,
    );
  }
  return false;
}
