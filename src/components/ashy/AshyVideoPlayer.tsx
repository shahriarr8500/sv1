/**
 * AshyVideoPlayer — real YouTube videos played inside the app.
 *
 * ONE player instance per video. The parent owns the mode state
 * ("full" | "mini", null = closed) and keeps the component mounted across
 * mode changes, so the YouTube iframe MOVES between the two layouts without
 * being destroyed: the frame slot keeps an identical tree position in both
 * modes (title row → video frame → tail), and only classes and the tail's
 * inner controls swap. Playback, volume and position therefore survive
 * minimize/expand.
 *
 * Both modes render through a single portal to document.body:
 *  - full on mobile (<768px): bottom sheet — width 100%, max-width 100vw,
 *    max-height 92dvh with internal scroll, rounded top, 16px + safe-area
 *    padding, z-index above the tab bar and floating buttons; tapping the
 *    dimmed backdrop MINIMIZES (never closes).
 *  - mini: fixed bottom-right above the tab bar — right 12px,
 *    bottom calc(env(safe-area-inset-bottom) + 72px), width min(220px, 60vw),
 *    max-width calc(100vw - 24px), 16:9, with 44px expand/close targets.
 *
 * Full layout top→bottom, one column, min-w-0 on flex children:
 *   title (≤2 lines, pr-12 for close) → video (16:9, w-full, rounded-xl,
 *   overflow-hidden; iframe absolute inset-0 w-full h-full) → seek bar with
 *   times → controls row 1 (Back 10 · Play · Forward 10 · Mute · Fullscreen,
 *   justify-between, 44px) → row 2 (speed menu + Minimize + Open on YouTube).
 *   The volume slider is hidden on touch devices (hardware volume only).
 *
 * Gesture overlay over the video only (controls are below it, never
 * covered): left/center/right zones — double-tap ±10s, single tap
 * play/pause after 250ms. In landscape phones the controls auto-hide and
 * reappear on tap. Keyboard: Space/K, J/←, L/→, M, F, Esc.
 *
 * Everything (timers, listeners, body scroll lock, the player itself) is
 * cleaned up on unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AshyVideo } from "@/lib/ashy";
import {
  formatTime,
  getResumePosition,
  loadYouTubeApi,
  setResumePosition,
  youtubeWatchUrl,
  type AshyYTPlayer,
} from "@/lib/ashy-youtube";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Gesture zones across the video overlay (fractions of the width). */
const ZONE_LEFT = 0.33;
const ZONE_CENTER = 0.67;
const SINGLE_TAP_DELAY_MS = 250;
const DOUBLE_TAP_MS = 400;
const REPEAT_SEEK_MS = 700;
const FLASH_MS = 600;
/** Landscape phones hide the controls after this idle while playing. */
const CONTROLS_HIDE_MS = 3000;

type GestureZone = "left" | "center" | "right";
type Flash = { id: number; zone: GestureZone; kind: "back" | "fwd" | "toggle" };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Landscape phone (short viewport) — used for controls auto-hide. */
function isLandscapePhone(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(orientation: landscape) and (max-height: 500px)")
    .matches;
}

/* -------------------------------------------------------------------------- */
/* Compact result card (rendered under the assistant's message)               */
/* -------------------------------------------------------------------------- */

