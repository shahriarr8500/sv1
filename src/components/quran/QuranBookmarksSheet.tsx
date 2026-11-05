/**
 * Saved Ayahs — stored in Convex against the signed-in user, so they follow
 * the reader to another device. Each row jumps straight to the Ayah.
 */

import { ArrowUpRight, BookmarkX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { surahName } from "@/lib/student-os/quran";
import { cn } from "@/lib/utils";

export interface SavedAyah {
  id: string;
  surah: number;
  ayah: number;
  arabic: string;
  translation: string;
}

export function QuranBookmarksSheet({
  open,
  onOpenChange,
  bookmarks,
  loading,
  onJump,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarks: SavedAyah[];
  loading: boolean;
  onJump: (surah: number, ayah: number) => void;
  onRemove: (surah: number, ayah: number) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Saved Ayahs</SheetTitle>
          <SheetDescription>
            {bookmarks.length === 0
              ? "Bookmark any Ayah while reading to keep it here."
              : `${bookmarks.length} saved ${bookmarks.length === 1 ? "Ayah" : "Ayahs"}.`}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading saved Ayahs…
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center">
              <p className="text-sm font-medium">Nothing saved yet</p>
              <p className="mx-auto mt-1 max-w-[24ch] text-xs text-muted-foreground">
                Tap the bookmark icon on any Ayah and it will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {bookmarks.map((bookmark) => (
                <li
                  key={bookmark.id}
                  className={cn(
                    "group rounded-xl border bg-card/60 p-3 transition-colors hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onJump(bookmark.surah, bookmark.ayah)}
                      className="flex min-w-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      <span className="truncate">
                        {surahName(bookmark.surah)} {bookmark.surah}:
                        {bookmark.ayah}
                      </span>
                      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove bookmark"
                      className="rounded-full text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(bookmark.surah, bookmark.ayah)}
                    >
                      <BookmarkX className="size-3.5" aria-hidden />
                    </Button>
                  </div>

                  <p
                    dir="rtl"
                    lang="ar"
                    className="quran-arabic mt-2 line-clamp-2 text-[17px] leading-relaxed"
                  >
                    {bookmark.arabic}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {bookmark.translation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
