import { useState, useCallback, useRef, useEffect } from "react";
import { Headphones, ListMusic, Play, Pause, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SURAHS, surahAudioUrl, surahName } from "@/lib/student-os/quran";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "student-os:quran-player:v1";

function readStored(): { surah: number; expanded: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { surah: 1, expanded: false };
    const parsed = JSON.parse(raw) as { surah?: unknown; expanded?: unknown };
    const surahNumber =
      Number.isFinite(parsed.surah as number) &&
      (parsed.surah as number) >= 1 &&
      (parsed.surah as number) <= SURAHS.length
        ? (parsed.surah as number)
        : 1;
    const expanded = parsed.expanded === true;
    return { surah: surahNumber, expanded };
  } catch {
    return { surah: 1, expanded: false };
  }
}

function writeStored(surah: number, expanded: boolean): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        surah: Math.max(1, Math.min(SURAHS.length, surah)),
        expanded,
      }),
    );
  } catch {
    /* storage is optional */
  }
}

export function FloatingQuranPlayer() {
  const stored = readStored();
  const [surah, setSurah] = useState(stored.surah);
  const [expanded, setExpanded] = useState(stored.expanded);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const current = SURAHS[surah - 1] ?? SURAHS[0];
  const results = SURAHS.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      String(item.number) === query,
  );

  const setAudioSrc = useCallback(
    (nextUrl: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.src !== nextUrl) {
        audio.src = nextUrl;
        audio.load();
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);
  const setBlockedError = useCallback(() => setError("Playback was blocked."), []);

  const handlePlaySurah = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(1, next), SURAHS.length);
      setSurah(clamped);
      writeStored(clamped, expanded);
      clearError();
      setAudioSrc(surahAudioUrl(clamped));
      const audio = audioRef.current;
      if (!audio) return;
      audio
        .play()
        .then(() => clearError())
        .catch(() => setBlockedError());
    },
    [expanded, setAudioSrc, clearError, setBlockedError],
  );

  const handlePlay = useCallback(() => {
    clearError();
    const audio = audioRef.current;
    if (!audio) {
      setAudioSrc(surahAudioUrl(surah));
      return;
    }
    if (audio.paused) {
      audio
        .play()
        .then(() => clearError())
        .catch(() => setBlockedError());
    } else {
      audio.pause();
    }
  }, [audioRef, surah, setAudioSrc, clearError, setBlockedError]);

  const handlePause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const handleStop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const handleNext = useCallback(
    () => handlePlaySurah(Math.min(SURAHS.length, surah + 1)),
    [surah, handlePlaySurah],
  );

  const handlePrevious = useCallback(
    () => handlePlaySurah(Math.max(1, surah - 1)),
    [surah, handlePlaySurah],
  );

  const handleToggleExpanded = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    writeStored(surah, next);
  }, [expanded, surah]);

  const openPanel = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const current = dialog.querySelector("[data-quran-surah]");
    if (!current) return;
    const top = current.getBoundingClientRect().top;
    dialog.scrollTo({
      top: dialog.scrollTop + top,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.addEventListener("error", clearError);
    audio.addEventListener("ended", clearError);
    audio.addEventListener("timeupdate", clearError);
    audio.addEventListener("canplay", clearError);
    audio.addEventListener("play", clearError);

    return () => {
      audio.removeEventListener("error", clearError);
      audio.removeEventListener("ended", clearError);
      audio.removeEventListener("timeupdate", clearError);
      audio.removeEventListener("canplay", clearError);
      audio.removeEventListener("play", clearError);
    };
  }, [audioRef, clearError]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    writeStored(surah, expanded);
    setAudioSrc(surahAudioUrl(surah));
  }, [surah, expanded, setAudioSrc]);

  if (typeof window === "undefined") {
    return (
      <div className="relative z-40">
        <button
          type="button"
          className="fixed right-4 z-40"
          style={{
            bottom: "calc(16px + env(safe-area-inset-bottom))",
          }}
          aria-label="Show Surah list"
          aria-expanded={false}
          disabled
        >
          <div
            className={cn(
              "pointer-events-none rounded-full ring-2 ring-offset-2 ring-offset-background transition-opacity",
              "opacity-40",
            )}
          />
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              disabled
              className="grid size-10 cursor-pointer place-items-center rounded-full border bg-card text-muted-foreground shadow-lg"
            >
              <ListMusic className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled
              className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-xl"
            >
              <Headphones className="size-5" aria-hidden />
            </button>
          </div>
        </button>
      </div>
    );
  }

  const audio = audioRef.current;
  const currentTime = audio?.currentTime ?? 0;
  const duration = audio?.duration ?? 0;
  const isPaused = audio?.paused ?? true;
  const isMuted = audio?.muted ?? false;

  return (
    <div className="relative z-40">
      {expanded && (
        <div
          ref={dialogRef}
          data-quran-player
          className="pointer-events-auto z-40 flex w-full flex-col overflow-auto bg-card shadow-2xl border border-border sm:rounded-xl sm:border"
          style={{
            width: "100%",
            maxWidth: "360px",
            maxHeight: "calc(100vh - 104px - env(safe-area-inset-bottom))",
            bottom: "calc(48px + env(safe-area-inset-bottom))",
            right: "16px",
            left: "auto",
          }}
        >
          <div className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-border bg-card px-3 py-2 sm:px-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <Headphones className="size-3.5 text-primary" aria-hidden />
              Quran Player
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Minimize player"
              className="rounded-md"
              onClick={handleToggleExpanded}
            >
              <Search className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="space-y-2 border-b border-border px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {current.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {Math.floor(currentTime / 60)}:
                {String(Math.floor(currentTime % 60)).padStart(2, "0")}
                {duration > 0
                  ? ` / ${Math.floor(duration / 60)}:${
                      String(Math.floor(duration % 60)).padStart(2, "0")
                    }`
                  : ""}
              </span>
            </div>

            <div className="relative">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Surah"
                autoComplete="off"
                aria-label="Search Surah"
                className="h-9 pl-9"
              />
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous Surah"
                disabled={surah <= 1}
                className="rounded-full"
                onClick={handlePrevious}
              >
                <span className="text-sm">{"<"}</span>
              </Button>
              <Button
                type="button"
                variant="default"
                size="icon"
                aria-label={isPaused ? "Play" : "Pause"}
                className="rounded-full"
                onClick={isPaused ? handlePlay : handlePause}
              >
                {isPaused ? (
                  <Play className="size-4" aria-hidden />
                ) : (
                  <Pause className="size-4" aria-hidden />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next Surah"
                disabled={surah >= SURAHS.length}
                className="rounded-full"
                onClick={handleNext}
              >
                <span className="text-sm">{">"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Stop"
                className="rounded-full"
                onClick={handleStop}
              >
                <span className="text-sm">{"■"}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="rounded-full"
                onClick={() => {
                  if (!audio) return;
                  audio.muted = !audio.muted;
                }}
              >
                {isMuted ? (
                  <span className="text-sm">🔇</span>
                ) : (
                  <span className="text-sm">🔊</span>
                )}
              </Button>
            </div>
          </div>

          {error ? (
            <p className="text-xs text-destructive px-3">{error}</p>
          ) : null}

          <div className="px-3 pt-3 sm:px-4 sm:pt-4">
            <ul className="max-h-48 overflow-y-auto p-2">
              {results.length === 0 ? (
                <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No Surah matches "{query}".
                </li>
              ) : (
                results.map((item) => (
                  <li key={item.number}>
                    <button
                      type="button"
                      data-quran-surah
                      onClick={() => handlePlaySurah(item.number)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60",
                        item.number === surah &&
                          "bg-primary/10 text-primary",
                      )}
                    >
                      <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {item.number}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {item.ayahs}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}

      <button
        type="button"
        className="fixed right-4 z-40"
        style={{
          bottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
        aria-label={expanded ? "Hide Surah list" : "Show Surah list"}
        aria-expanded={expanded}
        onClick={handleToggleExpanded}
      >
        <div
          className={cn(
            "pointer-events-none rounded-full ring-2 ring-offset-2 ring-offset-background transition-opacity",
            isPaused ? "opacity-40" : "opacity-100",
          )}
        />
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={expanded ? "Hide Surah list" : "Show Surah list"}
            aria-expanded={expanded}
            className={cn(
              "grid size-10 cursor-pointer place-items-center rounded-full border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground",
              expanded && "text-foreground",
            )}
            onClick={openPanel}
          >
            <ListMusic className="size-4" aria-hidden />
          </button>

          <button
            type="button"
            aria-label={isPaused ? "Play Quran" : "Pause Quran"}
            onClick={isPaused ? handlePlay : handlePause}
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
          >
            {isPaused ? (
              <Headphones className="size-5" aria-hidden />
            ) : (
              <Pause className="size-5" aria-hidden />
            )}
          </button>
        </div>
      </button>
    </div>
  );
}
