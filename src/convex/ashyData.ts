/**
 * Ashy's internal (never client-callable) Convex functions.
 *
 * Phase 2/3/4 support: reading the caller's own synced progress, the hourly
 * YouTube search cache, and the per-user daily grounded-search counter. Every
 * function resolves the caller from ctx.auth — none of them accept a user id
 * from the client, so a student can only ever read their own data.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** The caller's own mirrored progress, or null when signed out / never synced. */
export const progressForCaller = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const raw = user.progress as
      | {
          profile?: unknown;
          completions?: Record<string, number>;
          stats?: unknown;
          updatedAt?: number;
        }
      | undefined;
    if (!raw) return null;
    return {
      profile: (raw.profile ?? null) as Record<string, unknown> | null,
      completions:
        raw.completions && typeof raw.completions === "object"
          ? raw.completions
          : {},
      stats:
        raw.stats && typeof raw.stats === "object"
          ? (raw.stats as Record<string, unknown>)
          : null,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    };
  },
});

const videoResultValidator = v.object({
  videoId: v.string(),
  title: v.string(),
  channel: v.string(),
  thumbnail: v.string(),
  durationLabel: v.string(),
});

/** Fresh cached results for an identical search, or null (missing/expired). */
export const getCachedVideoSearch = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("ashyVideoCache")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row.results;
  },
});

/** Upserts a cached search for ~1 hour. Only real, validated results. */
export const saveVideoSearch = internalMutation({
  args: { key: v.string(), results: v.array(videoResultValidator) },
  handler: async (ctx, args) => {
    if (args.results.length === 0) return;
    const now = Date.now();
    const existing = await ctx.db
      .query("ashyVideoCache")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        results: args.results,
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
      });
    } else {
      await ctx.db.insert("ashyVideoCache", {
        key: args.key,
        results: args.results,
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
      });
    }
  },
});

/** How many grounded searches the caller has made on `day` (local day key). */
export const groundedSearchUsage = internalQuery({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("ashySearchUsage")
      .withIndex("userId_day", (q) =>
        q.eq("userId", userId).eq("day", args.day),
      )
      .first();
    return { count: row?.groundedCount ?? 0 };
  },
});

/** Increments the caller's grounded-search counter for `day`. */
export const recordGroundedSearch = internalMutation({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const row = await ctx.db
      .query("ashySearchUsage")
      .withIndex("userId_day", (q) =>
        q.eq("userId", userId).eq("day", args.day),
      )
      .first();
    if (row) {
      await ctx.db.patch(row._id, { groundedCount: row.groundedCount + 1 });
    } else {
      await ctx.db.insert("ashySearchUsage", {
        userId,
        day: args.day,
        groundedCount: 1,
      });
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Backup link search (Tavily) — cache + per-user daily counter                */
/* -------------------------------------------------------------------------- */

const linkResultValidator = v.array(
  v.object({
    title: v.string(),
    url: v.string(),
    domain: v.string(),
    snippet: v.optional(v.string()),
  }),
);

/** Fresh cached backup-search results, or null (missing/expired). */
export const getCachedLinkSearch = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("ashyLinkCache")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row.results;
  },
});

/** Upserts cached backup-search results for ~45 minutes. */
export const saveLinkSearch = internalMutation({
  args: { key: v.string(), results: linkResultValidator },
  handler: async (ctx, args) => {
    if (args.results.length === 0) return;
    const now = Date.now();
    const expiresAt = now + 45 * 60 * 1000;
    const existing = await ctx.db
      .query("ashyLinkCache")
      .withIndex("key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        results: args.results,
        createdAt: now,
        expiresAt,
      });
    } else {
      await ctx.db.insert("ashyLinkCache", {
        key: args.key,
        results: args.results,
        createdAt: now,
        expiresAt,
      });
    }
  },
});

/** How many Tavily backup searches the caller attempted on `day`. */
export const tavilyUsage = internalQuery({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("ashySearchUsage")
      .withIndex("userId_day", (q) =>
        q.eq("userId", userId).eq("day", args.day),
      )
      .first();
    return { count: row?.tavilyCount ?? 0 };
  },
});

/** Increments the caller's Tavily counter for `day` (one per API attempt). */
export const recordTavilySearch = internalMutation({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const row = await ctx.db
      .query("ashySearchUsage")
      .withIndex("userId_day", (q) =>
        q.eq("userId", userId).eq("day", args.day),
      )
      .first();
    if (row) {
      await ctx.db.patch(row._id, { tavilyCount: (row.tavilyCount ?? 0) + 1 });
    } else {
      await ctx.db.insert("ashySearchUsage", {
        userId,
        day: args.day,
        groundedCount: 0,
        tavilyCount: 1,
      });
    }
  },
});
