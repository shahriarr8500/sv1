/**
 * Surah text store.
 *
 * Each Surah + translation pair is fetched once, then served from memory (and
 * from a small localStorage cache) so switching between Surahs — or leaving
 * and re-entering the page — never downloads the same text twice.
 *
 * State lives in this module rather than in component state so a cached Surah
 * renders on the very first paint of the page, with no loading flash.
 */

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { SURAHS, getTranslation } from "@/lib/student-os/quran";
import {
  fetchSurahIndex,
  fetchSurahText,
  type SurahMeta,
  type SurahText,
} from "@/lib/student-os/quran-text";

type Status = "idle" | "loading" | "ready" | "error";

export interface SurahTextEntry {
  status: Status;
  text?: SurahText;
  error?: string;
}

export interface SurahIndexEntry {
  status: Status;
  metas: SurahMeta[];
  error?: string;
}

const IDLE_TEXT: SurahTextEntry = { status: "idle" };
const CACHE_PREFIX = "student-os:quran:text:v1";
const CACHE_INDEX_KEY = "student-os:quran:text:v1:index";
const META_KEY = "student-os:quran:meta:v1";
const MAX_CACHED_SURAHS = 8;

const textEntries = new Map<string, SurahTextEntry>();
const inFlight = new Map<string, AbortController>();
const listeners = new Set<() => void>();

/** Lists every Surah from the local table so the panel never waits on network. */
const FALLBACK_METAS: SurahMeta[] = SURAHS.map((surah) => ({
  number: surah.number,
  arabicName: "",
  englishName: surah.name,
  englishNameTranslation: "",
  ayahCount: surah.ayahs,
  revelation: "",
}));

let indexEntry: SurahIndexEntry = { status: "idle", metas: FALLBACK_METAS };
let indexInFlight = false;

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function textKey(surah: number, translation: string): string {
  return `${surah}:${translation}`;
}

/* -------------------------------------------------------------------------- */
/* localStorage cache                                                          */
/* -------------------------------------------------------------------------- */

function cacheKeyFor(key: string): string {
  return `${CACHE_PREFIX}:${key}`;
}

function readCachedText(key: string): SurahText | undefined {
  try {
    const raw = localStorage.getItem(cacheKeyFor(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { ayahs?: unknown; surah?: unknown };
    if (!Array.isArray(parsed.ayahs) || parsed.ayahs.length === 0)
      return undefined;
    return parsed as SurahText;
  } catch {
    return undefined;
  }
}

function writeCachedText(key: string, text: SurahText): void {
  try {
    const order = readCacheOrder().filter((entry) => entry !== key);
    order.push(key);
    while (order.length > MAX_CACHED_SURAHS) {
      const evicted = order.shift();
      if (evicted) localStorage.removeItem(cacheKeyFor(evicted));
    }
    localStorage.setItem(cacheKeyFor(key), JSON.stringify(text));
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(order));
  } catch {
    // Full or unavailable storage: reading still works, it just re-fetches.
  }
}

function readCacheOrder(): string[] {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function readCachedIndex(): SurahMeta[] | undefined {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 114) return undefined;
    return parsed as SurahMeta[];
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Surah text                                                                  */
/* -------------------------------------------------------------------------- */

export function ensureSurahText(surah: number, translation: string): void {
  const key = textKey(surah, translation);
  const entry = textEntries.get(key);
  if (entry && (entry.status === "ready" || entry.status === "loading")) return;
  if (inFlight.has(key)) return;

  const cached = readCachedText(key);
  if (cached) {
    textEntries.set(key, { status: "ready", text: cached });
    notify();
    return;
  }

  const controller = new AbortController();
  inFlight.set(key, controller);
  textEntries.set(key, { status: "loading" });
  notify();

  fetchSurahText(surah, getTranslation(translation), controller.signal)
    .then((text) => {
      textEntries.set(key, { status: "ready", text });
      writeCachedText(key, text);
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;
      textEntries.set(key, {
        status: "error",
        error:
          error instanceof Error && error.message
            ? error.message
            : "This Surah could not be loaded. Please try again.",
      });
    })
    .finally(() => {
      inFlight.delete(key);
      if (!controller.signal.aborted) notify();
    });
}

export function retrySurahText(surah: number, translation: string): void {
  const key = textKey(surah, translation);
  textEntries.delete(key);
  ensureSurahText(surah, translation);
}

export function useSurahText(
  surah: number,
  translation: string,
): SurahTextEntry {
  const key = textKey(surah, translation);
  useEffect(() => {
    ensureSurahText(surah, translation);
  }, [surah, translation]);

  return useSyncExternalStore(
    subscribe,
    () => textEntries.get(key) ?? IDLE_TEXT,
    () => textEntries.get(key) ?? IDLE_TEXT,
  );
}

/* -------------------------------------------------------------------------- */
/* Surah index (Arabic names, revelation place)                                */
/* -------------------------------------------------------------------------- */

export function ensureSurahIndex(): void {
  if (indexEntry.status === "ready" || indexInFlight) return;

  const cached = readCachedIndex();
  if (cached) {
    indexEntry = { status: "ready", metas: cached };
    notify();
    return;
  }

  indexInFlight = true;
  indexEntry = { status: "loading", metas: FALLBACK_METAS };
  notify();

  fetchSurahIndex()
    .then((metas) => {
      indexEntry = { status: "ready", metas };
      try {
        localStorage.setItem(META_KEY, JSON.stringify(metas));
      } catch {
        /* storage is optional */
      }
    })
    .catch(() => {
      // The English names in the local table stay usable, so this is a soft
      // failure: the Arabic names and revelation place simply stay hidden.
      indexEntry = {
        status: "error",
        metas: FALLBACK_METAS,
        error: "Arabic names unavailable",
      };
    })
    .finally(() => {
      indexInFlight = false;
      notify();
    });
}

export function useSurahIndex(): SurahIndexEntry {
  useEffect(() => {
    ensureSurahIndex();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => indexEntry,
    () => indexEntry,
  );
}

export function getSurahMeta(number: number): SurahMeta | undefined {
  return indexEntry.metas.find((meta) => meta.number === number);
}
