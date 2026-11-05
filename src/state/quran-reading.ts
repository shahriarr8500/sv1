/**
 * Quran reading state backed by Convex.
 *
 * Bookmarks and the reader's position belong to the signed-in account, so they
 * are the same on every device. Nothing here infers progress from playback:
 * `markSurahRead` is only called from a reading action.
 */

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useQuranReading() {
  const bookmarks = useQuery(api.quran.listBookmarks);
  const reading = useQuery(api.quran.getReading);
  const toggleBookmarkMutation = useMutation(api.quran.toggleBookmark);
  const savePositionMutation = useMutation(api.quran.savePosition);
  const markSurahReadMutation = useMutation(api.quran.markSurahRead);

  const bookmarkKeys = useMemo(
    () =>
      new Set((bookmarks ?? []).map((entry) => `${entry.surah}:${entry.ayah}`)),
    [bookmarks],
  );

  return {
    bookmarks: bookmarks ?? [],
    bookmarkKeys,
    reading: reading ?? null,
    loading: bookmarks === undefined || reading === undefined,
    toggleBookmark: toggleBookmarkMutation,
    savePosition: savePositionMutation,
    markSurahRead: markSurahReadMutation,
  };
}
