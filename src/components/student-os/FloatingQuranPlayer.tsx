import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  Headphones,
  ListMusic,
  Pause,
  Play,
  Search,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { SURAHS, surahAudioUrl, surahName } from "@/lib/student-os/quran";
import { cn } from "@/lib/utils";
import { quranPlayer, useQuranPlayer } from "@/state/quran-player";

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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function FloatingQuranPlayer() {
  const state = useQuranPlayer();
  const [expanded, setExpanded] = useState(state.expanded);
  const [query, setQuery] = useState("");
  const [panelMaxWidth, setPanelMaxWidth] = useState(360);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  // Restore the last opened surah once the state has settled.
  useEffect(() => {
    const stored = readStored();
    if (state.surah !== stored.surah) {
      quranPlayer.play(stored.surah);
    }
    // Keep the open/closed decision in sync with what we persist.
    if (expanded !== stored.expanded) {
      setExpanded(stored.expanded);
    }
  }, []);

  // Persist open/closed and the last played surah when either changes.
  useEffect(() => {
    writeStored(state.surah, expanded);
  }, [state.surah, expanded]);

  // Keep the panel width clamped as the window resizes.
  useEffect(() => {
    const update = () => {
      const next = Math.min(360, Math.max(320, window.innerWidth - 32));
      setPanelMaxWidth(next);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const openPanel = useCallback(() => {
    if (!panel.current) return;
    try {
      const current = panel.current.querySelector("[data-quran-surah]");
      if (current) {
        const top = current.getBoundingClientRect().top;
        panel.current.scrollTo({
          top: panel.current.scrollTop + top,
          behavior: "smooth",
        });
      }
    } catch {
      /* ignore stale refs */
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(openPanel, 60);
    return () => clearTimeout(timer);
  }, [expanded, openPanel]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SURAHS.slice(0, 50);
    return SURAHS
      .filter(
        (surah) =>
          surah.name.toLowerCase().includes(term) ||
          String(surah.number) === term,
      )
      .slice(0, 60);
  }, [query]);

  const current = SURAHS[state.surah - 1] ?? SURAHS[0];

  const handlePlay = useCallback(() => {
    quranPlayer.toggle();
    setError(null);
  }, []);

  const handlePlaySurah = useCallback(
    (surah: number) => {
      quranPlayer.play(surah);
      setError(null);
    },
    [],
  );

  const handleError = useCallback(() => {
    if (state.error) {
      setError(state.error);
    }
  }, [state.error]);

  useEffect(() => {
    handleError();
  }, [state.error, handleError]);

  return (
    <div className="relative z-40">
      {state.expanded ? (
        <div
          ref={panel}
          className="pointer-events-auto z-40 flex w-full flex-col overflow-auto bg-card shadow-2xl border border-border sm:rounded-xl sm:border"
          style={{
            width: "100%",
            maxWidth: `${panelMaxWidth}px`,
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
            <button
              type="button"
              aria-label="Minimize player"
              className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setExpanded(false)}
            >
              <ChevronUp className="size-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-2 border-b border-border px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {current.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatTime(state.currentTime)}
                {state.duration > 0 ? ` / ${formatTime(state.duration)}` : ""}
              </span>
            </div>

            <Slider
              value={[
                state.duration > 0
                  ? (state.currentTime / state.duration) * 100
                  : 0,
              ]}
              max={100}
              step={0.1}
              aria-label="Seek"
              onValueChange={([value]) => {
                if (state.duration > 0) {
                  quranPlayer.seek((value / 100) * state.duration);
                }
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous Surah"
                  disabled={state.surah <= 1}
                  className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  onClick={() => quranPlayer.previous()}
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  aria-label={state.playing ? "Pause" : "Play"}
                  onClick={handlePlay}
                  className="grid size-8 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
                >
                  {state.playing ? (
                    <Pause className="size-4" aria-hidden />
                  ) : (
                    <Play className="size-4 translate-x-px" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Next Surah"
                  disabled={state.surah >= SURAHS.length}
                  className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  onClick={() => quranPlayer.next()}
                >
                  {">"}
                </button>
                <button
                  type="button"
                  aria-label="Stop"
                  className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => quranPlayer.stop()}
                >
                  <Square className="size-3.5" aria-hidden />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label={state.muted ? "Unmute" : "Mute"}
                  className="cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => quranPlayer.toggleMute()}
                >
                  {state.muted ? (
                    <VolumeX className="size-4" aria-hidden />
                  ) : (
                    <Volume2 className="size-4" aria-hidden />
                  )}
                </button>
                <Slider
                  value={[state.muted ? 0 : state.volume * 100]}
                  max={100}
                  step={1}
                  aria-label="Volume"
                  onValueChange={([value]) =>
                    quranPlayer.setVolume(value / 100)
                  }
                  className="w-20"
                />
              </div>
            </div>
          </div>

          {state.error ? (
            <p className="text-xs text-destructive">{state.error}</p>
          ) : error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}

          <div className="px-3 pt-3 sm:px-4 sm:pt-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Surah"
                autoComplete="off"
                aria-label="Search Surah"
                className="h-9 pl-9"
              />
            </div>
          </div>

          <ul className="max-h-48 overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                No Surah matches "{query}".
              </li>
            ) : (
              results.map((surah) => (
                <li key={surah.number}>
                  <button
                    data-quran-surah
                    type="button"
                    onClick={() => handlePlaySurah(surah.number)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/60",
                      surah.number === state.surah &&
                        "bg-primary/10 text-primary",
                    )}
                  >
                    <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {surah.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {surah.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {surah.ayahs}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        className="fixed right-4 z-40"
        style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
        aria-label={expanded ? "Hide Surah list" : "Show Surah list"}
        aria-expanded={expanded}
      >
        <div
          className={cn(
            "pointer-events-none rounded-full ring-2 ring-offset-2 ring-offset-background transition-opacity",
            state.playing ? "opacity-100" : "opacity-40",
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
            onClick={() => {
              const next = !expanded;
              setExpanded(next);
              if (next) {
                openPanel();
              }
            }}
          >
            <ListMusic className="size-4" aria-hidden />
          </button>

          <button
            type="button"
            aria-label={state.playing ? "Pause Quran" : "Play Quran"}
            onClick={handlePlay}
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
          >
            {state.playing ? (
              <Pause className="size-5" aria-hidden />
            ) : (
              <Headphones className="size-5" aria-hidden />
            )}
          </button>
        </div>
      </button>
    </div>
  );
}
