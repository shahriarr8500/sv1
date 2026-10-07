/**
 * Gamification — XP, levels, streaks and achievements.
 *
 * Everything here derives from, or is led by, real stored activity:
 *   - XP is only ever added by `awardTargetXp` / `awardSessionXp`, both
 *     idempotent (keyed by target id / session id), so toggling a mission on
 *     and off can never farm XP.
 *   - Streaks are computed from recorded study sessions, never from merely
 *     opening the app.
 *   - Achievements are derived from those same records — never stored as a
 *     hand-written "unlocked" list, so a fake unlock is impossible.
 *
 * Stored separately from `student-os:v1` in `student-os:gamification:v1`
 * with defensive parsing: malformed JSON can never crash the app.
 */

import type { Target } from "./target-model";
import type { StudySession } from "./study-log";

export const GAMIFICATION_KEY = "student-os:gamification:v1";

export interface GamificationState {
  version: 1;
  /** Total XP ever earned. Monotonically increasing. */
  xp: number;
  /** Target ids that have already paid out — blocks toggle farming. */
  awardedTargetIds: string[];
  /** Study session ids that have already paid out — blocks double awards. */
  awardedSessionIds: string[];
}

export function emptyGamification(): GamificationState {
  return { version: 1, xp: 0, awardedTargetIds: [], awardedSessionIds: [] };
}

export function loadGamification(): GamificationState {
  try {
    const raw = window.localStorage.getItem(GAMIFICATION_KEY);
    if (!raw) return emptyGamification();
    const parsed = JSON.parse(raw) as Partial<GamificationState>;
    return {
      version: 1,
      xp: typeof parsed.xp === "number" && Number.isFinite(parsed.xp) && parsed.xp >= 0 ? parsed.xp : 0,
      awardedTargetIds: Array.isArray(parsed.awardedTargetIds)
        ? parsed.awardedTargetIds.filter((id): id is string => typeof id === "string")
        : [],
      awardedSessionIds: Array.isArray(parsed.awardedSessionIds)
        ? parsed.awardedSessionIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return emptyGamification();
  }
}

export function saveGamification(state: GamificationState): void {
  try {
    window.localStorage.setItem(GAMIFICATION_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode) — keep working in memory.
  }
}

/* -------------------------------------------------------------------------- */
/* XP rules                                                                   */
/* -------------------------------------------------------------------------- */

/** A normal mission. Small tasks land below this, large ones above. */
export const BASE_MISSION_XP = 25;

/**
 * XP for a syllabus item, derived from how big the task actually is.
 *
 * Chapter-level syllabi (Higher Mathematics: one item = one whole chapter)
 * are large tasks. Numbered/page-range items scale with how much the subject
 * holds, so a 178-item Physics subject is worth more than a 52-item Biology.
 */
export function xpForSubject(subject: { totalItems: number; chapters: readonly { items: readonly unknown[] }[] }): number {
  const chapterLevel = subject.totalItems === subject.chapters.length;
  if (chapterLevel) return 40;
  const n = subject.totalItems;
  if (n >= 150) return BASE_MISSION_XP;
  if (n >= 60) return 20;
  if (n >= 30) return 15;
  return 10;
}

/** XP for a finished study session: ~0.6 XP per minute, floored and capped. */
export function xpForStudySession(durationSeconds: number): number {
  if (durationSeconds < 60) return 0; // too short to be real study
  const minutes = durationSeconds / 60;
  return Math.min(200, Math.max(5, Math.round(minutes * 0.6)));
}

/* -------------------------------------------------------------------------- */
/* Levels                                                                     */
/* -------------------------------------------------------------------------- */

/** 1,000 XP total by level 5, accelerating gently after that. */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let n = 1; n < level; n++) total += 200 + (n - 1) * 50;
  return total;
}

export interface LevelProgress {
  level: number;
  /** XP inside the current level. */
  current: number;
  /** XP needed to finish the current level. */
  needed: number;
  percent: number;
  /** XP still required to reach the next level. */
  remaining: number;
}

export function levelProgress(xp: number): LevelProgress {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= safeXp) level += 1;
  const floor = xpRequiredForLevel(level);
  const ceiling = xpRequiredForLevel(level + 1);
  const current = safeXp - floor;
  const needed = ceiling - floor;
  return {
    level,
    current,
    needed,
    percent: needed === 0 ? 0 : Math.min(100, Math.round((current / needed) * 100)),
    remaining: Math.max(0, ceiling - safeXp),
  };
}

