/**
 * Quran — reading and listening, Ayah by Ayah.
 *
 * The text is real Quran text from the AlQuran Cloud API (Tanzil Uthmani
 * Arabic plus a published English translation paired by Ayah number). Nothing
 * on this page is generated: if the source fails, the page says so instead of
 * showing invented text.
 *
 * Playback is per Ayah. Because each Ayah is its own audio file, the highlight
 * and the auto-scroll follow the file that is actually playing — there are no
 * interpolated timestamps and no guessed highlight positions.
 *
 * Deliberately outside the gamification system: no XP, no streaks, no rewards.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router";
import {
  Bookmark,
  BookOpenText,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ListMusic,
  Loader2,
  MoonStar,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { DailyGuidance } from "@/components/student-os/DailyGuidance";
import { AyahCard } from "@/components/quran/AyahCard";
import { QuranBookmarksSheet } from "@/components/quran/QuranBookmarksSheet";
import { QuranPlayerBar } from "@/components/quran/QuranPlayerBar";
import { QuranSettingsSheet } from "@/components/quran/QuranSettingsSheet";
import { SurahPanel } from "@/components/quran/SurahPanel";
import {
  BISMILLAH,
  SURAHS,
  ayahCount,
  getTranslation,
  showsSeparateBismillah,
  surahName,
} from "@/lib/student-os/quran";
import type { AyahText } from "@/lib/student-os/quran-text";
import {
  quranPlayer,
  useQuranActiveKey,
  useQuranAyah,
  useQuranPlaying,
  useQuranSurah,
} from "@/state/quran-player";
import { useQuranPrefs } from "@/state/quran-prefs";
import {
  retrySurahText,
  useSurahIndex,
  useSurahText,
} from "@/state/quran-content";
import { useQuranReading } from "@/state/quran-reading";
import { toast } from "sonner";

/** Anything the browser cannot copy through the Clipboard API. */
async function copyText(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy to the clipboard.");
  }
}

