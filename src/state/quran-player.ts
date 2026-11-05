/**
 * The one Quran audio element for the whole app.
 *
 * Playback is addressed **per Ayah**, not per Surah: every Ayah has its own
 * file on the Islamic Network CDN, so "which Ayah is playing" is a fact the
 * player knows exactly — it is the file it loaded. Nothing here interpolates
 * or guesses a timestamp, which is why the reading highlight can follow real
 * recitation instead of an estimate.
 *
 * A single module-level `<audio>` element keeps the floating player, the
 * reading page and any future surface in sync and makes double playback
 * impossible.
 */

import { useSyncExternalStore } from "react";
import {
  DEFAULT_RECITER,
  RECITERS,
  SURAHS,
  ayahAudioUrl,
  ayahCount,
  getReciter,
} from "@/lib/student-os/quran";

export interface QuranPlayerState {
  surah: number;
  /** Ayah currently loaded — the same Ayah the highlight marks. */
  ayah: number;
  playing: boolean;
  loading: boolean;
  /** Position inside the current Ayah. */
  currentTime: number;
  /** Duration of the current Ayah. */
  duration: number;
  volume: number;
  muted: boolean;
  expanded: boolean;
  error: string | null;
  rate: number;
  reciter: string;
  repeatAyah: boolean;
  repeatSurah: boolean;
  continueNextSurah: boolean;
}

const VOLUME_KEY = "student-os:quran-volume";
const STATE_KEY = "student-os:quran-player:v2";
const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

interface StoredState {
  surah: number;
  ayah: number;
  reciter: string;
  rate: number;
  expanded: boolean;
}

function clampSurah(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(1, Math.round(value)), SURAHS.length);
}

function clampAyah(surah: number, value: number): number {
  const total = Math.max(1, ayahCount(surah));
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(1, Math.round(value)), total);
}

function readVolume(): number {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored === null || stored.trim() === "") return 0.8;
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.8;
  } catch {
    return 0.8;
  }
}

function readStoredState(): StoredState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw)
      return {
        surah: 1,
        ayah: 1,
        reciter: DEFAULT_RECITER,
        rate: 1,
        expanded: false,
      };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const surah = clampSurah(Number(parsed.surah));
    const reciter =
      typeof parsed.reciter === "string" &&
      RECITERS.some((entry) => entry.id === parsed.reciter)
        ? parsed.reciter
        : DEFAULT_RECITER;
    const rate =
      typeof parsed.rate === "number" &&
      (RATES as readonly number[]).includes(parsed.rate)
        ? parsed.rate
        : 1;
    return {
      surah,
      ayah: clampAyah(surah, Number(parsed.ayah)),
      reciter,
      rate,
      expanded: parsed.expanded === true,
    };
  } catch {
    return {
      surah: 1,
      ayah: 1,
      reciter: DEFAULT_RECITER,
      rate: 1,
      expanded: false,
    };
  }
}

function persist(): void {
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        surah: snapshot.surah,
        ayah: snapshot.ayah,
        reciter: snapshot.reciter,
        rate: snapshot.rate,
        expanded: snapshot.expanded,
      }),
    );
  } catch {
    /* storage is optional */
  }
}

const stored = readStoredState();

let audio: HTMLAudioElement | null = null;
/** Identifies the file currently loaded into the element. */
let loadedKey = "";

let snapshot: QuranPlayerState = {
  surah: stored.surah,
  ayah: stored.ayah,
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  volume: readVolume(),
  muted: false,
  expanded: stored.expanded,
  error: null,
  rate: stored.rate,
  reciter: stored.reciter,
  repeatAyah: false,
  repeatSurah: false,
  continueNextSurah: false,
};

const listeners = new Set<() => void>();

function emit(patch: Partial<QuranPlayerState>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;

  const element = new Audio();
  element.preload = "metadata";
  element.volume = snapshot.volume;
  element.playbackRate = snapshot.rate;

  element.addEventListener("loadstart", () => emit({ loading: true }));
  element.addEventListener("loadedmetadata", () =>
    emit({
      loading: false,
      duration: Number.isFinite(element.duration) ? element.duration : 0,
    }),
  );
  element.addEventListener("durationchange", () =>
    emit({
      duration: Number.isFinite(element.duration) ? element.duration : 0,
    }),
  );
  element.addEventListener("canplay", () => emit({ loading: false }));
  element.addEventListener("timeupdate", () =>
    emit({ currentTime: element.currentTime }),
  );
  element.addEventListener("play", () => emit({ playing: true, error: null }));
  element.addEventListener("pause", () => emit({ playing: false }));
  element.addEventListener("abort", () => emit({ loading: false }));
  element.addEventListener("ended", handleEnded);
  element.addEventListener("error", () => {
    emit({
      playing: false,
      loading: false,
      error:
        "This Ayah's audio could not be loaded. Check your connection, or try another reciter.",
    });
  });

  audio = element;
  return element;
}

