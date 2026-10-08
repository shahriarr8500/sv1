/**
 * Target model — the only place the raw Target type is defined.
 *
 * Everything else imports from this file, so the shape can change here without
 * touching the repo, the store, or the UI.
 */

export interface Target {
  readonly id: string;
  readonly syllabusItemId: string;
  readonly period: "daily" | "weekly";
  readonly createdAt: number;
  /** Set once the target is marked complete. Never copied onto the syllabus. */
  readonly completed: boolean;
  readonly completedAt?: number;
  /** Daily only — ISO-local "YYYY-MM-DD". */
  readonly targetDate?: string;
  /** Weekly only — Monday-week start, ISO-local "YYYY-MM-DD". */
  readonly weekStart?: string;
  /**
   * XP this mission pays out. Derived from the syllabus when it is created;
   * never edited afterwards, so the reward stays predictable.
   */
  readonly xp: number;
  /** Optional tag shown beside the mission (e.g. "BUET · 1st Position"). */
  readonly tag?: string;
}

export function makeTargetId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `t--${y}${m}${d}${h}${min}${s}${ms}`;
}

export function isDailyTarget(t: Target): t is Target & { readonly period: "daily"; readonly targetDate: string } {
  return t.period === "daily" && typeof t.targetDate === "string";
}

export function isWeeklyTarget(t: Target): t is Target & { readonly period: "weekly"; readonly weekStart: string } {
  return t.period === "weekly" && typeof t.weekStart === "string";
}

export function weeklyTargetKey(syllabusItemId: string, weekStart: string): string {
  return `${syllabusItemId}--weekly--${weekStart}`;
}

export function dailyTargetKey(syllabusItemId: string, targetDate: string): string {
  return `${syllabusItemId}--daily--${targetDate}`;
}

export function findDailyTarget(
  targets: readonly Target[],
  syllabusItemId: string,
  targetDate: string,
): Target | undefined {
  return targets.find(
    (t) => t.syllabusItemId === syllabusItemId && t.period === "daily" && t.targetDate === targetDate,
  );
}

export function findWeeklyTarget(
  targets: readonly Target[],
  syllabusItemId: string,
  weekStart: string,
): Target | undefined {
  return targets.find(
    (t) => t.syllabusItemId === syllabusItemId && t.period === "weekly" && t.weekStart === weekStart,
  );
}