export default function QuranPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefs = useQuranPrefs();

  const surah = useQuranSurah();
  const playerAyah = useQuranAyah();
  const playing = useQuranPlaying();
  const activeKey = useQuranActiveKey();

  const index = useSurahIndex();
  const content = useSurahText(surah, prefs.translation);
  const reading = useQuranReading();
  const { toggleBookmark, savePosition, markSurahRead } = reading;

  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  /** Top-most Ayah in view — the reading position that gets saved. */
  const [position, setPosition] = useState({ surah, ayah: playerAyah });

  const interactedRef = useRef(false);
  const pendingScrollRef = useRef<number | null>(null);
  const markedRef = useRef<Set<number>>(new Set());
  const topRef = useRef<HTMLDivElement | null>(null);
  const deepLinkApplied = useRef(false);

  const meta = useMemo(
    () => index.metas.find((entry) => entry.number === surah),
    [index.metas, surah],
  );
  const total = ayahCount(surah);
  const ayahs = content.text?.ayahs;
  const translation = getTranslation(prefs.translation);

  const activeAyah =
    activeKey && activeKey.startsWith(`${surah}:`)
      ? Number(activeKey.slice(surah.toString().length + 1))
      : null;
  const visibleAyah = position.surah === surah ? position.ayah : 1;

  const completedSurahs = useMemo(
    () => reading.reading?.completedSurahs ?? [],
    [reading.reading],
  );
  const completedSet = useMemo(
    () => new Set(completedSurahs),
    [completedSurahs],
  );
  const isRead = completedSet.has(surah);

  const arabicShort = meta?.arabicName
    ? meta.arabicName.replace(/^سُورَةُ\s*/, "")
    : "";
  const resume = reading.reading;
  const showResume =
    !resumeDismissed &&
    !reading.loading &&
    resume !== null &&
    resume.lastSurah !== surah;

  /* ------------------------------------------------------------------ */
  /* URL                                                                */
  /* ------------------------------------------------------------------ */

  const syncUrl = useCallback(
    (nextSurah: number, nextAyah: number) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("surah", String(nextSurah));
          next.set("ayah", String(nextAyah));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const requestedSurah = useMemo(() => {
    const raw = Number(searchParams.get("surah"));
    return Number.isInteger(raw) && raw >= 1 && raw <= SURAHS.length
      ? raw
      : null;
  }, [searchParams]);

  const requestedAyah = useMemo(() => {
    const raw = Number(searchParams.get("ayah"));
    return Number.isInteger(raw) && raw >= 1 ? raw : null;
  }, [searchParams]);

  // Deep link (?surah=18&ayah=10) wins once, on the first render.
  useEffect(() => {
    if (deepLinkApplied.current) return;
    deepLinkApplied.current = true;
    if (requestedSurah === null) return;
    if (requestedSurah === surah && (requestedAyah ?? 1) === playerAyah) return;
    quranPlayer.selectAyah(requestedSurah, requestedAyah ?? 1);
    pendingScrollRef.current = requestedAyah ?? 1;
  }, [requestedSurah, requestedAyah, surah, playerAyah]);

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */

  const focusTop = useCallback(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleSelectSurah = useCallback(
    (nextSurah: number) => {
      interactedRef.current = true;
      quranPlayer.selectAyah(nextSurah, 1);
      setPosition({ surah: nextSurah, ayah: 1 });
      syncUrl(nextSurah, 1);
      focusTop();
    },
    [focusTop, syncUrl],
  );

  const handlePlaySurah = useCallback(
    (nextSurah: number) => {
      interactedRef.current = true;
      quranPlayer.play(nextSurah);
      setPosition({ surah: nextSurah, ayah: 1 });
      syncUrl(nextSurah, 1);
      focusTop();
    },
    [focusTop, syncUrl],
  );

  const handleJump = useCallback(
    (nextSurah: number, nextAyah: number) => {
      interactedRef.current = true;
      quranPlayer.selectAyah(nextSurah, nextAyah);
      setPosition({ surah: nextSurah, ayah: nextAyah });
      syncUrl(nextSurah, nextAyah);
      if (nextSurah === surah) {
        const element = document.querySelector<HTMLElement>(
          `[data-ayah="${nextAyah}"]`,
        );
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          // The Surah is still loading — scroll as soon as it renders.
          pendingScrollRef.current = nextAyah;
        }
      } else {
        pendingScrollRef.current = nextAyah;
        focusTop();
      }
    },
    [focusTop, surah, syncUrl],
  );

  const handlePlayAyah = useCallback(
    (ayahNumber: number) => {
      interactedRef.current = true;
      quranPlayer.toggleAyah(surah, ayahNumber);
      syncUrl(surah, ayahNumber);
    },
    [surah, syncUrl],
  );

  /* ------------------------------------------------------------------ */
  /* Playback → reading position                                        */
  /* ------------------------------------------------------------------ */

  // Follow the reciter: bring the playing Ayah into view, but never yank the
  // page when the reader has scrolled somewhere else on purpose.
  useEffect(() => {
    if (!playing || activeAyah === null || !prefs.autoScroll) return;
    const element = document.querySelector<HTMLElement>(
      `[data-ayah="${activeAyah}"]`,
    );
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const safeTop = 96;
    const safeBottom = window.innerHeight - 168;
    if (rect.top < safeTop || rect.bottom > safeBottom) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeAyah, playing, prefs.autoScroll, surah]);

  // Scroll spy: whichever Ayah sits at the reading line is "where I am".
  useEffect(() => {
    if (content.status !== "ready") return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const nodes = document.querySelectorAll<HTMLElement>("[data-ayah]");
      const line = window.innerHeight * 0.35;
      let next = 1;
      for (const node of nodes) {
        if (node.getBoundingClientRect().bottom > line) {
          const value = Number(node.dataset.ayah);
          if (Number.isInteger(value) && value > 0) next = value;
          break;
        }
      }
      setPosition((previous) =>
        previous.surah === surah && previous.ayah === next
          ? previous
          : { surah, ayah: next },
      );
    };
    const onScroll = () => {
      if (frame) return;
      interactedRef.current = true;
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [content.status, surah]);

  // Remember the position in Convex, but only after the reader has actually
  // moved — opening the page must not overwrite a position from another device.
  useEffect(() => {
    if (!interactedRef.current) return;
    const timer = setTimeout(() => {
      void savePosition({
        surah,
        ayah: Math.min(Math.max(1, visibleAyah), Math.max(1, total)),
      }).catch(() => {
        /* Position is a convenience — a failure must not interrupt reading. */
      });
    }, 1400);
    return () => clearTimeout(timer);
  }, [surah, visibleAyah, total, savePosition]);

  // A Surah counts as read once its last Ayah is genuinely in view (or the
  // reader says so). Playback alone never marks a Surah read.
  useEffect(() => {
    if (content.status !== "ready" || !ayahs || ayahs.length === 0) return;
    if (isRead) return;
    if (markedRef.current.has(surah)) return;
    const last = document.querySelector<HTMLElement>(
      `[data-ayah="${ayahs.length}"]`,
    );
    if (!last) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (markedRef.current.has(surah)) return;
        markedRef.current.add(surah);
        void markSurahRead({ surah }).catch(() => {
          markedRef.current.delete(surah);
        });
      },
      { threshold: 0.6 },
    );
    observer.observe(last);
    return () => observer.disconnect();
  }, [content.status, ayahs, surah, isRead, markSurahRead]);

  // Scroll to a deep-linked or bookmarked Ayah once its Surah has arrived.
  useEffect(() => {
    if (content.status !== "ready") return;
    const target = pendingScrollRef.current;
    if (target === null) return;
    pendingScrollRef.current = null;
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-ayah="${target}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
    // `content.text` changes identity when a different Surah arrives, even when
    // the status itself stays "ready" because the Surah was already cached.
  }, [content.status, content.text, surah]);

  /* ------------------------------------------------------------------ */
  /* Ayah actions                                                       */
  /* ------------------------------------------------------------------ */

  const handleCopyArabic = useCallback((ayah: AyahText) => {
    void copyText(ayah.arabic, "Arabic text");
  }, []);

  const handleCopyTranslation = useCallback((ayah: AyahText) => {
    void copyText(ayah.translation, "Translation");
  }, []);

  const handleShare = useCallback(
    async (ayah: AyahText) => {
      const reference = `${surahName(surah)} ${surah}:${ayah.numberInSurah}`;
      const message = `${ayah.arabic}\n\n“${ayah.translation}”\n— ${reference}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: reference, text: message });
          return;
        } catch {
          // The reader dismissed the sheet — fall back to copying quietly.
        }
      }
      await copyText(message, reference);
    },
    [surah],
  );

  const handleBookmark = useCallback(
    (ayah: AyahText) => {
      void toggleBookmark({
        surah,
        ayah: ayah.numberInSurah,
        arabic: ayah.arabic,
        translation: ayah.translation,
        translationEdition: prefs.translation,
      })
        .then((result) => {
          toast.success(result.bookmarked ? "Ayah saved" : "Bookmark removed");
        })
        .catch(() => toast.error("Could not update your saved Ayahs."));
    },
    [prefs.translation, surah, toggleBookmark],
  );

  const handleToggleRead = useCallback(() => {
    markedRef.current.add(surah);
    void markSurahRead({ surah })
      .then(() =>
        toast.success(isRead ? "Marked as unread" : "Surah marked as read"),
      )
      .catch(() => toast.error("Could not update your reading progress."));
  }, [isRead, markSurahRead, surah]);

  const loadFailed = content.status === "error";
  const isLoading = content.status === "idle" || content.status === "loading";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="space-y-5 pb-44 lg:pb-28"
      >
        {/* Page header ---------------------------------------------------- */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Quran
            </h1>
            <p className="text-sm text-muted-foreground">
              Read, listen and follow the recitation Ayah by Ayah.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer lg:hidden"
              onClick={() => setNavOpen(true)}
            >
              <ListMusic className="size-4" aria-hidden />
              Surahs
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => setBookmarksOpen(true)}
            >
              <Bookmark className="size-4" aria-hidden />
              <span className="hidden sm:inline">Saved</span>
              {reading.bookmarks.length > 0 ? (
                <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary tabular-nums">
                  {reading.bookmarks.length}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => setSettingsOpen(true)}
              aria-label="Reading settings"
            >
              <Settings2 className="size-4" aria-hidden />
              <span className="hidden sm:inline">Reading</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
          {/* Surah library ------------------------------------------------- */}
          <aside className="hidden lg:block">
            <div className="sticky top-4 flex max-h-[calc(100dvh-7rem)] flex-col rounded-xl border bg-card/40 p-3">
              <SurahPanel
                metas={index.metas}
                currentSurah={surah}
                completed={completedSurahs}
                onSelect={handleSelectSurah}
                onPlay={handlePlaySurah}
              />
            </div>
          </aside>

          {/* Reading ------------------------------------------------------- */}
          <div className="min-w-0 space-y-4">
            {showResume ? (
              <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5">
                <MoonStar
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:text-sm">
                  Continue where you left off —{" "}
                  <span className="font-medium text-foreground">
                    {surahName(resume.lastSurah)} {resume.lastSurah}:
                    {resume.lastAyah}
                  </span>
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 cursor-pointer"
                  onClick={() => handleJump(resume.lastSurah, resume.lastAyah)}
                >
                  Continue
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Dismiss"
                  className="shrink-0 rounded-full"
                  onClick={() => setResumeDismissed(true)}
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              </div>
            ) : null}

            <div
              ref={topRef}
              className="scroll-mt-20 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card/80 via-card/50 to-card/20"
            >
              {/* Surah heading */}
              <div className="border-b border-border/50 px-5 py-6 sm:px-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                      Surah {surah} of {SURAHS.length}
                    </p>
                    <h2 className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                        {meta?.englishName || surahName(surah)}
                      </span>
                      {arabicShort ? (
                        <span
                          dir="rtl"
                          lang="ar"
                          className="arabic-name text-2xl text-primary/90 sm:text-[26px]"
                        >
                          {arabicShort}
                        </span>
                      ) : null}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {meta?.englishNameTranslation
                        ? `${meta.englishNameTranslation} · `
                        : ""}
                      {total} ayahs
                      {meta?.revelation ? ` · ${meta.revelation}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      disabled={surah <= 1}
                      onClick={() => handleSelectSurah(surah - 1)}
                    >
                      <ChevronLeft className="size-4" aria-hidden />
                      <span className="hidden sm:inline">Previous</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      disabled={surah >= SURAHS.length}
                      onClick={() => handleSelectSurah(surah + 1)}
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                {showsSeparateBismillah(surah) ? (
                  <div className="mt-6 flex flex-col items-center gap-2 border-y border-border/40 py-5">
                    <p
                      dir="rtl"
                      lang="ar"
                      className="quran-arabic text-center text-[26px] leading-[2] text-foreground/90 sm:text-[30px]"
                    >
                      {BISMILLAH}
                    </p>
                    <p className="text-[10px] tracking-[0.16em] text-muted-foreground/70 uppercase">
                      In the name of Allah, the Most Gracious, the Most Merciful
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpenText className="size-3.5" aria-hidden />
                    {completedSurahs.length} of {SURAHS.length} Surahs read
                  </span>
                  <span className="tabular-nums">
                    Ayah {Math.min(visibleAyah, total)} of {total}
                  </span>
                  <Button
                    type="button"
                    variant={isRead ? "secondary" : "outline"}
                    size="sm"
                    className="ml-auto h-7 cursor-pointer px-2.5 text-xs"
                    onClick={handleToggleRead}
                  >
                    {isRead ? (
                      <CheckCheck
                        className="size-3.5 text-primary"
                        aria-hidden
                      />
                    ) : (
                      <Check className="size-3.5" aria-hidden />
                    )}
                    {isRead ? "Read" : "Mark as read"}
                  </Button>
                </div>

                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-[width] duration-300"
                    style={{
                      width: `${(Math.min(visibleAyah, total) / Math.max(1, total)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Ayahs */}
              {loadFailed ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <CircleAlert
                    className="size-6 text-destructive"
                    aria-hidden
                  />
                  <p className="text-sm font-medium">
                    This Surah could not be loaded
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {content.error}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => retrySurahText(surah, prefs.translation)}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Try again
                  </Button>
                </div>
              ) : isLoading || !ayahs ? (
                <div className="space-y-8 px-5 py-10 sm:px-7">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Loading {surahName(surah)}…
                  </div>
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="space-y-3">
                      <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-7 w-full animate-pulse rounded bg-muted/60" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-muted/40" />
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  {ayahs.map((ayah) => (
                    <AyahCard
                      key={ayah.numberInSurah}
                      surah={surah}
                      ayah={ayah}
                      total={ayahs.length}
                      active={
                        prefs.highlightAyah && activeAyah === ayah.numberInSurah
                      }
                      playing={playing && activeAyah === ayah.numberInSurah}
                      bookmarked={reading.bookmarkKeys.has(
                        `${surah}:${ayah.numberInSurah}`,
                      )}
                      showTranslation={prefs.showTranslation}
                      showTransliteration={prefs.showTransliteration}
                      arabicSize={prefs.arabicSize}
                      translationSize={prefs.translationSize}
                      lineHeight={prefs.lineHeight}
                      layout={prefs.layout}
                      translationName={translation.name}
                      onPlay={handlePlayAyah}
                      onCopyArabic={handleCopyArabic}
                      onCopyTranslation={handleCopyTranslation}
                      onBookmark={handleBookmark}
                      onShare={handleShare}
                    />
                  ))}

                  <div className="flex flex-col items-center gap-3 border-t border-border/50 px-6 py-10 text-center">
                    <p className="text-sm font-medium">
                      End of Surah {meta?.englishName || surahName(surah)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isRead
                        ? "You have marked this Surah as read."
                        : "Mark it as read when you have finished, or continue to the next Surah."}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant={isRead ? "secondary" : "outline"}
                        size="sm"
                        className="cursor-pointer"
                        onClick={handleToggleRead}
                      >
                        {isRead ? (
                          <CheckCheck
                            className="size-3.5 text-primary"
                            aria-hidden
                          />
                        ) : (
                          <Check className="size-3.5" aria-hidden />
                        )}
                        {isRead ? "Read" : "Mark as read"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="cursor-pointer"
                        disabled={surah >= SURAHS.length}
                        onClick={() => handleSelectSurah(surah + 1)}
                      >
                        Next Surah
                        <ChevronRight className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DailyGuidance />
          </div>
        </div>
      </motion.div>

      {/* Kept outside the animated wrapper: a transformed ancestor would make
        the sticky player position itself against that element instead of the
        viewport. */}
      <QuranPlayerBar arabicName={meta?.arabicName} />

      {/* Mobile Surah library */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[92vw] max-w-sm gap-0 p-0">
          <div className="border-b px-4 py-3">
            <SheetTitle className="text-sm font-semibold">Surahs</SheetTitle>
            <SheetDescription className="text-xs">
              All 114 Surahs — search by name or number.
            </SheetDescription>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <SurahPanel
              metas={index.metas}
              currentSurah={surah}
              completed={completedSurahs}
              onSelect={handleSelectSurah}
              onPlay={handlePlaySurah}
              onNavigate={() => setNavOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <QuranSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />

      <QuranBookmarksSheet
        open={bookmarksOpen}
        onOpenChange={setBookmarksOpen}
        bookmarks={reading.bookmarks}
        loading={reading.loading}
        onJump={(targetSurah, targetAyah) => {
          setBookmarksOpen(false);
          handleJump(targetSurah, targetAyah);
        }}
        onRemove={(targetSurah, targetAyah) => {
          const saved = reading.bookmarks.find(
            (entry) => entry.surah === targetSurah && entry.ayah === targetAyah,
          );
          if (!saved) return;
          void toggleBookmark({
            surah: saved.surah,
            ayah: saved.ayah,
            arabic: saved.arabic,
            translation: saved.translation,
            translationEdition: saved.translationEdition,
          }).catch(() => toast.error("Could not update your saved Ayahs."));
        }}
      />
    </>
  );
}
