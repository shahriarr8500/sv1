/**
 * Target store — keeps targets alongside the existing local state on the same
 * key, so nothing is migrated and existing progress is untouched.
 *
 * Targets are read/written on their own localStorage key so the existing
 * completions key is never touched and previously saved progress survives.
 */

import type { Target } from "./target-model";

export interface TargetsState {
  targets: Target[];
}

export const TARGETS_KEY = "student-os:targets:v1";

function emptyTargets(): TargetsState {
  return { targets: [] };
}

function loadTargets(): TargetsState {
  try {
    const raw = window.localStorage.getItem(TARGETS_KEY);
    if (!raw) return emptyTargets();
    const parsed = JSON.parse(raw) as Partial<TargetsState>;
    const targets = Array.isArray(parsed.targets) ? parsed.targets : [];
    return { targets };
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
