/**
 * Target store — keeps targets alongside the existing local state on the same
 * key, so nothing is migrated and existing progress is untouched.
 *
 * Targets are read/written on their own localStorage key so the existing
 * completions key is never touched and previously saved progress survives.
 */

import type { Target } from "./target-model";
import { BASE_MISSION_XP } from "./gamification";

export interface TargetsState {
  targets: Target[];
}

export const TARGETS_KEY = "student-os:targets:v1";

function emptyTargets(): TargetsState {
  return { targets: [] };
}

/**
 * Defensive normalisation. A record that is not shaped like a Target is
 * dropped rather than rendered, and a missing/invalid XP value falls back to
 * the standard mission reward — malformed storage can never crash the app.
 */
function normalizeTarget(raw: unknown): Target | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<Target>;
  if (typeof t.id !== "string" || typeof t.syllabusItemId !== "string") return null;
  if (t.period !== "daily" && t.period !== "weekly") return null;
  const xp =
    typeof t.xp === "number" && Number.isFinite(t.xp) && t.xp > 0
      ? Math.round(t.xp)
      : BASE_MISSION_XP;
  return {
    id: t.id,
    syllabusItemId: t.syllabusItemId,
    period: t.period,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    completed: t.completed === true,
    completedAt: typeof t.completedAt === "number" ? t.completedAt : undefined,
    targetDate: typeof t.targetDate === "string" ? t.targetDate : undefined,
    weekStart: typeof t.weekStart === "string" ? t.weekStart : undefined,
    xp,
  };
}

function loadTargets(): TargetsState {
  try {
    const raw = window.localStorage.getItem(TARGETS_KEY);
    if (!raw) return emptyTargets();
    const parsed = JSON.parse(raw) as Partial<TargetsState>;
    if (!Array.isArray(parsed.targets)) return emptyTargets();
    return { targets: parsed.targets.map(normalizeTarget).filter((t): t is Target => t !== null) };
  } catch {
    return emptyTargets();
  }
}

function saveTargets(state: TargetsState): void {
  try {
    window.localStorage.setItem(TARGETS_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode) — the app keeps working in memory.
  }
}

export const targetStore = {
  load: loadTargets,
  save: saveTargets,
  empty: emptyTargets,
};
