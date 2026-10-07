/**
 * Performance calculations — pure functions over real target and session
 * records. Nothing here invents a number.
 *
 * Two metrics are deliberately kept apart:
 *   - Study Time     → how long the student actually studied
 *   - Target Success → completed / planned × 100
 *
 * A day with zero planned targets yields `null`, never 0 — the UI renders
 * "—" for it. Period comparisons return `null` unless both periods have real
 * data.
 */

import type { Target } from "./target-model";
import type { StudySession } from "./study-log";
import { dayKey } from "./gamification";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Midnight (local) for a day key. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local midnight of the Monday containing `date`. */
export function mondayKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return localDayKey(d);
}

export function shiftKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return localDayKey(d);
}

/** The `count` days ending today, oldest → newest. */
export function lastDays(count: number, now = new Date()): string[] {
  const keys: string[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    keys.push(localDayKey(d));
  }
  return keys;
}

/* -------------------------------------------------------------------------- */
/* Study time                                                                 */
/* -------------------------------------------------------------------------- */

export function studySecondsByKey(sessions: readonly StudySession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    if (session.mode !== "study") continue;
    const key = dayKey(session.startedAt);
    map.set(key, (map.get(key) ?? 0) + session.durationSeconds);
  }
  return map;
}

export function studySecondsBetween(
  sessions: readonly StudySession[],
  fromKey: string,
  toKey: string,
): number {
  const map = studySecondsByKey(sessions);
  let total = 0;
  for (const [key, seconds] of map) {
    if (key >= fromKey && key <= toKey) total += seconds;
  }
  return total;
}

export function studySecondsForDay(sessions: readonly StudySession[], key: string): number {
  return studySecondsByKey(sessions).get(key) ?? 0;
}

export function totalStudySeconds(sessions: readonly StudySession[]): number {
  return sessions.reduce((sum, s) => (s.mode === "study" ? sum + s.durationSeconds : sum), 0);
}

/**
 * Seconds difference for this week vs last week.
 *
 * Returns `null` when last week has no recorded study at all — an "increase"
 * against a week we never tracked would be manufactured, not measured.
 */
export function weekOverWeekSeconds(
  sessions: readonly StudySession[],
  now = new Date(),
): number | null {
  const thisMonday = mondayKey(now);
  const lastMonday = shiftKey(thisMonday, -7);
  const lastSunday = shiftKey(thisMonday, -1);
  const current = studySecondsBetween(sessions, thisMonday, localDayKey(now));
  const previous = studySecondsBetween(sessions, lastMonday, lastSunday);
  if (previous <= 0 || current <= 0) return null;
  return current - previous;
}

/* -------------------------------------------------------------------------- */
/* Target success                                                             */
/* -------------------------------------------------------------------------- */

/** completed / planned × 100, or `null` when nothing was planned. */
export function successRate(planned: number, completed: number): number | null {
  if (planned <= 0) return null;
  return Math.round((completed / planned) * 100);
}

export interface DayPerformance {
  key: string;
  /** Short axis label, e.g. "Mon". */
  label: string;
  planned: number;
  completed: number;
  /** `null` when nothing was planned that day — render "—". */
  rate: number | null;
  studySeconds: number;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayPerformance(
  targets: readonly Target[],
  sessions: readonly StudySession[],
  keys: readonly string[],
): DayPerformance[] {
  const study = studySecondsByKey(sessions);
  return keys.map((key) => {
    const planned = targets.filter((t) => t.period === "daily" && t.targetDate === key);
    const completed = planned.filter((t) => t.completed).length;
    const date = keyToDate(key);
    return {
      key,
      label: WEEKDAY_LABELS[date.getDay()],
      planned: planned.length,
      completed,
      rate: successRate(planned.length, completed),
      studySeconds: study.get(key) ?? 0,
    };
  });
}

export interface PeriodSuccess {
  planned: number;
  completed: number;
  rate: number | null;
}

/**
 * Weekly success as total completed / total planned × 100 — never an average
 * of daily percentages, which would let a 1/1 day outweigh a 9/10 day.
 */
export function successBetween(
  targets: readonly Target[],
  fromKey: string,
  toKey: string,
): PeriodSuccess {
  const planned = targets.filter(
    (t) => t.period === "daily" && t.targetDate && t.targetDate >= fromKey && t.targetDate <= toKey,
  );
  const completed = planned.filter((t) => t.completed).length;
  return {
    planned: planned.length,
    completed,
    rate: successRate(planned.length, completed),
  };
}

export function weekSuccess(
  targets: readonly Target[],
  now = new Date(),
): PeriodSuccess {
  const monday = mondayKey(now);
  return successBetween(targets, monday, localDayKey(now));
}

/** Previous complete Monday→Sunday window. */
export function previousWeekSuccess(
  targets: readonly Target[],
  now = new Date(),
): PeriodSuccess {
  const monday = mondayKey(now);
  return successBetween(targets, shiftKey(monday, -7), shiftKey(monday, -1));
}

/**
 * Percentage-point change between two rates.
 *
 * `null` unless *both* periods had at least one planned target — otherwise
 * there is nothing to compare and the UI shows "—".
 */
export function growthPoints(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

export function formatPoints(points: number | null): string | null {
  if (points === null) return null;
  const sign = points > 0 ? "+" : "";
  return `${sign}${points} pts`;
}

/** "12h 45m" / "45m" / "—" when there is genuinely nothing to show. */
export function formatStudyTime(seconds: number): string {
  if (seconds <= 0) return "0m";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export function formatStudyTimeOrNull(seconds: number): string | null {
  return seconds > 0 ? formatStudyTime(seconds) : null;
}
