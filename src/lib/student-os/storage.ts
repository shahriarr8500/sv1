/**
 * Persistence layer.
 *
 * Version 1 stores everything in localStorage. The repository interface keeps
 * the door open for migrating to a database later: only this file would
 * change — the provider and UI stay untouched.
 */

import type { StudentProfile } from "./types";

export interface StudentOSState {
  version: 1;
  profile: StudentProfile | null;
  /** itemId → completion timestamp (ms). */
  completions: Record<string, number>;
}

export interface StudentOSRepository {
  load(): StudentOSState;
  save(state: StudentOSState): void;
}

const STORAGE_KEY = "student-os:v1";

function emptyState(): StudentOSState {
  return { version: 1, profile: null, completions: {} };
}

function load(): StudentOSState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<StudentOSState>;
    return {
      version: 1,
      profile: parsed.profile ?? null,
      completions:
        parsed.completions && typeof parsed.completions === "object"
          ? parsed.completions
          : {},
    };
  } catch {
    // Corrupt or unavailable storage — start clean rather than crash.
    return emptyState();
  }
}

function save(state: StudentOSState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode) — the app keeps working in memory.
  }
}

export const repository: StudentOSRepository = { load, save };
