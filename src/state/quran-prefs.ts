/**
 * Reading-preference store.
 *
 * A tiny external store rather than context state: the settings sheet, the
 * ayah list and the audio bar all read the same values, and a change must be
 * visible instantly without threading props through the whole page.
 */

import { useSyncExternalStore } from "react";
import {
  DEFAULT_QURAN_PREFS,
  normalizeQuranPrefs,
  readQuranPrefs,
  writeQuranPrefs,
  type QuranPrefs,
} from "@/lib/student-os/quran-prefs";

let snapshot: QuranPrefs = readQuranPrefs();

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQuranPrefs(): QuranPrefs {
  return snapshot;
}

export function useQuranPrefs(): QuranPrefs {
  return useSyncExternalStore(subscribe, getQuranPrefs, getQuranPrefs);
}

export function updateQuranPrefs(patch: Partial<QuranPrefs>): void {
  snapshot = normalizeQuranPrefs({ ...snapshot, ...patch });
  writeQuranPrefs(snapshot);
  notify();
}

export function resetQuranPrefs(): void {
  snapshot = normalizeQuranPrefs({ ...DEFAULT_QURAN_PREFS });
  writeQuranPrefs(snapshot);
  notify();
}
