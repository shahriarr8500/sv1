/**
 * The Surah library: all 114 Surahs, searched by name (English or Arabic) or
 * by number. Selecting one opens it for reading; the small play button starts
 * its recitation from Ayah 1.
 */

import { useMemo, useState } from "react";
import { Check, Play, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type SurahMeta } from "@/lib/student-os/quran-text";
import { cn } from "@/lib/utils";

export interface SurahPanelProps {
  metas: SurahMeta[];
  currentSurah: number;
  completed: number[];
  onSelect: (surah: number) => void;
  onPlay: (surah: number) => void;
  /** Fired after choosing a Surah — used to close the mobile drawer. */
  onNavigate?: () => void;
}

export function SurahPanel({
  metas,
  currentSurah,
  completed,
  onSelect,
  onPlay,
  onNavigate,
}: SurahPanelProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const term = query.trim();
    if (!term) return metas;

    const lower = term.toLowerCase();
    const arabicTerm = normalizeArabic(term);
    const numeric = /^\d+$/.test(term);

    return metas.filter((meta) => {
      if (numeric && String(meta.number).startsWith(term)) return true;
      if (meta.englishName.toLowerCase().includes(lower)) return true;
      if (meta.englishNameTranslation.toLowerCase().includes(lower))
        return true;
      if (arabicTerm && meta.arabicName) {
        if (normalizeArabic(meta.arabicName).includes(arabicTerm)) return true;
      }
      return false;
    });
  }, [metas, query]);

  const done = useMemo(() => new Set(completed), [completed]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Surah or number"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search Surah by name or number"
          className="h-10 pl-9"
        />
      </div>

      <div className="flex shrink-0 items-center justify-between px-1 pt-3 pb-1.5">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Surahs
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {results.length} of {metas.length}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">
            No Surah matches “{query.trim()}”
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a name, part of a name, or a Surah number.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {results.map((meta) => {
            const selected = meta.number === currentSurah;
            const isRead = done.has(meta.number);
            return (
              <li key={meta.number} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(meta.number);
                    onNavigate?.();
                  }}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 pr-10 text-left transition-colors",
                    selected
                      ? "bg-primary/10 text-primary ring-1 ring-primary/25 ring-inset"
                      : "hover:bg-accent/60",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular-nums",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {isRead && !selected ? (
                      <Check
                        className="size-3.5 text-primary"
                        aria-label="Read"
                      />
                    ) : (
                      meta.number
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {meta.englishName}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {meta.englishNameTranslation
                        ? `${meta.englishNameTranslation} · `
                        : ""}
                      {meta.ayahCount} ayahs
                    </span>
                  </span>

                  {meta.arabicName ? (
                    <span
                      dir="rtl"
                      lang="ar"
                      className="arabic-name hidden shrink-0 text-sm text-muted-foreground sm:block"
                    >
                      {meta.arabicName.replace(/^سُورَةُ\s*/, "")}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  aria-label={`Play ${meta.englishName}`}
                  title={`Play ${meta.englishName}`}
                  onClick={() => {
                    onPlay(meta.number);
                    onNavigate?.();
                  }}
                  className={cn(
                    "absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted-foreground transition-opacity hover:bg-primary/15 hover:text-primary focus-visible:opacity-100",
                    selected
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <Play className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