function handleEnded(): void {
  if (snapshot.repeatAyah) {
    const element = audio;
    if (!element) return;
    element.currentTime = 0;
    void element.play().catch(() => emit({ playing: false }));
    return;
  }

  const total = ayahCount(snapshot.surah);
  if (snapshot.ayah < total) {
    load(snapshot.surah, snapshot.ayah + 1, true);
    return;
  }
  if (snapshot.repeatSurah) {
    load(snapshot.surah, 1, true);
    return;
  }
  if (snapshot.continueNextSurah && snapshot.surah < SURAHS.length) {
    load(snapshot.surah + 1, 1, true);
    return;
  }
  emit({ playing: false, currentTime: 0 });
}

/**
 * Loads one Ayah. The source only changes when the Ayah, Surah or reciter
 * changes, so re-selecting the Ayah that is already loaded never restarts it.
 */
function load(surah: number, ayah: number, autoplay: boolean): void {
  const element = ensureAudio();
  if (!element) return;

  const nextSurah = clampSurah(surah);
  const nextAyah = clampAyah(nextSurah, ayah);
  const key = `${nextSurah}:${nextAyah}:${snapshot.reciter}`;

  if (key !== loadedKey) {
    loadedKey = key;
    element.src = ayahAudioUrl(nextSurah, nextAyah, snapshot.reciter);
    element.playbackRate = snapshot.rate;
    emit({ currentTime: 0, duration: 0, error: null });
  }

  if (snapshot.surah !== nextSurah || snapshot.ayah !== nextAyah) {
    emit({ surah: nextSurah, ayah: nextAyah });
    persist();
  }

  if (autoplay) {
    element.playbackRate = snapshot.rate;
    void element.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      emit({
        playing: false,
        loading: false,
        error: "Playback was blocked. Tap play to start.",
      });
    });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQuranPlayerState(): QuranPlayerState {
  return snapshot;
}

export function useQuranPlayer(): QuranPlayerState {
  return useSyncExternalStore(
    subscribe,
    getQuranPlayerState,
    getQuranPlayerState,
  );
}

/** `"2:255"` for the loaded Ayah — cheap identity for list re-renders. */
export function useQuranAyahKey(): string {
  return useSyncExternalStore(
    subscribe,
    () => `${snapshot.surah}:${snapshot.ayah}`,
    () => `${snapshot.surah}:${snapshot.ayah}`,
  );
}

export function useQuranPlaying(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.playing,
    () => snapshot.playing,
  );
}

export function useQuranSurah(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.surah,
    () => snapshot.surah,
  );
}

/** The Ayah the player has loaded (playing or not). */
export function useQuranAyah(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.ayah,
    () => snapshot.ayah,
  );
}

/**
 * `"2:255"` while the player is active (playing, loading or paused part-way),
 * and `""` when nothing is being recited. Primitive, so subscribers re-render
 * only when the active Ayah actually changes — never on time updates.
 */
function activeKey(): string {
  const active =
    snapshot.playing || snapshot.loading || snapshot.currentTime > 0;
  return active ? `${snapshot.surah}:${snapshot.ayah}` : "";
}

export function useQuranActiveKey(): string {
  return useSyncExternalStore(subscribe, activeKey, activeKey);
}

