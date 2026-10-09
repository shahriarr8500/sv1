/**
 * AshyVideoPlayer — real YouTube videos played inside the app.
 *
 * Two presentations from one component:
 *  - mode "dialog": a modal player with custom controls;
 *  - mode "mini": a compact card the chat page places directly above the
 *    composer so it never covers it on mobile.
 *
 * The IFrame Player runs on youtube-nocookie.com with YouTube's own controls
 * disabled; everything below is our UI. Rules honoured here:
 *  - playback only ever starts from a student's click (never autoplays with
 *    sound unprompted);
 *  - Space toggles play/pause, J/L seek −10s/+10s, double-tap left/right on
 *    touch does the same;
 *  - position is resumed per video for the session;
 *  - the player is destroyed on close/unmount and all listeners/timers are
 *    removed; embed failures show a message plus an "Open on YouTube" link.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Pause,
  Play,
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
  DialogTitle,
  DialogDescription,
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
  /** "dialog" = modal, "mini" = floating card above the composer. */
  mode: "dialog" | "mini";
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<AshyYTPlayer | null>(null);
  const savedRef = useRef(0);
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(
    null,
  );

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [rate, setRate] = useState(1);
  const [current, setCurrent] = useState(getResumePosition(video.videoId));
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Adjusting state during render (React's documented alternative to doing
  // it inside an effect): switching video or mode starts fresh, resuming from
  // the saved session position.
  const playerKey = `${video.videoId}:${mode}`;
  const [lastPlayerKey, setLastPlayerKey] = useState(playerKey);
  if (playerKey !== lastPlayerKey) {
    setLastPlayerKey(playerKey);
    setReady(false);
    setError(null);
    setPlaying(false);
    setDuration(0);
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
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
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

  /* --- keyboard shortcuts (dialog only) --------------------------------- */
  const seekBy = useCallback(
    (delta: number) => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const next = Math.max(0, (player.getCurrentTime() ?? 0) + delta);
        player.seekTo(next, true);
        setCurrent(next);
      } catch {
        /* ignore */
      }
    },
    [],
  );

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

  useEffect(() => {
    if (mode !== "dialog") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "j") {
        event.preventDefault();
        seekBy(-10);
      } else if (event.key === "l") {
        event.preventDefault();
        seekBy(10);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, togglePlay, seekBy]);

  /* --- double-tap left/right (mobile) ----------------------------------- */
  const handleTouchEnd = (event: React.TouchEvent) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const side: "left" | "right" =
      touch.clientX - rect.left < rect.width / 2 ? "left" : "right";
    const now = Date.now();
    const previous = lastTapRef.current;
    if (previous && previous.side === side && now - previous.time < 320) {
      seekBy(side === "left" ? -10 : 10);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { time: now, side };
    }
  };

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

  const handleFullscreen = () => {
    frameRef.current?.requestFullscreen?.().catch(() => {
      /* denied — nothing to do */
    });
  };

  const openOnYouTube = (
    <a
      href={youtubeWatchUrl(video.videoId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ExternalLink className="size-3.5" aria-hidden />
      Open on YouTube
    </a>
  );

  const videoSurface = (
    <div
      ref={frameRef}
      className="relative aspect-video w-full touch-manipulation bg-black select-none"
      onTouchEnd={handleTouchEnd}
    >
      {/* The IFrame API replaces this div with the youtube-nocookie iframe. */}
      <div ref={mountRef} className="absolute inset-0" />
      {error ? (
        <div className="absolute inset-0 grid place-items-center gap-3 bg-black/85 p-4 text-center">
          <div className="max-w-xs space-y-3">
            <p className="text-xs leading-relaxed text-white/90">{error}</p>
            <div className="flex justify-center">{openOnYouTube}</div>
          </div>
        </div>
      ) : null}
      {!ready && !error ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-xs text-white/80">Loading video…</span>
        </div>
      ) : null}
    </div>
  );

  /* --- mini player ------------------------------------------------------- */
  if (mode === "mini") {
    return (
      <div className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-lg">
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
              className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Close video"
              title="Close video"
              onClick={onClose}
              className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
        {videoSurface}
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
            className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Forward 10 seconds"
            title="Forward 10 seconds (L)"
            onClick={() => seekBy(10)}
            className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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

  /* --- dialog player ----------------------------------------------------- */
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-2xl gap-3">
        <DialogDescription className="sr-only">
          In-app video player for {video.title}
        </DialogDescription>
        <DialogTitle className="line-clamp-2 pr-8 text-sm">
          {video.title}
        </DialogTitle>

        {videoSurface}

        {/* Seek bar + times */}
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
            className="h-1.5 w-full cursor-pointer accent-primary"
          />
          <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={playing ? "Pause (Space)" : "Play (Space)"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            className="size-8"
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
            className="size-8"
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
            className="size-8"
            onClick={() => seekBy(10)}
          >
            <RotateCw className="size-4" aria-hidden />
          </Button>

          <div className="mx-1 flex overflow-hidden rounded-md border" role="group" aria-label="Playback speed">
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
                  "cursor-pointer px-1.5 py-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
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
            aria-label={muted ? "Unmute" : "Mute"}
            title={muted ? "Unmute" : "Mute"}
            className="size-8"
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

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Fullscreen"
              title="Fullscreen"
              className="size-8"
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
            {onMinimize ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Minimize player"
                title="Minimize player"
                className="size-8"
                onClick={onMinimize}
              >
                <Minimize2 className="size-4" aria-hidden />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close player"
              title="Close player (Esc)"
              className="size-8"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Space play/pause · J back 10s · L forward 10s · double-tap left/right
            on mobile
          </p>
          {openOnYouTube}
        </div>
      </DialogContent>
    </Dialog>
  );
}
