import { useCallback, useMemo, useRef, useState } from "react";
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
import { SURAHS } from "@/lib/student-os/quran";
import { cn } from "@/lib/utils";
import { quranPlayer, useQuranPlayer } from "@/state/quran-player";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function QuranPlayer() {
  const state = useQuranPlayer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLDivElement | null>(null);

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

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SURAHS.slice(0, 50);
    return SURAHS.filter(
      (surah) =>
        surah.name.toLowerCase().includes(term) ||
        String(surah.number) === term,
    ).slice(0, 60);
  }, [query]);

  const current = SURAHS[state.surah - 1] ?? SURAHS[0];

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {open ? (
        <div
          ref={panel}
          className="pointer-events-auto left-4 right-4 z-50 flex w-full flex-col overflow-auto bg-card shadow-2xl lg:left-auto lg:right-4 lg:w-[min(22rem,calc(100vw-2rem))] dark:bg-[#0d2612] sm:rounded-xl mobile:max-h-[55vh]"
        >
          <div className="relative border-b bg-background px-3 py-2 sm:px-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <Headphones className="size-3.5 text-primary" aria-hidden />
              Quran Player
            </p>
            <button
              type="button"
              aria-label="Close player"
              className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <ChevronUp className="size-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-2 border-b px-3 py-3 sm:px-4">
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
                  &lt;
                </button>
                <button
                  type="button"
                  aria-label={state.playing ? "Pause" : "Play"}
                  onClick={() => quranPlayer.toggle()}
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
                  &gt;
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

              <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
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

            {state.error ? (
              <p className="text-xs text-destructive">{state.error}</p>
            ) : null}
          </div>

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

          <ul className="max-h-52 overflow-y-auto p-2">
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
                    onClick={() => quranPlayer.play(surah.number)}
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

      <div className="fixed right-4 z-50">
        <div
          className="flex h-12 items-center"
          style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            aria-label={open ? "Hide Surah list" : "Show Surah list"}
            aria-expanded={open}
            className={cn(
              "grid size-10 cursor-pointer place-items-center rounded-full border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground",
              open && "text-foreground",
            )}
            onClick={() => {
              const next = !open;
              setOpen(next);
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
            onClick={() => quranPlayer.toggle()}
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
          >
            {state.playing ? (
              <Pause className="size-5" aria-hidden />
            ) : (
              <Headphones className="size-5" aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
