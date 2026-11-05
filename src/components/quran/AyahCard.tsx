/**
 * One Ayah of the reading view.
 *
 * Arabic is the visual priority: its own size and line-height, RTL direction
 * and a Quran-compatible face. The translation sits underneath and can be
 * hidden without touching the Arabic. The card is memoised because a long
 * Surah renders hundreds of them and playback updates the player several times
 * a second.
 */

import { memo, type MouseEvent } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Copy,
  Languages,
  Pause,
  Play,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AyahText } from "@/lib/student-os/quran-text";
import type { QuranLayout } from "@/lib/student-os/quran-prefs";
import { cn } from "@/lib/utils";

export interface AyahCardProps {
  surah: number;
  ayah: AyahText;
  total: number;
  /** This is the Ayah the reciter is on. */
  active: boolean;
  playing: boolean;
  bookmarked: boolean;
  showTranslation: boolean;
  showTransliteration: boolean;
  arabicSize: number;
  translationSize: number;
  lineHeight: number;
  layout: QuranLayout;
  translationName: string;
  /** Handlers take the Ayah number so the parent can keep them stable. */
  onPlay: (ayahNumber: number) => void;
  onCopyArabic: (ayah: AyahText) => void;
  onCopyTranslation: (ayah: AyahText) => void;
  onBookmark: (ayah: AyahText) => void;
  onShare: (ayah: AyahText) => void;
}

export const AyahCard = memo(function AyahCard({
  ayah,
  total,
  active,
  playing,
  bookmarked,
  showTranslation,
  showTransliteration,
  arabicSize,
  translationSize,
  lineHeight,
  layout,
  translationName,
  onPlay,
  onCopyArabic,
  onCopyTranslation,
  onBookmark,
  onShare,
}: AyahCardProps) {
  const handleBodyClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-ayah-action]")) return;
    // Selecting Arabic text to copy should never start playback.
    if (window.getSelection()?.toString()) return;
    onPlay(ayah.numberInSurah);
  };

  return (
    <div
      data-ayah={ayah.numberInSurah}
      data-active={active || undefined}
      className={cn(
        "group relative cursor-pointer border-b border-border/50 transition-colors duration-300 last:border-b-0",
        layout === "compact" ? "px-1 py-4 sm:px-2" : "px-1 py-7 sm:px-2",
        active ? "bg-primary/[0.07]" : "hover:bg-muted/30",
      )}
      onClick={handleBodyClick}
    >
      {/* The blue spine marks the Ayah being recited. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 rounded-full transition-opacity duration-300",
          active ? "bg-primary opacity-100" : "opacity-0",
        )}
      />

      <div
        data-ayah-action
        className="mb-2 flex items-center justify-between gap-2 px-3 sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground tabular-nums uppercase">
            Ayah {ayah.numberInSurah}
            <span className="text-muted-foreground/60"> of {total}</span>
          </span>
          {active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
              {playing ? "Playing" : "Paused"}
            </span>
          ) : null}
          {bookmarked ? (
            <BookmarkCheck
              className="size-3.5 shrink-0 text-primary"
              aria-label="Bookmarked"
            />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              active && playing ? "Pause this Ayah" : "Play this Ayah"
            }
            title={active && playing ? "Pause" : "Play this Ayah"}
            className={cn("rounded-full", active && "text-primary")}
            onClick={() => onPlay(ayah.numberInSurah)}
          >
            {active && playing ? (
              <Pause className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Copy Arabic text"
            title="Copy Arabic"
            className="rounded-full text-muted-foreground"
            onClick={() => onCopyArabic(ayah)}
          >
            <Copy className="size-3.5" aria-hidden />
          </Button>
          {showTranslation ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy translation"
              title="Copy translation"
              className="hidden rounded-full text-muted-foreground sm:inline-flex"
              onClick={() => onCopyTranslation(ayah)}
            >
              <Languages className="size-3.5" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this Ayah"}
            title={bookmarked ? "Remove bookmark" : "Bookmark"}
            className={cn(
              "rounded-full",
              bookmarked ? "text-primary" : "text-muted-foreground",
            )}
            onClick={() => onBookmark(ayah)}
          >
            <Bookmark
              className="size-3.5"
              aria-hidden
              fill={bookmarked ? "currentColor" : "none"}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Share this Ayah"
            title="Share"
            className="hidden rounded-full text-muted-foreground sm:inline-flex"
            onClick={() => onShare(ayah)}
          >
            <Share2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <p
        dir="rtl"
        lang="ar"
        className="quran-arabic px-3 text-foreground sm:px-4"
        style={{ fontSize: `${arabicSize}px`, lineHeight }}
      >
        {ayah.arabic}
      </p>

      {showTransliteration && ayah.transliteration ? (
        <p
          lang="en-Latn"
          dir="ltr"
          className="mt-3 px-3 text-[13px] leading-relaxed text-muted-foreground/80 italic sm:px-4"
        >
          {ayah.transliteration}
        </p>
      ) : null}

      {showTranslation ? (
        <p
          className="mt-3 px-3 leading-relaxed text-muted-foreground sm:px-4"
          style={{ fontSize: `${translationSize}px` }}
        >
          {ayah.translation}
        </p>
      ) : null}

      {showTranslation ? (
        <p className="mt-2 px-3 text-[10px] tracking-wide text-muted-foreground/50 uppercase sm:px-4">
          {translationName}
        </p>
      ) : null}
    </div>
  );
});
