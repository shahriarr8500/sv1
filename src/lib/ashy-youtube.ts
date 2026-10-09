/**
 * YouTube IFrame Player API — lazy loader + small shared helpers.
 *
 * The API script is fetched from YouTube only when a student actually opens a
 * video, and only one loader promise is ever created. Player instances live
 * in the components that create them; this module owns nothing but the script
 * handle and the per-session resume positions.
 */

export interface AshyYTPlayer {
  destroy(): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): boolean;
  isMuted(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getCurrentTime(): number;
  getDuration(): number;
}

export interface AshyYTApi {
  Player: new (
    target: HTMLElement,
    options: Record<string, unknown>,
  ) => AshyYTPlayer;
}

declare global {
  interface Window {
    YT?: AshyYTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<AshyYTApi> | null = null;

/** Resolves with the YT namespace, loading the iframe API script once. */
export function loadYouTubeApi(): Promise<AshyYTApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube player needs a browser."));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<AshyYTApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player failed to initialise."));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("Could not load the YouTube player."));
    };
    document.head.appendChild(script);
    // Network safety net — the promise is settled at most once.
    window.setTimeout(() => {
      if (window.YT?.Player) resolve(window.YT);
      else {
        apiPromise = null;
        reject(new Error("Timed out loading the YouTube player."));
      }
    }, 20_000);
  });
  return apiPromise;
}

/** Resume positions (seconds) per video id, for this session only. */
const resumePositions = new Map<string, number>();

export function getResumePosition(videoId: string): number {
  return resumePositions.get(videoId) ?? 0;
}

export function setResumePosition(videoId: string, seconds: number): void {
  if (Number.isFinite(seconds) && seconds > 0) {
    resumePositions.set(videoId, seconds);
  }
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Canonical watch URL for the "Open on YouTube" link. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** Plain YouTube search link used as the fallback when a search fails. */
export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