/* -------------------------------------------------------------------------- */
/* Streak                                                                     */
/* -------------------------------------------------------------------------- */

/** Local YYYY-MM-DD for a timestamp. */
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Days that count toward the streak: at least `minSeconds` of *real* recorded
 * study on that day. Opening the app never qualifies.
 */
export function activeStudyDays(sessions: readonly StudySession[], minSeconds = 60): Set<string> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    if (session.mode !== "study") continue;
    const key = dayKey(session.startedAt);
    totals.set(key, (totals.get(key) ?? 0) + session.durationSeconds);
  }
  const days = new Set<string>();
  for (const [key, seconds] of totals) if (seconds >= minSeconds) days.add(key);
  return days;
}

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Consecutive active days ending today.
 *
 * If today has no study yet, yesterday's streak is still alive (the day is not
 * over) — so the count rolls back one day before giving up.
 */
export function currentStreak(sessions: readonly StudySession[], now = new Date()): number {
  const days = activeStudyDays(sessions);
  if (days.size === 0) return 0;
  let cursor = dayKey(now.getTime());
  if (!days.has(cursor)) {
    cursor = shiftDay(cursor, -1);
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/* -------------------------------------------------------------------------- */
/* Achievements — all derived, never hand-written                              */
/* -------------------------------------------------------------------------- */

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** 0–1 progress, for the locked state. */
  progress: number;
  /** Human progress label, e.g. "3 / 10". */
  progressLabel: string;
}

export interface AchievementInput {
  targets: readonly Target[];
  sessions: readonly StudySession[];
}

export function computeAchievements({ targets, sessions }: AchievementInput): Achievement[] {
  const study = sessions.filter((s) => s.mode === "study");
  const completedMissions = targets.filter((t) => t.completed).length;
  const streak = currentStreak(sessions);
  const totalSeconds = study.reduce((sum, s) => sum + s.durationSeconds, 0);
  const hours = totalSeconds / 3600;
  const perfectDays = countPerfectDays(targets);

  return [
    {
      id: "first-mission",
      title: "First Mission",
      description: "Complete your first target.",
      unlocked: completedMissions >= 1,
      progress: Math.min(1, completedMissions),
      progressLabel: `${Math.min(completedMissions, 1)} / 1`,
    },
    {
      id: "ten-missions",
      title: "10 Missions",
      description: "Complete 10 targets.",
      unlocked: completedMissions >= 10,
      progress: Math.min(1, completedMissions / 10),
      progressLabel: `${Math.min(completedMissions, 10)} / 10`,
    },
    {
      id: "seven-day-streak",
      title: "7 Day Streak",
      description: "Study for 7 consecutive days.",
      unlocked: streak >= 7,
      progress: Math.min(1, streak / 7),
      progressLabel: `${Math.min(streak, 7)} / 7`,
    },
    {
      id: "ten-hours",
      title: "10 Hours",
      description: "Study for 10 total hours.",
      unlocked: hours >= 10,
      progress: Math.min(1, hours / 10),
      progressLabel: `${Math.min(hours, 10).toFixed(1).replace(/\.0$/, "")} / 10h`,
    },
    {
      id: "perfect-day",
      title: "Perfect Day",
      description: "Complete every target planned for a day.",
      unlocked: perfectDays >= 1,
      progress: Math.min(1, perfectDays),
      progressLabel: `${Math.min(perfectDays, 1)} / 1`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Perfect day                                                                */
/* -------------------------------------------------------------------------- */

/** Dates where every planned mission was finished, and at least one existed. */
export function perfectDayKeys(targets: readonly Target[]): Set<string> {
  const planned = new Map<string, { total: number; done: number }>();
  for (const target of targets) {
    if (target.period !== "daily" || !target.targetDate) continue;
    const entry = planned.get(target.targetDate) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (target.completed) entry.done += 1;
    planned.set(target.targetDate, entry);
  }
  const days = new Set<string>();
  for (const [key, entry] of planned) {
    if (entry.total > 0 && entry.done === entry.total) days.add(key);
  }
  return days;
}

export function countPerfectDays(targets: readonly Target[]): number {
  return perfectDayKeys(targets).size;
}