export const quranPlayer = {
  /** Points the player at a Surah's first Ayah without starting playback. */
  select(surah: number): void {
    load(surah, 1, false);
  },

  /** Selects a single Ayah without starting it. */
  selectAyah(surah: number, ayah: number): void {
    load(surah, ayah, false);
  },

  /** Plays a Surah from its first Ayah (used by the Surah library). */
  play(surah: number): void {
    load(surah, 1, true);
  },

  /** Plays one Ayah — the core of reading/listening synchronisation. */
  playAyah(surah: number, ayah: number): void {
    load(surah, ayah, true);
  },

  pause(): void {
    audio?.pause();
  },

  resume(): void {
    const element = ensureAudio();
    if (!element) return;
    if (!loadedKey) {
      load(snapshot.surah, snapshot.ayah, true);
      return;
    }
    void element
      .play()
      .catch(() => emit({ playing: false, error: "Playback was blocked." }));
  },

  toggle(): void {
    if (snapshot.playing) quranPlayer.pause();
    else quranPlayer.resume();
  },

  /** Plays one Ayah if it is not the active one, otherwise toggles it. */
  toggleAyah(surah: number, ayah: number): void {
    if (snapshot.surah === surah && snapshot.ayah === ayah && loadedKey) {
      quranPlayer.toggle();
      return;
    }
    load(surah, ayah, true);
  },

  /** Plays the loaded Ayah again from its first second. */
  restart(): void {
    const element = ensureAudio();
    if (!element) return;
    if (!loadedKey) {
      load(snapshot.surah, snapshot.ayah, true);
      return;
    }
    element.currentTime = 0;
    emit({ currentTime: 0, error: null });
    void element
      .play()
      .catch(() => emit({ playing: false, error: "Playback was blocked." }));
  },

  stop(): void {
    if (!audio) return;
    audio.pause();
    if (snapshot.playing || snapshot.currentTime > 0) {
      audio.currentTime = 0;
      emit({ playing: false, currentTime: 0, loading: false });
    }
  },

  next(): void {
    const total = ayahCount(snapshot.surah);
    if (snapshot.ayah < total) {
      load(snapshot.surah, snapshot.ayah + 1, true);
      return;
    }
    if (snapshot.continueNextSurah && snapshot.surah < SURAHS.length) {
      load(snapshot.surah + 1, 1, true);
    }
  },

  previous(): void {
    if (snapshot.ayah > 1) load(snapshot.surah, snapshot.ayah - 1, true);
  },

  nextSurah(): void {
    if (snapshot.surah >= SURAHS.length) return;
    load(snapshot.surah + 1, 1, snapshot.playing);
  },

  previousSurah(): void {
    if (snapshot.surah <= 1) return;
    load(snapshot.surah - 1, 1, snapshot.playing);
  },

  seek(seconds: number): void {
    if (!audio || !Number.isFinite(seconds)) return;
    const bounded = Math.min(
      Math.max(0, seconds),
      audio.duration || snapshot.duration || 0,
    );
    audio.currentTime = bounded;
    emit({ currentTime: bounded });
  },

  setVolume(value: number): void {
    const bounded = Math.min(Math.max(0, value), 1);
    if (audio && audio.volume !== bounded) audio.volume = bounded;
    try {
      localStorage.setItem(VOLUME_KEY, String(bounded));
    } catch {
      /* storage is optional */
    }
    emit({ volume: bounded, muted: bounded === 0 });
  },

  toggleMute(): void {
    const muted = !snapshot.muted;
    if (audio && audio.muted !== muted) audio.muted = muted;
    emit({ muted });
  },

  setRate(rate: number): void {
    if (!(RATES as readonly number[]).includes(rate)) return;
    if (audio) audio.playbackRate = rate;
    emit({ rate });
    persist();
  },

  setReciter(reciter: string): void {
    if (!RECITERS.some((entry) => entry.id === reciter)) return;
    if (snapshot.reciter === reciter) return;
    const wasPlaying = snapshot.playing;
    emit({ reciter });
    persist();
    // Reload the same Ayah from the new reciter so the highlight stays put.
    loadedKey = "";
    load(snapshot.surah, snapshot.ayah, wasPlaying);
  },

  toggleRepeatAyah(): void {
    emit({ repeatAyah: !snapshot.repeatAyah });
  },

  toggleRepeatSurah(): void {
    emit({ repeatSurah: !snapshot.repeatSurah });
  },

  toggleContinueNextSurah(): void {
    emit({ continueNextSurah: !snapshot.continueNextSurah });
  },

  setExpanded(expanded: boolean): void {
    emit({ expanded });
    persist();
  },

  clearError(): void {
    emit({ error: null });
  },
};

export function currentSurahLabel(surah: number): string {
  return SURAHS[surah - 1]?.name ?? `Surah ${surah}`;
}

export function currentReciterLabel(reciter: string): string {
  return getReciter(reciter).name;
}

export const PLAYBACK_RATES = RATES;
