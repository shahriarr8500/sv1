/**
 * AshyVideoPlayer — real YouTube videos played inside the app.
 *
 * Two presentations from one component:
 *  - mode "dialog": a modal player on desktop; a bottom sheet (max 90dvh,
 *    safe-area padding) on screens under 640px;
 *  - mode "mini": a compact card the chat page docks above the composer so it
 *    never covers it on mobile.
 *
 * Layout order (both modes): title → video (16:9, w-full, overflow-hidden)
 * → custom controls BELOW the video (never overlapping) → actions row.
 *
 * Gesture layer (Problem 3): the YouTube iframe runs with `pointer-events:
 * none`, and a transparent overlay above it receives every click/tap:
 *   left third → double = −10s · centre → single = play/pause ·
 *   right third → double = +10s, with rapid repeats keeping ±10s.
 * A single tap anywhere toggles play/pause after a 250 ms grace period that a
 * second tap cancels, so a double-click never also toggles playback.
 *
 * Keyboard (dialog mode only, never while typing): Space/K play-pause,
 * J/← −10s/−5s, L/→ +10s/+5s, M mute, F fullscreen, Esc close.
 *
 * The player is destroyed on close/unmount and all listeners/timers are
 * removed; embed failures show a message plus an "Open on YouTube" link.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
/** Grace period before a lone tap becomes a play/pause toggle. */
const SINGLE_TAP_DELAY_MS = 250;
/** Two taps closer than this count as a double-tap. */
const DOUBLE_TAP_MS = 400;
/** After a double-tap, further taps in the same zone keep seeking… */
const REPEAT_SEEK_MS = 700;
/** How long the −10s/+10s/play-pause feedback stays on screen. */
const FLASH_MS = 600;

type GestureZone = "left" | "center" | "right";
type Flash = { id: number; zone: GestureZone; kind: "back" | "fwd" | "toggle" };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
/* Player                                                                      */
/* -------------------------------------------------------------------------- */

