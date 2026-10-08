import { useSyncExternalStore } from "react";
import { SURAHS, surahAudioUrl, surahName } from "@/lib/student-os/quran";

export interface QuranPlayerState {
  surah: number;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  expanded: boolean;
  error: string | null;
}

const VOLUME_KEY = "student-os:quran-volume";

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

let audio: HTMLAudioElement | null = null;
let snapshot: QuranPlayerState = {
  surah: 1,
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  volume: readVolume(),
  muted: false,
  expanded: false,
  error: null,
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

  element.addEventListener("loadstart", () => emit({ loading: true }));
  element.addEventListener("loadedmetadata", () =>
    emit({ loading: false, duration: element.duration || 0 }),
  );
  element.addEventListener("canplay", () => emit({ loading: false }));
  element.addEventListener("timeupdate", () =>
    emit({ currentTime: element.currentTime }),
  );
  element.addEventListener("play", () => emit({ playing: true }));
  element.addEventListener("pause", () => emit({ playing: false }));
  element.addEventListener("ended", () => {
    emit({ playing: false, currentTime: 0 });
  });
  element.addEventListener("abort", () => {
    emit({ loading: false });
  });
  element.addEventListener("error", () => {
    emit({
      playing: false,
      loading: false,
      error:
        "Audio could not be loaded. Check your connection and try again.",
    });
  });

  audio = element;
  return element;
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
  return useSyncExternalStore(subscribe, getQuranPlayerState, () => snapshot);
}

export const quranPlayer = {
  play(surah: number): void {
    const element = ensureAudio();
    if (!element) return;

    const clamped = Math.min(Math.max(1, surah), SURAHS.length);
    if (snapshot.surah !== clamped) {
      element.src = surahAudioUrl(clamped);
      element.currentTime = 0;
      emit({ surah: clamped, currentTime: 0, duration: 0, error: null });
    } else if (!element.src) {
      element.src = surahAudioUrl(clamped);
    }

    emit({ loading: true, error: null });
    void element.play().catch(() => {
      emit({
        playing: false,
        loading: false,
        error: "Playback was blocked.",
      });
    });
  },

  pause(): void {
    audio?.pause();
  },

  resume(): void {
    if (!audio) return quranPlayer.play(snapshot.surah);
    void audio.play().catch(() =>
      emit({ playing: false, error: "Playback was blocked." }),
    );
  },

  toggle(): void {
    if (snapshot.playing) quranPlayer.pause();
    else quranPlayer.resume();
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
    quranPlayer.play(Math.min(snapshot.surah + 1, SURAHS.length));
  },

  previous(): void {
    quranPlayer.play(Math.max(snapshot.surah - 1, 1));
  },

  seek(seconds: number): void {
    if (!audio || !Number.isFinite(seconds)) return;
    const bounded = Math.min(Math.max(0, seconds), snapshot.duration || 0);
    if (Math.abs(audio.currentTime - bounded) > 0.05) {
      audio.currentTime = bounded;
      emit({ currentTime: bounded });
    }
  },

  setVolume(value: number): void {
    const bounded = Math.min(Math.max(0, value), 1);
    if (audio && audio.volume !== bounded) {
      audio.volume = bounded;
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(bounded));
    } catch {
      /* storage is optional */
    }
    emit({ volume: bounded, muted: bounded === 0 });
  },

  toggleMute(): void {
    const muted = !snapshot.muted;
    if (audio && audio.muted !== muted) {
      audio.muted = muted;
    }
    emit({ muted });
  },

  setExpanded(expanded: boolean): void {
    emit({ expanded });
  },

  clearError(): void {
    emit({ error: null });
  },
};

export function currentSurahLabel(surah: number): string {
  return `${surahName(surah)}`;
}
