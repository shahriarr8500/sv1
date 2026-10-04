/**
 * Study log — recorded study and rest sessions plus the aggregations behind
 * daily, monthly, and yearly progress.
 *
 * Persistence mirrors the other repositories: versioned localStorage behind
 * an interface, ready to be swapped for a database later.
 */

import { format } from "date-fns";

export type TimerMode = "study" | "rest";
export type TimerSource = "stopwatch" | "countdown";

export interface StudySession {
  id: string;
  mode: TimerMode;
  /** "stopwatch" = started and stopped manually; "countdown" = ran to zero. */
  source: TimerSource;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

export interface ActiveTimer {
  mode: TimerMode;
  source: TimerSource;
  startedAt: number;
  /** Set for countdown timers; absent for free counts. */
  targetSeconds?: number;
}

export interface StudyLogState {
  version: 1;
  /** Newest first. */
  sessions: StudySession[];
  /** The timer currently running, if any (survives refresh). */
  active: ActiveTimer | null;
}

export interface StudyLogRepository {
  load(): StudyLogState;
  save(state: StudyLogState): void;
}

const STORAGE_KEY = "student-os:study-log:v1";

function emptyState(): StudyLogState {
  return { version: 1, sessions: [], active: null };
}

function load(): StudyLogState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<StudyLogState>;
    return {
      version: 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      active:
        parsed.active && typeof parsed.active === "object"
          ? parsed.active
          : null,
    };
  } catch {
    return emptyState();
  }
}

function save(state: StudyLogState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — the app keeps working in memory.
  }
}

export const studyLogRepository: StudyLogRepository = { load, save };

/* ------------------------------- Formatting ------------------------------ */

/** 8250 → "2h 17m"; 2700 → "45m"; 40 → "40s". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${rest}s`;
}

/** 8250 → "2:17:30"; 1170 → "19:30". */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* --------------------------------- Stats --------------------------------- */

export function dayKey(timestamp: number): string {
  return format(timestamp, "yyyy-MM-dd");
}

export function monthKey(timestamp: number): string {
  return format(timestamp, "yyyy-MM");
}

export function yearKey(timestamp: number): string {
  return format(timestamp, "yyyy");
}

export function totalSeconds(sessions: StudySession[]): number {
  return sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
}

export function groupByDay(sessions: StudySession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    const key = dayKey(session.startedAt);
    map.set(key, (map.get(key) ?? 0) + session.durationSeconds);
  }
  return map;
}

export function groupByMonth(sessions: StudySession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    const key = monthKey(session.startedAt);
    map.set(key, (map.get(key) ?? 0) + session.durationSeconds);
  }
  return map;
}

export interface SeriesPoint {
  /** Short axis label, e.g. "14" or "Nov". */
  label: string;
  /** Full label for tooltips, e.g. "Sat 14 Oct 2026". */
  sub: string;
  seconds: number;
  current: boolean;
}

/** Last `days` days, oldest → newest, with today marked current. */
export function dailySeries(
  dayTotals: Map<string, number>,
  days: number,
  now = new Date(),
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let index = days - 1; index >= 0; index--) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    const key = format(date, "yyyy-MM-dd");
    points.push({
      label: format(date, "d"),
      sub: format(date, "EEE d MMM yyyy"),
      seconds: dayTotals.get(key) ?? 0,
      current: index === 0,
    });
  }
  return points;
}

/** Last `months` months, oldest → newest, with the current month marked. */
export function monthlySeries(
  monthTotals: Map<string, number>,
  months: number,
  now = new Date(),
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let index = months - 1; index >= 0; index--) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = format(date, "yyyy-MM");
    points.push({
      label: format(date, "MMM"),
      sub: format(date, "MMMM yyyy"),
      seconds: monthTotals.get(key) ?? 0,
      current: index === 0,
    });
  }
  return points;
}

const YEAR_MONTH_LABELS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];

/** January → December for one year. */
export function monthsOfYear(
  monthTotals: Map<string, number>,
  year: string,
): SeriesPoint[] {
  return YEAR_MONTH_LABELS.map((label, monthIndex) => {
    const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    return {
      label,
      sub: format(new Date(Number(year), monthIndex, 1), "MMMM yyyy"),
      seconds: monthTotals.get(key) ?? 0,
      current:
        key === format(new Date(), "yyyy-MM"),
    };
  });
}

/** Distinct years with recorded study time, newest first. */
export function yearsWithStudyTime(sessions: StudySession[]): string[] {
  const years = new Set(sessions.map((session) => yearKey(session.startedAt)));
  return Array.from(years).sort().reverse();
}
