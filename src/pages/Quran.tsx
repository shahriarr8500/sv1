/**
 * Quran — a quiet, separate spiritual space.
 *
 * Deliberately outside the gamification system: no XP, no streaks, no
 * rewards. Just the daily verse, the surah library, and the shared player
 * that keeps following you around the app.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpenText,
  Headphones,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { DailyGuidance } from "@/components/student-os/DailyGuidance";
import { SURAHS } from "@/lib/student-os/quran";
import { cn } from "@/lib/utils";
import { quranPlayer, useQuranPlayer } from "@/state/quran-player";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function QuranPage() {
  const state = useQuranPlayer();
  const [query, setQuery] = useState("");

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-3xl space-y-6"
    >
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Quran
        </h1>
        <p className="text-sm text-muted-foreground">
          A calm moment in your day — listen, reflect, continue.
        </p>
      </div>

      {/* Daily Guidance */}
      <DailyGuidance />

      {/* Now playing */}
      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <Headphones className="size-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">Now playing</CardTitle>
              <p className="truncate text-sm text-muted-foreground">
                {current.name} · {current.ayahs} ayahs
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
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
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{formatTime(state.currentTime)}</span>
              <span>
                {state.duration > 0 ? formatTime(state.duration) : "—"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button
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
                size="icon"
                aria-label={state.playing ? "Pause" : "Play"}
                className="size-10 rounded-full"
                onClick={() => quranPlayer.toggle()}
              >
                {state.playing ? (
                  <Pause className="size-5" aria-hidden />
                ) : (
                  <Play className="size-5 translate-x-px" aria-hidden />
                )}
              </Button>
              <Button
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
                variant="ghost"
                size="icon"
                aria-label="Stop"
                className="rounded-full"
                onClick={() => quranPlayer.stop()}
              >
                <Square className="size-3.5" aria-hidden />
              </Button>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <Button
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
                className="w-28"
              />
            </div>
          </div>

          {state.error ? (
            <p className="text-xs text-destructive">{state.error}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Surah library */}
      <section aria-labelledby="surah-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="surah-heading"
            className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            Surahs
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {results.length} of {SURAHS.length}
          </p>
        </div>

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
            className="h-10 pl-9"
          />
        </div>

        {results.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm font-semibold tracking-tight">
              No Surah matches &quot;{query}&quot;
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different name, or search by number.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul>
              {results.map((surah) => (
                <li key={surah.number}>
                  <button
                    type="button"
                    onClick={() => quranPlayer.play(surah.number)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3.5 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50",
                      surah.number === state.surah && "bg-primary/5",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums",
                        surah.number === state.surah
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {surah.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {surah.name}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {surah.ayahs} ayahs
                      </span>
                    </span>
                    {surah.number === state.surah && state.playing ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
                        <BookOpenText className="size-3.5" aria-hidden />
                        Playing
                      </span>
                    ) : (
                      <Play
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </motion.div>
  );
}