export function AshyVideoCard({
  video,
  onPlay,
}: {
  video: AshyVideo;
  onPlay: (video: AshyVideo) => void;
}) {
  return (
    <div className="flex w-full max-w-72 gap-2.5 rounded-lg border bg-card p-2 sm:w-auto">
      <button
        type="button"
        onClick={() => onPlay(video)}
        aria-label={`Play ${video.title}`}
        className="group relative aspect-video w-28 shrink-0 cursor-pointer overflow-hidden rounded-md bg-muted"
      >
        <img
          src={video.thumbnail}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
        <span className="absolute inset-0 grid place-items-center bg-black/35 transition-colors group-hover:bg-black/45">
          <Play className="size-6 fill-white text-white" aria-hidden />
        </span>
        <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white">
          {video.durationLabel}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <p className="line-clamp-2 text-xs font-medium leading-snug">
          {video.title}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="truncate text-[11px] text-muted-foreground">
            {video.channel}
          </span>
          <button
            type="button"
            onClick={() => onPlay(video)}
            className="ml-auto shrink-0 cursor-pointer rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Play
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Player — one instance, two layouts                                          */
/* -------------------------------------------------------------------------- */

export function AshyVideoPlayer({
  video,
  mode,
  onMinimize,
  onRestore,
  onClose,
}: {
  video: AshyVideo;
  /** "full" = modal/bottom sheet, "mini" = docked card. Never both. */
  mode: "full" | "mini";
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<AshyYTPlayer | null>(null);
  const savedRef = useRef(0);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; zone: GestureZone } | null>(null);
  const lastSideSeekRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);
  const flashIdRef = useRef(0);
  const controlsTimerRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [rate, setRate] = useState(1);
  const [current, setCurrent] = useState(getResumePosition(video.videoId));
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [touch] = useState(isTouchDevice);
  const [landscapePhone, setLandscapePhone] = useState(isLandscapePhone);

  // Adjusting state during render: a NEW VIDEO starts fresh (resuming from
  // the saved session position). A mode change deliberately does NOT reset
  // anything — the same player keeps playing across minimize/expand.
  const [lastVideoKey, setLastVideoKey] = useState(video.videoId);
  if (video.videoId !== lastVideoKey) {
    setLastVideoKey(video.videoId);
    setReady(false);
    setError(null);
    setPlaying(false);
    setDuration(0);
    setFlash(null);
    setControlsVisible(true);
    setCurrent(getResumePosition(video.videoId));
  }

  /* --- player lifecycle: created per video, destroyed only on change/unmount */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let api;
      try {
        api = await loadYouTubeApi();
      } catch {
        if (!cancelled) {
          setError(
            "The video player couldn't load. Check your connection, or open the video on YouTube.",
          );
        }
        return;
      }
      const mount = mountRef.current;
      if (cancelled || !mount) return;

      const player = new api.Player(mount, {
        host: "https://www.youtube-nocookie.com",
        videoId: video.videoId,
        playerVars: {
          autoplay: 1, // only ever reached after the student's Play click
          controls: 0, // our controls below the video own the UI
          disablekb: 1, // keyboard is handled by our shortcuts
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          fs: 0, // no YouTube fullscreen button — ours uses the Fullscreen API
          origin: window.location.origin,
        },
        events: {
          onReady: (event: { target: AshyYTPlayer }) => {
            if (cancelled) return;
            const target = event.target;
            playerRef.current = target;
            setDuration(target.getDuration?.() ?? 0);
            const resume = getResumePosition(video.videoId);
            if (resume > 1) target.seekTo(resume, true);
            target.setVolume(volume);
            target.playVideo();
            setReady(true);
          },
          onStateChange: (event: { data?: number }) => {
            if (cancelled) return;
            // 1 = playing, 2 = paused, 0 = ended
            setPlaying(event.data === 1);
            if (event.data === 0) setResumePosition(video.videoId, 0);
          },
          onError: () => {
            if (cancelled) return;
            setError(
              "This video can't be played inside the app (it may be private, age-restricted or blocked). Open it on YouTube instead.",
            );
          },
        },
      });
      playerRef.current = player;
    })();

    return () => {
      cancelled = true;
      const player = playerRef.current;
      if (player) {
        try {
          setResumePosition(video.videoId, player.getCurrentTime?.() ?? 0);
        } catch {
          /* player already detached */
        }
        try {
          player.destroy();
        } catch {
          /* destroy is best-effort */
        }
      }
      playerRef.current = null;
    };
    // `volume` intentionally excluded: changing it must not rebuild the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.videoId]);

  /* --- time polling + orientation watching (both removed on unmount) ----- */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !ready) return;
      try {
        const time = player.getCurrentTime();
        const total = player.getDuration();
        savedRef.current = time;
        setCurrent(time);
        if (total && total !== duration) setDuration(total);
      } catch {
        /* mid-destroy poll — ignore */
      }
    }, 250);

    const onResize = () => setLandscapePhone(isLandscapePhone());
    window.addEventListener("resize", onResize);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", onResize);
      if (playerRef.current) {
        try {
          setResumePosition(video.videoId, savedRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [ready, duration, video.videoId]);

  /* --- background scroll lock while the full sheet is open --------------- */
  useEffect(() => {
    if (mode !== "full") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mode]);

  /* --- every timer/listener cleaned up on unmount ------------------------ */
  useEffect(
    () => () => {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    },
    [],
  );

  /* --- core controls ------------------------------------------------------ */

  const seekBy = useCallback((delta: number) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const now = player.getCurrentTime() ?? 0;
      const total = player.getDuration() || Number.MAX_SAFE_INTEGER;
      const next = Math.min(total, Math.max(0, now + delta));
      player.seekTo(next, true);
      setCurrent(next);
    } catch {
      /* ignore */
    }
  }, []);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (playing) player.pauseVideo();
      else player.playVideo();
    } catch {
      /* ignore */
    }
  }, [playing]);

  const showFlash = useCallback((zone: GestureZone, kind: Flash["kind"]) => {
    flashIdRef.current += 1;
    setFlash({ id: flashIdRef.current, zone, kind });
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), FLASH_MS);
  }, []);

  const clearSingleTap = useCallback(() => {
    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  }, []);

  /* --- controls auto-hide (landscape phones) ------------------------------ */

  const scheduleControlsHide = useCallback(() => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
    setControlsVisible(true);
    if (mode === "full" && landscapePhone && playing) {
      controlsTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_MS);
    }
  }, [mode, landscapePhone, playing]);

  useEffect(() => {
    scheduleControlsHide();
    return () => {
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    };
  }, [scheduleControlsHide]);

  /* --- gesture overlay ----------------------------------------------------- */

  const zoneFromX = (clientX: number, rect: DOMRect): GestureZone => {
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    if (ratio < ZONE_LEFT) return "left";
    if (ratio < ZONE_CENTER) return "center";
    return "right";
  };

  const handleOverlayTap = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const zone = zoneFromX(event.clientX, rect);
    const now = Date.now();
    const last = lastTapRef.current;
    lastTapRef.current = { time: now, zone };
    scheduleControlsHide();

    if (zone !== "center") {
      const delta = zone === "left" ? -10 : 10;
      const isDouble =
        last !== null && last.zone === zone && now - last.time < DOUBLE_TAP_MS;
      const isRapidRepeat = now - lastSideSeekRef.current < REPEAT_SEEK_MS;
      if (isDouble || isRapidRepeat) {
        clearSingleTap(); // a double-click must never also toggle play/pause
        lastSideSeekRef.current = now;
        seekBy(delta);
        showFlash(zone, delta < 0 ? "back" : "fwd");
        return;
      }
    }

    if (singleTapTimerRef.current) {
      clearSingleTap();
      return;
    }
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      togglePlay();
      showFlash("center", "toggle");
    }, SINGLE_TAP_DELAY_MS);
  };

  /* --- fullscreen (with iOS fallback) -------------------------------------- */

  const handleFullscreen = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.();
        return;
      }
      const request =
        frame.requestFullscreen?.() ??
        (
          frame as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
        ).webkitRequestFullscreen?.();
      if (request) {
        void Promise.resolve(request).catch(() => {
          // iOS Safari can't fullscreen the container — try the native video
          // element inside the embed instead.
          const inner = frame.querySelector("video") as
            | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
            | null;
          inner?.webkitEnterFullscreen?.();
        });
      }
    } catch {
      /* fullscreen denied — nothing else to do */
    }
  }, []);

  /* --- keyboard shortcuts (full mode only) --------------------------------- */

  useEffect(() => {
    if (mode !== "full") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (target?.isContentEditable) return;
      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "j":
        case "ArrowLeft":
          event.preventDefault();
          seekBy(event.key === "ArrowLeft" ? -5 : -10);
          break;
        case "l":
        case "ArrowRight":
          event.preventDefault();
          seekBy(event.key === "ArrowRight" ? 5 : 10);
          break;
        case "m": {
          event.preventDefault();
          const player = playerRef.current;
          if (!player) return;
          try {
            if (player.isMuted()) {
              player.unMute();
              setMuted(false);
            } else {
              player.mute();
              setMuted(true);
            }
          } catch {
            /* ignore */
          }
          break;
        }
        case "f":
          event.preventDefault();
          handleFullscreen();
          break;
        case "Escape":
          onClose();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, togglePlay, seekBy, handleFullscreen, onClose]);

  /* --- remaining controls --------------------------------------------------- */

  const handleSeek = (value: number) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.seekTo(value, true);
      setCurrent(value);
    } catch {
      /* ignore */
    }
  };

  const handleVolume = (value: number) => {
    setVolume(value);
    const player = playerRef.current;
    if (!player) return;
    try {
      player.setVolume(value);
      if (value > 0 && player.isMuted()) player.unMute();
      setMuted(player.isMuted());
    } catch {
      /* ignore */
    }
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (player.isMuted()) {
        player.unMute();
        setMuted(false);
      } else {
        player.mute();
        setMuted(true);
      }
    } catch {
      /* ignore */
    }
  };

  const reducedMotion = prefersReducedMotion();

  /* --- the frame: ONE stable tree position in both modes -------------------
     Nothing inside this subtree is ever mounted/unmounted when the mode
     changes — hidden states use `hidden`, so the iframe node survives. */
  const videoFrame = (
    <div
      ref={frameRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl bg-black select-none"
    >
      {/* The IFrame API replaces this div with the youtube-nocookie iframe.
          `pointer-events: none` (inherited) keeps every click on our overlay. */}
      <div ref={mountRef} className="absolute inset-0 pointer-events-none" />

      {/* Gesture layer (full mode only) — covers the video, never the
          controls, which live outside this frame. */}
      <div
        className={cn(
          "absolute inset-0 z-10",
          mode !== "full" || error ? "hidden" : "",
        )}
        onPointerUp={handleOverlayTap}
        role="presentation"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {flash ? (
          <span
            key={flash.id}
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-xl bg-black/65 px-3 py-2 text-sm font-semibold text-white",
              flash.zone === "left"
                ? "left-8"
                : flash.zone === "right"
                  ? "right-8"
                  : "left-1/2 -translate-x-1/2",
              reducedMotion ? "" : "animate-in fade-in-0 zoom-in-95",
            )}
          >
            {flash.kind === "back" ? (
              <span className="flex items-center">
                <Minus className="size-3" aria-hidden />10s
              </span>
            ) : flash.kind === "fwd" ? (
              <span className="flex items-center">
                <Plus className="size-3" aria-hidden />10s
              </span>
            ) : playing ? (
              <Pause className="size-5 fill-white" aria-hidden />
            ) : (
              <Play className="size-5 fill-white" aria-hidden />
            )}
          </span>
        ) : null}
      </div>

      {/* Mini mode: one tap expands back to the full player (no seek zones). */}
      <button
        type="button"
        aria-label="Expand player"
        title="Expand player"
        onClick={onRestore}
        className={cn(
          "absolute inset-0 z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          mode !== "mini" || error ? "hidden" : "",
        )}
      />

      <div
        className={cn(
          "absolute inset-0 z-20 grid place-items-center gap-3 bg-black/85 p-4 text-center",
          error ? "" : "hidden",
        )}
      >
        <div className="max-w-xs space-y-3">
          <p className="text-xs leading-relaxed text-white/90">{error}</p>
          <a
            href={youtubeWatchUrl(video.videoId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-white/30 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Open on YouTube
          </a>
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 z-20 grid place-items-center",
          ready || error ? "hidden" : "",
        )}
      >
        <span className="text-xs text-white/80">Loading video…</span>
      </div>
    </div>
  );

  /* --- portal content ------------------------------------------------------- */

  const isFull = mode === "full";

  const content = (
    <div
      // One wrapper node; classes swap per mode. Never `top` positioned.
      className={cn(
        "fixed z-[90]",
        isFull
          ? "inset-0 flex items-end justify-center sm:items-center"
          : "right-3 bottom-[calc(env(safe-area-inset-bottom)+72px)] w-[min(220px,60vw)] max-w-[calc(100vw-24px)]",
      )}
      onPointerDown={() => scheduleControlsHide()}
    >
      {/* Dimmed backdrop — tap MINIMIZES, never closes. */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60",
          isFull ? "" : "hidden",
        )}
        aria-hidden
        onClick={onMinimize}
      />

      <div
        role={isFull ? "dialog" : undefined}
        aria-modal={isFull || undefined}
        aria-label={`Video player: ${video.title}`}
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden",
          isFull
            ? // Bottom sheet (mobile <768px shows full width; wider screens
              // center as a modal card). Landscape phones get the full height
              // so the 16:9 video is as large as possible.
              landscapePhone
                ? "w-full max-w-[100vw] max-h-[100dvh] overflow-y-auto rounded-none border bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-2xl"
                : "w-full max-w-[100vw] max-h-[92dvh] overflow-y-auto rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-2xl md:rounded-xl"
            : // Mini card
              "w-full rounded-xl border bg-card shadow-xl",
        )}
      >
        {/* ---- header row (stable node) ---- */}
        <div className="flex min-w-0 items-center justify-between gap-2 pb-2">
          <p
            className={cn(
              "min-w-0 text-sm font-medium",
              isFull ? "line-clamp-2 pr-12" : "truncate text-[11px]",
            )}
          >
            {video.title}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Expand player"
              title="Expand player"
              onClick={onRestore}
              className={cn(
                "grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                isFull ? "hidden" : "",
              )}
            >
              <Maximize2 className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Close video"
              title="Close video"
              onClick={onClose}
              className="grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* ---- video frame (stable node — the iframe never remounts) ---- */}
        {videoFrame}

        {/* ---- tail: differs per mode; recreated freely (no iframe inside) */}
        {isFull ? (
          <div
            className={cn(
              "flex min-w-0 flex-col gap-3 pt-3 transition-opacity",
              controlsVisible ? "opacity-100" : "opacity-0",
            )}
          >
            {/* Seek bar, full width */}
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatTime(current)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duration))}
                step={1}
                value={Math.floor(current)}
                aria-label="Seek"
                disabled={!ready || duration === 0}
                onChange={(event) => handleSeek(Number(event.target.value))}
                className="h-1.5 w-full min-w-0 cursor-pointer accent-primary"
              />
              <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatTime(duration)}
              </span>
            </div>

            {/* Controls row 1 — centered, evenly spaced, 44px targets */}
            <div className="flex min-w-0 items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Back 10 seconds"
                title="Back 10 seconds (J)"
                onClick={() => seekBy(-10)}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <RotateCcw className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={playing ? "Pause (Space)" : "Play (Space)"}
                title={playing ? "Pause (Space)" : "Play (Space)"}
                onClick={togglePlay}
                className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow transition-transform hover:opacity-90 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {playing ? (
                  <Pause className="size-5 fill-current" aria-hidden />
                ) : (
                  <Play className="size-5 fill-current" aria-hidden />
                )}
              </button>
              <button
                type="button"
                aria-label="Forward 10 seconds"
                title="Forward 10 seconds (L)"
                onClick={() => seekBy(10)}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <RotateCw className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={muted ? "Unmute (M)" : "Mute (M)"}
                title={muted ? "Unmute (M)" : "Mute (M)"}
                onClick={toggleMute}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="size-5" aria-hidden />
                ) : (
                  <Volume2 className="size-5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                aria-label="Fullscreen (F)"
                title="Fullscreen (F)"
                onClick={handleFullscreen}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
            </div>

            {/* Desktop only: the volume slider (phones use hardware volume). */}
            {!touch ? (
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-[11px] text-muted-foreground">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={muted ? 0 : volume}
                  aria-label="Volume"
                  onChange={(event) => handleVolume(Number(event.target.value))}
                  className="h-1.5 w-40 cursor-pointer accent-primary"
                />
              </div>
            ) : null}

            {/* Controls row 2: speed menu + Minimize + Open on YouTube */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Playback speed: ${rate}x`}
                    aria-haspopup="menu"
                    className="min-h-11 cursor-pointer rounded-md border px-3 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {rate}x
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="z-[100] w-28 p-1"
                >
                  <div role="menu" aria-label="Playback speed">
                    {SPEEDS.map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        role="menuitemradio"
                        aria-checked={rate === speed}
                        onClick={() => {
                          setRate(speed);
                          try {
                            playerRef.current?.setPlaybackRate(speed);
                          } catch {
                            /* ignore */
                          }
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          rate === speed
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent",
                        )}
                      >
                        {speed}x
                        {rate === speed ? (
                          <span aria-hidden>✓</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex min-w-0 flex-1 gap-2">
                {onMinimize ? (
                  <button
                    type="button"
                    onClick={onMinimize}
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Maximize2 className="size-3.5 rotate-180" aria-hidden />
                    Minimize
                  </button>
                ) : null}
                <a
                  href={youtubeWatchUrl(video.videoId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  Open on YouTube
                </a>
              </div>
            </div>

            <p className="hidden text-[11px] text-muted-foreground md:block">
              Space/K play-pause · J/← −10s · L/→ +10s · M mute · F fullscreen ·
              Esc close
            </p>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1 pt-1">
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className="grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {playing ? (
                <Pause className="size-4 fill-current" aria-hidden />
              ) : (
                <Play className="size-4 fill-current" aria-hidden />
              )}
            </button>
            <button
              type="button"
              aria-label="Back 10 seconds"
              title="Back 10 seconds (J)"
              onClick={() => seekBy(-10)}
              className="grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Forward 10 seconds"
              title="Forward 10 seconds (L)"
              onClick={() => seekBy(10)}
              className="grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCw className="size-4" aria-hidden />
            </button>
            <span className="ml-auto pr-1 text-[11px] tabular-nums text-muted-foreground">
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
