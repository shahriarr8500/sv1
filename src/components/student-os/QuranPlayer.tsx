/**
 * Quran player — a persistent mini-player plus an expanded panel with
 * search, transport controls, seeking and volume.
 *
 * It is mounted once in `AppShell`, so it keeps playing across route
 * changes. It uses theme tokens only, so dark mode works without extra
 * configuration, and collapses to a bottom bar on mobile.
 *
 * Deliberately outside the game: no XP, no streak, no achievement hooks.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Pause,
  Play,
  Search,
  Square,
  Volume2,
  VolumeX,
  X,
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

export function QuranPlayer() {
  const state = useQuranPlayer();
  const [query, setQuery] = useState("");

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
  const expanded = state.expanded;

  return (
    <>
      {/* Expanded panel */}
      {expanded ? (
        <div
          role="dialog"
          aria-label="Quran player"
          className="fixed inset-x-0 bottom-16 z-50 max-h-[70vh] overflow-y-auto border-t bg-card shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-96 sm:rounded-xl sm:border"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <Headphones className="size-3.5 text-primary" aria-hidden />
              Quran Player
            </p>
            <button
              type="button"
              aria-label="Close player"
              className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => quranPlayer.setExpanded(false)}
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>

          <div className="px-4 py-3">
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
                className="pl-9"
              />
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto px-2 pb-2">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No Surah matches “{query}”.
              </p>
            ) : (
              <ul>
                {results.map((surah) => (
                  <li key={surah.number}>
                    <button
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
                ))}
              </ul>
            )}
          </div>

          {state.error ? (
            <p className="border-t px-4 py-2 text-xs text-destructive">
              {state.error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Persistent mini-player */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-auto sm:rounded-full sm:border sm:px-4 sm:shadow-lg">
        <div className="flex items-center gap-2 sm:gap-3">
          {!expanded ? (
            <button
              type="button"
              aria-label="Open Quran player"
              title="Quran player"
              className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-primary"
              onClick={() => quranPlayer.setExpanded(true)}
            >
              <Headphones className="size-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Close player list"
              className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => quranPlayer.setExpanded(false)}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}

          <div className="hidden min-w-0 sm:block">
            <p className="max-w-40 truncate text-xs font-medium">
              {current.name}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {state.playing
                ? "Playing"
                : state.loading
                  ? "Loading…"
                  : "Paused"}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous Surah"
              className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              disabled={state.surah <= 1}
              onClick={() => quranPlayer.previous()}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>

            <button
              type="button"
              aria-label={state.playing ? "Pause" : "Play"}
              onClick={() => quranPlayer.toggle()}
              className="grid size-9 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
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
              className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              disabled={state.surah >= SURAHS.length}
              onClick={() => quranPlayer.next()}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>

            <button
              type="button"
              aria-label="Stop"
              className="hidden cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground sm:block"
              onClick={() => quranPlayer.stop()}
            >
              <Square className="size-3.5" aria-hidden />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
              {formatTime(state.currentTime)}
            </span>

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
              className="hidden w-28 sm:block"
            />

            <button
              type="button"
              aria-label={state.muted ? "Unmute" : "Mute"}
              className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
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
              onValueChange={([value]) => quranPlayer.setVolume(value / 100)}
              className="hidden w-20 sm:block"
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** Compact entry point used by Settings. */
export function QuranPlayerShortcut() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="cursor-pointer gap-1.5"
      onClick={() => quranPlayer.setExpanded(true)}
    >
      <Headphones className="size-3.5" aria-hidden />
      Open player
    </Button>
  );
}
