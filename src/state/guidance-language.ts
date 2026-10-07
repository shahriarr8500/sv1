/**
 * Guidance language preference — English / বাংলা for the Daily Guidance
 * card only. Kept out of the profile so it never blocks onboarding or
 * requires a network round-trip.
 */

import { useSyncExternalStore } from "react";
import type { GuidanceLanguage } from "@/lib/student-os/quran";

const STORAGE_KEY = "student-os:guidance-language";
const listeners = new Set<() => void>();

function read(): GuidanceLanguage {
  try {
    return localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

let value: GuidanceLanguage = read();

export function getGuidanceLanguage(): GuidanceLanguage {
  return value;
}

export function setGuidanceLanguage(next: GuidanceLanguage): void {
  if (value === next) return;
  value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage is optional — the choice still applies for this session */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGuidanceLanguage(): GuidanceLanguage {
  return useSyncExternalStore(
    subscribe,
    getGuidanceLanguage,
    () => "en" as GuidanceLanguage,
  );
}
