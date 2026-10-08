/**
 * Floating Quran player — always reachable, never in the way.
 *
 * Runs on the shared `quran-player` store, so there is exactly one audio
 * element for the whole app: the floating control, the Quran page and any
 * other surface stay in sync and can never double-play.
 *
 * On mobile it sits above the fixed bottom navigation (plus safe-area), so
 * neither ever covers the other.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Headphones,
  ListMusic,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** Bottom offsets: clear the mobile tab bar (64px) + safe area; desktop is lower. */
const BUTTON_BOTTOM = "bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-[calc(16px+env(safe-area-inset-bottom))]";
const PANEL_BOTTOM = "bottom-[calc(140px+env(safe-area-inset-bottom))] lg:bottom-[calc(76px+env(safe-area-inset-bottom))]";

export function FloatingQuranPlayer() {
  const state = useQuranPlayer();
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  const current = SURAHS[state.surah - 1] ?? SURAHS[0];

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SURAHS;
    return SURAHS.filter(
      (surah) =>
        surah.name.toLowerCase().includes(term) ||
        String(surah.number) === term,
    );
  }, [query]);

  // The panel opens pre-scrolled to the current surah.
  const scrollPanel = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    try {
      const currentRow = panel.querySelector("[data-quran-surah]");
      if (currentRow) {
        const top = currentRow.getBoundingClientRect().top;
        panel.scrollTo({
          top: panel.scrollTop + top,
          behavior: "smooth",
        });
      }
    } catch {
      /* stale ref during unmount */
    }
  }, []);

  useEffect(() => {
    if (!state.expanded) return;
    const timer = setTimeout(scrollPanel, 60);
    return () => clearTimeout(timer);
  }, [state.expanded, scrollPanel]);

  const expanded = state.expanded;
  const playing = state.playing;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      {expanded ? (
        <div
          ref={panelRef}
          data-quran-player
          className={cn(
            "pointer-events-auto fixed right-4 left-auto flex w-[calc(100vw-2rem)] flex-col overflow-auto rounded-xl border bg-card shadow-2xl sm:w-[360px]",
            PANEL_BOTTOM,
          )}
          style={{
            maxHeight:
              "calc(100dvh - 200px - env(safe-area-inset-bottom))",
          }}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-3 py-2 sm:px-4">
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
              onClick={() => quranPlayer.setExpanded(false)}
            >
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="space-y-3 border-b px-3 py-3 sm:px-4">
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
              disabled={state.duration <= 0}
              onValueChange={([value]) => {
                if (state.duration > 0) {
                  quranPlayer.seek((value / 100) * state.duration);
                }
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous Surah"
                  disabled={state.surah <= 1}
                  className="rounded-full"
                  onClick={() => quranPlayer.previous()}
                >
                  <SkipBack className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  aria-label={playing ? "Pause" : "Play"}
                  className="rounded-full"
                  onClick={() => quranPlayer.toggle()}
                >
                  {playing ? (
                    <Pause className="size-4" aria-hidden />
                  ) : (
                    <Play className="size-4 translate-x-px" aria-hidden />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next Surah"
                  disabled={state.surah >= SURAHS.length}
                  className="rounded-full"
                  onClick={() => quranPlayer.next()}
                >
                  <SkipForward className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Stop"
                  className="rounded-full"
                  onClick={() => quranPlayer.stop()}
                >
                  <Square className="size-3.5" aria-hidden />
                </Button>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={state.muted ? "Unmute" : "Mute"}
                  className="rounded-full"
                  onClick={() => quranPlayer.toggleMute()}
                >
                  {state.muted ? (
                    <VolumeX className="size-4" aria-hidden />
                  ) : (
                    <Volume2 className="size-4" aria-hidden />
                  )}
                </Button>
                <Slider
                  value={[state.muted ? 0 : state.volume * 100]}
                  max={100}
                  step={1}
                  aria-label="Volume"
                  onValueChange={([value]) => quranPlayer.setVolume(value / 100)}
                  className="w-20"
                />
              </div>
            </div>

            {state.error ? (
              <p className="text-xs text-destructive">{state.error}</p>
            ) : null}
          </div>

          <div className="border-b px-3 py-3 sm:px-4">
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

          <ul className="max-h-56 overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                No Surah matches &quot;{query}&quot;.
              </li>
            ) : (
              results.map((surah) => (
                <li key={surah.number}>
                  <button
                    type="button"
                    data-quran-surah
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

      {/* Collapsed controls — two sibling buttons (never nested). */}
      <div
        className={cn(
          "pointer-events-auto fixed right-4 flex items-end gap-2",
          BUTTON_BOTTOM,
        )}
      >
        <button
          type="button"
          aria-label={expanded ? "Hide Surah list" : "Show Surah list"}
          aria-expanded={expanded}
          className={cn(
            "grid size-10 cursor-pointer place-items-center rounded-full border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            expanded && "text-foreground",
          )}
          onClick={() => quranPlayer.setExpanded(!expanded)}
        >
          <ListMusic className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          aria-label={playing ? "Pause Quran" : "Play Quran"}
          className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          onClick={() => quranPlayer.toggle()}
        >
          {playing ? (
            <Pause className="size-5" aria-hidden />
          ) : (
            <Headphones className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
