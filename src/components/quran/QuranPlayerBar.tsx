/**
 * Sticky reading player.
 *
 * Built on the shared `quran-player` store, so it never plays a second stream
 * over the floating player. It shows the Ayah it is actually playing — no
 * timing estimate — and stays visible while the page scrolls.
 */

import {
  ChevronUp,
  Gauge,
  ListEnd,
  MoreHorizontal,
  Pause,
  Play,
  Repeat1,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import {
  PLAYBACK_RATES,
  quranPlayer,
  useQuranPlayer,
} from "@/state/quran-player";
import { ayahCount, reciterName, surahName } from "@/lib/student-os/quran";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export interface QuranPlayerBarProps {
  arabicName?: string;
}

export function QuranPlayerBar({ arabicName }: QuranPlayerBarProps) {
  const state = useQuranPlayer();
  const total = ayahCount(state.surah);
  const surahProgress = total > 0 ? ((state.ayah - 1) / total) * 100 : 0;
  const ayahProgress =
    state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 backdrop-blur-md lg:bottom-0 lg:left-64">
      <div className="mx-auto max-w-6xl px-3 pt-2 pb-2.5 sm:px-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
            Ayah {state.ayah}/{total}
          </span>
          <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/60 transition-[width] duration-500"
              style={{ width: `${surahProgress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            type="button"
            size="icon"
            aria-label={state.playing ? "Pause recitation" : "Play recitation"}
            className="size-10 shrink-0 rounded-full"
            onClick={() => quranPlayer.toggle()}
          >
            {state.playing ? (
              <Pause className="size-4" aria-hidden />
            ) : (
              <Play className="size-4 translate-x-px" aria-hidden />
            )}
          </Button>

          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-xs font-semibold sm:text-sm">
                {surahName(state.surah)}
              </span>
              {arabicName ? (
                <span
                  dir="rtl"
                  lang="ar"
                  className="arabic-name hidden shrink-0 text-sm text-muted-foreground sm:inline"
                >
                  {arabicName.replace(/^سُورَةُ\s*/, "")}
                </span>
              ) : null}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Ayah {state.ayah} of {total} · {reciterName(state.reciter)}
              {state.loading ? " · loading…" : ""}
            </p>
          </div>

          <div className="hidden max-w-xs flex-1 items-center gap-2 md:flex">
            <Slider
              value={[ayahProgress]}
              max={100}
              step={0.5}
              aria-label="Seek within this Ayah"
              disabled={state.duration <= 0}
              onValueChange={([value]) =>
                quranPlayer.seek((value / 100) * state.duration)
              }
            />
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {formatTime(state.currentTime)}
              <span className="text-muted-foreground/60">
                {" / "}
                {state.duration > 0 ? formatTime(state.duration) : "–:––"}
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous Ayah"
              className="rounded-full"
              disabled={state.ayah <= 1}
              onClick={() => quranPlayer.previous()}
            >
              <SkipBack className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next Ayah"
              className="rounded-full"
              disabled={
                state.ayah >= total &&
                !(state.continueNextSurah && state.surah < 114)
              }
              onClick={() => quranPlayer.next()}
            >
              <SkipForward className="size-4" aria-hidden />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Repeat this Ayah"
              aria-pressed={state.repeatAyah}
              title="Repeat this Ayah"
              className={cn(
                "hidden rounded-full sm:inline-flex",
                state.repeatAyah && "bg-primary/10 text-primary",
              )}
              onClick={() => quranPlayer.toggleRepeatAyah()}
            >
              <Repeat1 className="size-4" aria-hidden />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Playback speed"
                  title="Playback speed"
                  className="rounded-full"
                >
                  <Gauge className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuLabel>Speed</DropdownMenuLabel>
                {PLAYBACK_RATES.map((rate) => (
                  <DropdownMenuItem
                    key={rate}
                    onSelect={() => quranPlayer.setRate(rate)}
                    className={cn(
                      "cursor-pointer justify-between",
                      state.rate === rate && "text-primary",
                    )}
                  >
                    {rate}×
                    {state.rate === rate ? <span aria-hidden>•</span> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={state.muted ? "Unmute" : "Mute"}
              className="hidden rounded-full sm:inline-flex"
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
              className="hidden w-16 lg:flex"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="More playback options"
                  className="rounded-full"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Playback</DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => quranPlayer.toggleRepeatAyah()}
                >
                  <Repeat1 className="size-4" aria-hidden />
                  Repeat this Ayah
                  {state.repeatAyah ? (
                    <span className="ml-auto text-xs text-primary">On</span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => quranPlayer.toggleRepeatSurah()}
                >
                  <Repeat className="size-4" aria-hidden />
                  Repeat this Surah
                  {state.repeatSurah ? (
                    <span className="ml-auto text-xs text-primary">On</span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => quranPlayer.toggleContinueNextSurah()}
                >
                  <ListEnd className="size-4" aria-hidden />
                  Continue to next Surah
                  {state.continueNextSurah ? (
                    <span className="ml-auto text-xs text-primary">On</span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => quranPlayer.toggleMute()}
                >
                  {state.muted ? (
                    <VolumeX className="size-4" aria-hidden />
                  ) : (
                    <Volume2 className="size-4" aria-hidden />
                  )}
                  {state.muted ? "Unmute" : "Mute"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => quranPlayer.previousSurah()}
                  disabled={state.surah <= 1}
                >
                  <ChevronUp className="size-4" aria-hidden />
                  Previous Surah
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => quranPlayer.nextSurah()}
                  disabled={state.surah >= 114}
                >
                  <ChevronUp className="size-4 rotate-180" aria-hidden />
                  Next Surah
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => quranPlayer.restart()}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Restart this Ayah
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 md:hidden">
          <Slider
            value={[ayahProgress]}
            max={100}
            step={0.5}
            aria-label="Seek within this Ayah"
            disabled={state.duration <= 0}
            onValueChange={([value]) =>
              quranPlayer.seek((value / 100) * state.duration)
            }
          />
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {formatTime(state.currentTime)}
            <span className="text-muted-foreground/60">
              {" / "}
              {state.duration > 0 ? formatTime(state.duration) : "–:––"}
            </span>
          </span>
        </div>

        {state.error ? (
          <div className="mt-1.5 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[11px] text-destructive">
              {state.error}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2 text-[11px]"
              onClick={() => {
                quranPlayer.clearError();
                quranPlayer.resume();
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
