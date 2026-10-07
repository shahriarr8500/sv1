/**
 * Celebration store — a short, self-dismissing feedback pulse.
 *
 * Kept in `state/` so the component file exports only components (and so
 * fast refresh keeps working). Timed at ~1.4s: long enough to read
 * "+25 XP", short enough that the student never waits for it.
 *
 * Reserved for moments that deserve it — a target, a full mission list, a
 * level up, a perfect day. Not every click.
 */

import { useSyncExternalStore } from "react";

export type CelebrationKind = "target" | "mission" | "level" | "perfect";

export interface Celebration {
  id: number;
  kind: CelebrationKind;
  title: string;
  /** e.g. "Physics 1.4" */
  detail?: string;
  xp?: number;
  /** e.g. "Streak: 7 days" */
  note?: string;
}

const AUTO_DISMISS_MS = 1400;

let current: Celebration | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function clear(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  current = null;
  emit();
}

export function celebrate(input: Omit<Celebration, "id">): void {
  if (timer !== null) window.clearTimeout(timer);
  current = { ...input, id: Date.now() };
  timer = window.setTimeout(clear, AUTO_DISMISS_MS);
  emit();
}

export function dismissCelebration(): void {
  clear();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCelebration(): Celebration | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
