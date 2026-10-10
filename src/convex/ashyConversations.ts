import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { Doc, Id } from "./_generated/dataModel";
import { getEffectiveUser, recordAdminAuditIfDue } from "./impersonation";
import { requireUser, requireAdmin } from "./auth";
import { q } from "./db";
import { LOCATION_INDEX } from "./locations";

// ─── helpers ──────────────────────────────────────────────────────────────────

type RawChat = {
  body: string;
  authorId: Id<"users">;
  imageCrop: object | null;
  videoUrl: string | null;
  createdAt: number;
  editedAt: number | null;
};

type AshyChat = {
  id: Id<"conversations">;
  title: string;
  pinned: boolean;
  userId: Id<"users">;
  lastReplyAt: number;
  messageCount: number;
  snippets: string[];
  withProject: Id<"projects"> | null;
  createdAt: number;
  attachments: string[];
  imageCrop: object | null;
};

type AshyProject = {
  id: Id<"projects">;
  name: string;
  emoji: string | null;
  instructions: string | null;
  userId: Id<"users">;
  createdAt: number;
};

function htmlFallback(raw: string): string {
  return raw;
}

// ─── queries ─────────────────────────────────────────────────────────────────

export const listConversations = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireUser(ctx);
    const { effectiveUserId } = await getEffectiveUser(ctx, callerId);

    const limit = args.limit ?? 20;
    const builder = ctx.db
      .query("conversations")
      .withIndex("byUserId", (q) => q.eq("userId", effectiveUserId))
      .order("desc");

    const page = await builder
      .paginate({ cursor: args.cursor, limit })
      .collect();

    const rows = page.page.map((c) => {
      const snippets =
        c.snippets && c.snippets.length > 0 ? c.snippets : [c.title];
      const attachments =
        c.attachments && c.attachments.length > 0 ? c.attachments : null;

      return {
        id: c._id,
        title: c.title,
        pinned: c.pinned,
        userId: c.userId,
        lastReplyAt: c.lastReplyAt,
        messageCount: c.messageCount ?? 0,
        snippets,
        withProject: c.withProject ?? (null as Id<"projects"> | null),
        createdAt: c.createdAt,
        attachments: attachments ?? [],
        imageCrop: c.imageCrop ?? null,
      } satisfies AshyChat;
    });

    // Attach last-reply snapshot and plain-text first-line per row so the
    // client can render a rich preview (text + cropped image + inline video)
    // without yet loading the full message list.
    const preview = await ctx.db
      .query("chatMessages")
      .withIndex("byMessage", (q) =>
        q
          .eq("conversationId", q.var("cid", page.cursors?.last)),
      )
      .first();

    return {
      chats: rows,
      nextCursor: page.cursors.next,
      hasMore: page.hasMore,
    };
  },
});

export const getConversation = query({
  args: {
    id: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const callerId = await requireUser(ctx);
    const { effectiveUserId } = await getEffectiveUser(ctx, callerId);

    const row = await ctx.db.get(args.id);
    if (row === null) return null;
    if (row.userId !== effectiveUserId) {
      throw new Error("Conversation not found.");
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", args.id),
      )
      .order("asc")
      .collect();

    const raw = messages
      .map((m) => {
        const fallback = htmlFallback(m.body ?? "");
        return {
          id: m._id,
          createdAt: m.createdAt,
          authorId: m.authorId,
          raw: m.body ?? "",
          imageCrop: (m.imageCrop as object | null) ?? null,
          videoUrl: m.videoUrl ?? null,
        };
      })
      .filter((m) => m.raw.trim().length > 0);

    const snippets = raw.map((m) => m.raw).slice(0, 3);
    const title =
      raw.length > 0 ? raw[0].raw.slice(0, 200) : "New conversation";

    return {
      id: row._id,
      title,
      pinned: row.pinned,
      userId: row.userId,
      lastReplyAt: row.lastReplyAt,
      messageCount: row.messageCount ?? 0,
      snippets,
      withProject: row.withProject ?? null,
      body: raw.length > 0 ? raw : [],
    };
  },
});

export const searchConversations = query({
  args: {
    term: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireUser(ctx);
    const { effectiveUserId } = await getEffectiveUser(ctx, callerId);

    const needle = args.term.toLowerCase().trim();
    if (needle.length < 2) {
      return { chats: [], nextCursor: null, hasMore: false };
    }

    const limit = args.limit ?? 20;
    const builder = ctx.db
      .query("conversations")
      .withIndex("byUserId", (q) => q.eq("userId", effectiveUserId))
      .order("desc");

    const all = await builder
      .paginate({ cursor: args.cursor, limit: 100 })
      .collect();

    const hits = all.page
      .filter((c) => c.title.toLowerCase().includes(needle))
      .map((c) => {
        const snippets =
          c.snippets && c.snippets.length > 0 ? c.snippets : [c.title];
        return {
          id: c._id,
          title: c.title,
          pinned: c.pinned,
          userId: c.userId,
          lastReplyAt: c.lastReplyAt,
          messageCount: c.messageCount ?? 0,
          snippets,
          withProject: c.withProject ?? null,
          createdAt: c.createdAt,
          attachments: (c.attachments ?? []).slice(0, 2),
          imageCrop: c.imageCrop ?? null,
        };
      })
      .slice(0, limit);

    return {
      chats: hits,
      nextCursor:
        all.hasMore
          ? (all.page[all.page.length - 1]?._id ?? null)
          : null,
      hasMore: all.hasMore && hits.length >= limit,
    };
  },
});

export const listProjects = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    withCounts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireUser(ctx);
    const { effectiveUserId } = await getEffectiveUser(ctx, callerId);

    const limit = args.limit ?? 50;
    const builder = ctx.db
      .query("projects")
      .withIndex("byUserId", (q) => q.eq("userId", effectiveUserId))
      .order("desc");

    const page = await builder
      .paginate({ cursor: args.cursor, limit })
      .collect();

    const rows = page.page.map((p) => ({
      id: p._id,
      name: p.name,
      emoji: p.emoji ?? null,
      instructions: p.instructions ?? null,
      userId: p.userId,
      createdAt: p.createdAt,
    })) as AshyProject[];
