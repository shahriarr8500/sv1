/**
 * Quran reading state — bookmarks and the reader's place in the book.
 *
 * Everything here is scoped to the signed-in user. Verse text itself is never
 * stored in bulk: a bookmark keeps only a short snapshot so the saved list can
 * render without fetching every Surah again.
 *
 * Reading progress is recorded from real reading actions (moving through the
 * Surahs and finishing one), never from audio playback — listening is not
 * treated as having read.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveUser } from "./progress";
import { getSurah } from "../lib/student-os/quran";

const MAX_BOOKMARKS = 400;
const SNIPPET_LIMIT = 600;

function assertAyah(surah: number, ayah: number): void {
  const meta = getSurah(surah);
  if (!meta) throw new Error("Unknown Surah.");
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > meta.ayahs) {
    throw new Error("Unknown Ayah.");
  }
}

function snippet(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > SNIPPET_LIMIT
    ? `${trimmed.slice(0, SNIPPET_LIMIT)}…`
    : trimmed;
}

export const listBookmarks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveUser(ctx);
    const rows = await ctx.db
      .query("quranBookmarks")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_BOOKMARKS);
    return rows.map((row) => ({
      id: row._id,
      surah: row.surah,
      ayah: row.ayah,
      arabic: row.arabic,
      translation: row.translation,
      translationEdition: row.translationEdition,
      createdAt: row.createdAt,
    }));
  },
});

export const toggleBookmark = mutation({
  args: {
    surah: v.number(),
    ayah: v.number(),
    arabic: v.string(),
    translation: v.string(),
    translationEdition: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    assertAyah(args.surah, args.ayah);

    const existing = await ctx.db
      .query("quranBookmarks")
      .withIndex("by_user_ayah", (q) =>
        q.eq("userId", userId).eq("surah", args.surah).eq("ayah", args.ayah),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { bookmarked: false };
    }

    await ctx.db.insert("quranBookmarks", {
      userId,
      surah: args.surah,
      ayah: args.ayah,
      arabic: snippet(args.arabic),
      translation: snippet(args.translation),
      translationEdition: args.translationEdition,
      createdAt: Date.now(),
    });

    // Keep the list bounded without surprising the reader: only the oldest
    // saved Ayah beyond the cap is dropped.
    const all = await ctx.db
      .query("quranBookmarks")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("asc")
      .take(MAX_BOOKMARKS + 1);
    if (all.length > MAX_BOOKMARKS) {
      const oldest = all[0];
      if (oldest) await ctx.db.delete(oldest._id);
    }

    return { bookmarked: true };
  },
});

export const getReading = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveUser(ctx);
    const row = await ctx.db
      .query("quranReading")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) return null;
    return {
      lastSurah: row.lastSurah,
      lastAyah: row.lastAyah,
      completedSurahs: row.completedSurahs,
      updatedAt: row.updatedAt,
    };
  },
});

export const savePosition = mutation({
  args: { surah: v.number(), ayah: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    assertAyah(args.surah, args.ayah);

    const existing = await ctx.db
      .query("quranReading")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    if (existing) {
      if (
        existing.lastSurah === args.surah &&
        existing.lastAyah === args.ayah
      ) {
        return { ok: true };
      }
      await ctx.db.patch(existing._id, {
        lastSurah: args.surah,
        lastAyah: args.ayah,
        updatedAt: now,
      });
      return { ok: true };
    }

    await ctx.db.insert("quranReading", {
      userId,
      lastSurah: args.surah,
      lastAyah: args.ayah,
      completedSurahs: [],
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const markSurahRead = mutation({
  args: { surah: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    const meta = getSurah(args.surah);
    if (!meta) throw new Error("Unknown Surah.");

    const existing = await ctx.db
      .query("quranReading")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("quranReading", {
        userId,
        lastSurah: args.surah,
        lastAyah: 1,
        completedSurahs: [args.surah],
        updatedAt: now,
      });
      return { ok: true, read: true };
    }

    if (existing.completedSurahs.includes(args.surah)) {
      // Un-marking is allowed so a mistaken tap is recoverable.
      await ctx.db.patch(existing._id, {
        completedSurahs: existing.completedSurahs.filter(
          (n) => n !== args.surah,
        ),
        updatedAt: now,
      });
      return { ok: true, read: false };
    }

    const next = [...existing.completedSurahs, args.surah].sort(
      (a, b) => a - b,
    );
    await ctx.db.patch(existing._id, {
      completedSurahs: next.slice(0, 114),
      updatedAt: now,
    });
    return { ok: true, read: true };
  },
});
