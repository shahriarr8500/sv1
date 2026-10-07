const KEY = "student-os:gamification:v1";

export interface GamificationState {
  xp: number;
  level: number;
  lastActiveDate: string | null;
  unlockedAchievements: string[];
}

export const EMPTY_GAMIFICATION: GamificationState = {
  xp: 0,
  level: 1,
  lastActiveDate: null,
  unlockedAchievements: [],
};

function loadState(): GamificationState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_GAMIFICATION };
    const parsed = JSON.parse(raw) as Partial<GamificationState>;
    return {
      xp: typeof parsed.xp === "number" ? parsed.xp : 0,
      level: typeof parsed.level === "number" ? parsed.level : 1,
      lastActiveDate:
        typeof parsed.lastActiveDate === "string" ? parsed.lastActiveDate : null,
      unlockedAchievements:
        Array.isArray(parsed.unlockedAchievements)
          ? parsed.unlockedAchievements
          : [],
    };
  } catch {
    return { ...EMPTY_GAMIFICATION };
  }
}

function saveState(state: GamificationState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked — app still works in memory.
  }
}

const XP_PER_LEVEL = 250;

export function xpForLevel(level: number): number {
  return XP_PER_LEVEL * (level - 1);
}

export function xpToNextLevel(level: number): number {
  return xpForLevel(level + 1) - xpForLevel(level);
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function progressInLevel(xp: number, level: number): { current: number; max: number; percent: number } {
  const max = xpForLevel(level + 1) - xpForLevel(level);
  const current = Math.max(0, xp - xpForLevel(level));
  return { current, max, percent: max > 0 ? Math.round((current / max) * 100) : 0 };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function previousDayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeStreak(state: GamificationState, studyDays: Set<string>): number {
  if (state.lastActiveDate === null) return 0;

  const ordered = Array.from(studyDays).sort().reverse();
  if (ordered.length === 0) return 0;
  if (ordered[0] !== state.lastActiveDate && ordered[0] !== todayKey()) return 0;

  let streak = 0;
  let cursor: string | null = state.lastActiveDate;
  if (cursor !== todayKey() && cursor !== previousDayKey()) return 0;

  const indexByDate = new Map(ordered.map((d, i) => [d, i]));
  while (cursor !== null && indexByDate.has(cursor)) {
    streak++;
    const [y, m, d] = cursor.split("-").map(Number);
    const prev = new Date(y, m - 1, d - 1);
    cursor = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
  }
  return streak;
}

export function studyDaysFromSessions(sessions: Array<{ startedAt: number }>): Set<string> {
  const days = new Set<string>();
  for (const session of sessions) {
    const d = new Date(session.startedAt);
    days.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return days;
}

export function addXp(state: GamificationState, amount: number): GamificationState {
  const xp = state.xp + amount;
  const level = levelFromXp(xp);
  return { ...state, xp, level };
}

export function recordActivity(state: GamificationState, studyDays: Set<string>): GamificationState {
  const today = todayKey();
  const next: GamificationState = { ...state };
  if (studyDays.has(today) || studyDays.has(previousDayKey())) {
    next.lastActiveDate = today;
  }
  return next;
}

export function unlockAchievement(state: GamificationState, id: string): GamificationState {
  if (state.unlockedAchievements.includes(id)) return state;
  return { ...state, unlockedAchievements: [...state.unlockedAchievements, id] };
}

export function achievementsFromState(state: GamificationState): readonly Achievement[] {
  return ACHIEVEMENTS.filter((a) => state.unlockedAchievements.includes(a.id));
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-mission",
    title: "First Mission",
    description: "Complete your first target.",
  },
  {
    id: "ten-missions",
    title: "10 Missions",
    description: "Complete 10 targets.",
  },
  {
    id: "seven-day-streak",
    title: "7 Day Streak",
    description: "Build a 7-day study streak.",
  },
  {
    id: "ten-hours",
    title: "10 Hours",
    description: "Study for 10 total hours.",
  },
  {
    id: "perfect-day",
    title: "Perfect Day",
    description: "Complete every target planned for a day.",
  },
];

export { ACHIEVEMENTS };
