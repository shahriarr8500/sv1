/**
 * Reading preferences for the Quran page.
 *
 * Pure data + validation so the values can be clamped and tested without a
 * browser. The store that reads and writes them lives in `@/state/quran-prefs`.
 */

import { DEFAULT_TRANSLATION, TRANSLATIONS } from "@/lib/student-os/quran";

export type QuranLayout = "comfortable" | "compact";

export interface QuranPrefs {
  /** English translation edition id. Arabic never changes. */
  translation: string;
  /** Arabic font size in px. */
  arabicSize: number;
  /** Translation font size in px. */
  translationSize: number;
  /** Arabic line-height multiplier. */
  lineHeight: number;
  showTranslation: boolean;
  showTransliteration: boolean;
  autoScroll: boolean;
  highlightAyah: boolean;
  layout: QuranLayout;
}

export const ARABIC_SIZE_RANGE = { min: 22, max: 46 } as const;
export const TRANSLATION_SIZE_RANGE = { min: 12, max: 20 } as const;
export const LINE_HEIGHT_RANGE = { min: 1.6, max: 3 } as const;

export const DEFAULT_QURAN_PREFS: QuranPrefs = {
  translation: DEFAULT_TRANSLATION,
  arabicSize: 30,
  translationSize: 15,
  lineHeight: 2.15,
  showTranslation: true,
  showTransliteration: false,
  autoScroll: true,
  highlightAyah: true,
  layout: "comfortable",
};

export const QURAN_PREFS_KEY = "student-os:quran-prefs:v1";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function isTranslationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    TRANSLATIONS.some((edition) => edition.id === value)
  );
}

/** Coerces anything read from storage into a usable, in-range preference set. */
export function normalizeQuranPrefs(value: unknown): QuranPrefs {
  if (typeof value !== "object" || value === null)
    return { ...DEFAULT_QURAN_PREFS };
  const raw = value as Record<string, unknown>;
  return {
    translation: isTranslationId(raw.translation)
      ? raw.translation
      : DEFAULT_QURAN_PREFS.translation,
    arabicSize: Math.round(
      clamp(
        numberOr(raw.arabicSize, DEFAULT_QURAN_PREFS.arabicSize),
        ARABIC_SIZE_RANGE.min,
        ARABIC_SIZE_RANGE.max,
      ),
    ),
    translationSize: Math.round(
      clamp(
        numberOr(raw.translationSize, DEFAULT_QURAN_PREFS.translationSize),
        TRANSLATION_SIZE_RANGE.min,
        TRANSLATION_SIZE_RANGE.max,
      ),
    ),
    lineHeight: clamp(
      numberOr(raw.lineHeight, DEFAULT_QURAN_PREFS.lineHeight),
      LINE_HEIGHT_RANGE.min,
      LINE_HEIGHT_RANGE.max,
    ),
    showTranslation: booleanOr(
      raw.showTranslation,
      DEFAULT_QURAN_PREFS.showTranslation,
    ),
    showTransliteration: booleanOr(
      raw.showTransliteration,
      DEFAULT_QURAN_PREFS.showTransliteration,
    ),
    autoScroll: booleanOr(raw.autoScroll, DEFAULT_QURAN_PREFS.autoScroll),
    highlightAyah: booleanOr(
      raw.highlightAyah,
      DEFAULT_QURAN_PREFS.highlightAyah,
    ),
    layout: raw.layout === "compact" ? "compact" : "comfortable",
  };
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function readQuranPrefs(storage?: ReadableStorage): QuranPrefs {
  try {
    const source =
      storage ??
      (typeof window === "undefined" ? undefined : window.localStorage);
    if (!source) return { ...DEFAULT_QURAN_PREFS };
    const raw = source.getItem(QURAN_PREFS_KEY);
    if (!raw) return { ...DEFAULT_QURAN_PREFS };
    return normalizeQuranPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_QURAN_PREFS };
  }
}

export function writeQuranPrefs(
  prefs: QuranPrefs,
  storage?: WritableStorage,
): void {
  try {
    const target =
      storage ??
      (typeof window === "undefined" ? undefined : window.localStorage);
    target?.setItem(QURAN_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage is optional — preferences fall back to the in-memory store.
  }
}

/** One-line summary of the current typography, used on the settings trigger. */
export function describePrefs(prefs: QuranPrefs): string {
  const parts = [`Arabic ${prefs.arabicSize}px`];
  if (prefs.showTranslation)
    parts.push(`Translation ${prefs.translationSize}px`);
  return parts.join(" · ");
}