export function AshyVideoPlayer({
  video,
  mode,
  onMinimize,
  onRestore,
  onClose,
}: {
  video: AshyVideo;
  /** "dialog" = modal / bottom sheet, "mini" = docked card above the composer. */
  mode: "dialog" | "mini";
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

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [rate, setRate] = useState(1);
  const [current, setCurrent] = useState(getResumePosition(video.videoId));
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  // Adjusting state during render (React's documented alternative to doing it
  // inside an effect): switching video or mode starts fresh, resuming from
  // the saved session position.
  const playerKey = `${video.videoId}:${mode}`;
  const [lastPlayerKey, setLastPlayerKey] = useState(playerKey);
  if (playerKey !== lastPlayerKey) {
    setLastPlayerKey(playerKey);
    setReady(false);
    setError(null);
    setPlaying(false);
    setDuration(0);
    setFlash(null);
    setCurrent(getResumePosition(video.videoId));
  }

  /* --- player lifecycle: created per (video, mode), destroyed on change -- */
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
      // Persist the position for session resume, then tear everything down so
      // the embed (and its audio) is fully gone.
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
  }, [video.videoId, mode]);

  /* --- time polling (removed on unmount) -------------------------------- */
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
    return () => {
      window.clearInterval(timer);
      if (playerRef.current) {
        try {
          setResumePosition(video.videoId, savedRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [ready, duration, video.videoId]);

  /* --- gesture + flash timers cleaned up on unmount --------------------- */
  useEffect(
    () => () => {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  /* --- core controls ----------------------------------------------------- */

  /** Seeks by a delta from the live playhead, clamped to [0, duration]. */
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

  /* --- gesture overlay ---------------------------------------------------- */

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

    if (zone !== "center") {
      const delta = zone === "left" ? -10 : 10;
      const isDouble = last !== null && last.zone === zone && now - last.time < DOUBLE_TAP_MS;
      const isRapidRepeat = now - lastSideSeekRef.current < REPEAT_SEEK_MS;
      if (isDouble || isRapidRepeat) {
        clearSingleTap(); // a double-click must never also toggle play/pause
        lastSideSeekRef.current = now;
        seekBy(delta);
        showFlash(zone, delta < 0 ? "back" : "fwd");
        return;
      }
    }

    // A lone tap (any zone) toggles play/pause — unless a second tap arrives
    // inside the grace period and cancels it.
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

  /* --- keyboard shortcuts (dialog mode only) ----------------------------- */

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
        (frame as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> })
          .webkitRequestFullscreen?.();
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

  useEffect(() => {
    if (mode !== "dialog") return;
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

  /* --- remaining controls ------------------------------------------------- */

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

  const openOnYouTube = (
    <a
      href={youtubeWatchUrl(video.videoId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ExternalLink className="size-3.5" aria-hidden />
      Open on YouTube
    </a>
  );

  const reducedMotion = prefersReducedMotion();

  const videoSurface = (
    <div
      ref={frameRef}
      className="relative aspect-video max-h-[calc(100dvh-13rem)] w-full touch-manipulation overflow-hidden bg-black select-none"
    >
      {/* The IFrame API replaces this div with the youtube-nocookie iframe.
          `pointer-events: none` (inherited) keeps every click on our overlay. */}
      <div ref={mountRef} className="absolute inset-0 pointer-events-none" />

      {/* Transparent 3-zone gesture layer, above the embed, below nothing —
          the controls live outside this frame, so it never blocks them. */}
      {mode === "dialog" && !error ? (
        <div
          className="absolute inset-0 z-10"
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
      ) : null}

      {/* Mini mode: one tap expands back to the full player. */}
      {mode === "mini" && !error ? (
        <button
          type="button"
          aria-label="Expand player"
          title="Expand player"
          onClick={onRestore}
          className="absolute inset-0 z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-20 grid place-items-center gap-3 bg-black/85 p-4 text-center">
          <div className="max-w-xs space-y-3">
            <p className="text-xs leading-relaxed text-white/90">{error}</p>
            <div className="flex justify-center">{openOnYouTube}</div>
          </div>
        </div>
      ) : null}
      {!ready && !error ? (
        <div className="absolute inset-0 z-20 grid place-items-center">
          <span className="text-xs text-white/80">Loading video…</span>
        </div>
      ) : null}
    </div>
  );

  /* --- mini player -------------------------------------------------------- */
  if (mode === "mini") {
    return (
      <div className="w-72 max-w-[calc(100dvw-2rem)] overflow-hidden rounded-xl border bg-card shadow-lg">
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
          <p className="min-w-0 truncate text-[11px] font-medium">
            {video.title}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Back to full player"
              title="Back to full player"
              onClick={onRestore}
              className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Close video"
              title="Close video"
              onClick={onClose}
              className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
        {videoSurface}
        <div className="flex items-center gap-1 px-2 py-1.5">
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Forward 10 seconds"
            title="Forward 10 seconds (L)"
            onClick={() => seekBy(10)}
            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RotateCw className="size-4" aria-hidden />
          </button>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {formatTime(current)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    );
  }

  /* --- dialog / bottom-sheet player --------------------------------------- */
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={
          // Mobile (<sm): bottom sheet — full width, rounded top, internal
          // scroll, safe-area padding. Desktop: centred modal.
          "top-auto bottom-0 left-0 max-h-[90dvh] w-full max-w-full translate-x-0 translate-y-0 overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] gap-3 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-2xl sm:w-[calc(100%-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:p-6"
        }
      >
        <DialogDescription className="sr-only">
          In-app video player for {video.title}
        </DialogDescription>
        <DialogTitle className="line-clamp-2 pr-10 text-sm">
          {video.title}
        </DialogTitle>

        {videoSurface}

        {/* Controls BELOW the video — never overlapping it. */}
        <div className="flex items-center gap-2">
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

        {/* Row 2: transport, speed, volume, fullscreen — wraps at 360px. */}
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={playing ? "Pause (Space)" : "Play (Space)"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            className="size-11 sm:size-8"
            onClick={togglePlay}
          >
            {playing ? (
              <Pause className="size-4 fill-current" aria-hidden />
            ) : (
              <Play className="size-4 fill-current" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Back 10 seconds"
            title="Back 10 seconds (J)"
            className="size-11 sm:size-8"
            onClick={() => seekBy(-10)}
          >
            <RotateCcw className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Forward 10 seconds"
            title="Forward 10 seconds (L)"
            className="size-11 sm:size-8"
            onClick={() => seekBy(10)}
          >
            <RotateCw className="size-4" aria-hidden />
          </Button>

          <div
            className="mx-1 flex overflow-hidden rounded-md border"
            role="group"
            aria-label="Playback speed"
          >
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={rate === speed}
                onClick={() => {
                  setRate(speed);
                  try {
                    playerRef.current?.setPlaybackRate(speed);
                  } catch {
                    /* ignore */
                  }
                }}
                className={cn(
                  "cursor-pointer px-1.5 py-1.5 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  rate === speed
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {speed}x
              </button>
            ))}
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={muted ? "Unmute (M)" : "Mute (M)"}
            title={muted ? "Unmute (M)" : "Mute (M)"}
            className="size-11 sm:size-8"
            onClick={toggleMute}
          >
            {muted || volume === 0 ? (
              <VolumeX className="size-4" aria-hidden />
            ) : (
              <Volume2 className="size-4" aria-hidden />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(event) => handleVolume(Number(event.target.value))}
            className="h-1.5 w-20 cursor-pointer accent-primary"
          />

          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Fullscreen (F)"
            title="Fullscreen (F)"
            className="size-11 sm:size-8"
            onClick={handleFullscreen}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </Button>
        </div>

        {/* Actions row: Open on YouTube · Minimize · desktop-only hint. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="hidden text-[11px] text-muted-foreground md:block">
            Space/K play-pause · J/← −10s · L/→ +10s · M mute · F fullscreen ·
            Esc close
          </p>
          <div className="flex items-center gap-2">
            {onMinimize ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 cursor-pointer sm:min-h-0"
                onClick={onMinimize}
              >
                <Maximize2 className="size-4 rotate-180" aria-hidden />
                Minimize
              </Button>
            ) : null}
            {openOnYouTube}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
