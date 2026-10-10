/**
 * Ashy chat history — conversations, messages and projects.
 *
 * Every function here resolves the caller from ctx.auth (never from args)
 * and only ever touches documents whose userId matches that caller, so a
 * student can never read, move, rename, pin or delete another student's
 * chats or projects — passing someone else's id simply returns not-found.
 *
 * Logs in this file never contain titles, message text, project names or
 * keys: failures are recorded as a status/kind token only.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const TITLE_MAX = 80;
const NAME_MAX = 60;
const INSTRUCTIONS_MAX = 2000;
/** Soft-delete undo window before the purge runs. */
const DELETE_UNDO_MS = 8_000;
/** Search bounds — a bounded scan, never an unindexed full-table sweep. */
const SEARCH_TITLE_SCAN = 400;
const SEARCH_MESSAGE_SCAN = 600;
const SEARCH_RESULT_LIMIT = 20;
/** Message rows returned when a chat is opened (chat view window). */
const CONVERSATION_MESSAGE_LIMIT = 400;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("unauthenticated");
  return userId;
}

function logKind(kind: string): void {
  // Status/kind only — never titles, text, names or ids of content.
  console.error(`[ashy-conversations] failure kind=${kind}`);
}

/** Owned, live conversation or null (callers decide how to present that). */
async function liveConversation(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  conversationId: Id<"conversations">,
): Promise<Doc<"conversations"> | null> {
  const doc = await ctx.db.get(conversationId);
  if (!doc || doc.userId !== userId || doc.deleted) return null;
  return doc;
}

function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

function cleanTitle(raw: string | undefined, fallback: string): string {
  const clean = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > TITLE_MAX ? clean.slice(0, TITLE_MAX) : clean;
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

async function ownedProject(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  projectId: Id<"projects">,
): Promise<Doc<"projects"> | null> {
  const doc = await ctx.db.get(projectId);
  if (!doc || doc.userId !== userId) return null;
  return doc;
}

/** Delete every message row (and its stored images) for a conversation. */
async function deleteMessagesCascade(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
): Promise<void> {
  let rows = await ctx.db
    .query("ashyMessages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .take(200);
  while (rows.length > 0) {
    for (const row of rows) {
      for (const image of row.images ?? []) {
        try {
          await ctx.storage.delete(image.storageId);
        } catch {
          // Best-effort blob cleanup — never blocks the delete itself.
        }
      }
      await ctx.db.delete(row._id);
    }
    rows = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .take(200);
  }
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Cursor-paginated chat list, newest activity first (30 per page from the
 * client). Optional filters: pinned only, or everything inside one project.
 * Soft-deleted (undo-window) rows are hidden.
 */
export const listConversations = query({
  args: {
    paginationOpts: paginationOptsValidator,
    pinned: v.optional(v.boolean()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const builder =
      args.projectId !== undefined
        ? ctx.db
            .query("conversations")
            .withIndex("by_user_project", (q) =>
              q.eq("userId", userId).eq("projectId", args.projectId!),
            )
        : args.pinned !== undefined
          ? ctx.db
              .query("conversations")
              .withIndex("by_user_pinned", (q) =>
                q.eq("userId", userId).eq("pinned", args.pinned!),
              )
          : ctx.db
              .query("conversations")
              .withIndex("by_user_updated", (q) => q.eq("userId", userId));
    const page = await builder.order("desc").paginate(args.paginationOpts);
    return {
      page: page.page.filter((conversation) => !conversation.deleted),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/** One conversation with its saved messages. null = not found / not yours. */
export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) return null;

    const rows = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(CONVERSATION_MESSAGE_LIMIT);
    rows.reverse();

    const messages = await Promise.all(
      rows.map(async (row) => {
        const images = await Promise.all(
          (row.images ?? []).map(async (image) => ({
            mimeType: image.mimeType,
            url: await ctx.storage.getUrl(image.storageId),
          })),
        );
        const withImages = images.filter(
          (image): image is { mimeType: string; url: string } =>
            image.url !== null,
        );
        return {
          id: row.clientMessageId,
          role: row.role,
          text: row.text,
          error: row.errorKind,
          images: withImages.length > 0 ? withImages : undefined,
          videos: row.videos,
          videoSearch: row.videoSearch,
          sources: row.sources,
          searchQueries: row.searchQueries,
          searchNotice: row.searchNotice,
          searchNoticeKind: row.searchNoticeKind,
          grounded: row.grounded,
          searchEntryPointUrl: row.searchEntryPointUrl,
          chips: row.chips,
          planMissions: row.planMissions,
        };
      }),
    );

    return {
      id: conversation._id,
      title: conversation.title,
      pinned: conversation.pinned ?? false,
      projectId: conversation.projectId,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messageCount ?? 0,
      messages,
    };
  },
});

/**
 * Title + message-text search inside the caller's own chats only. Bounded
 * scan (newest 400 titles + newest 600 message rows), ≤ 20 results, each
 * with a short snippet — this never logs or returns other students' data.
 */
export const searchConversations = query({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const term = args.term.trim().toLowerCase();
    if (term.length < 2) return { results: [] };

    const results: Array<{
      conversationId: Id<"conversations">;
      title: string;
      snippet: string;
      matchedIn: "title" | "message";
      updatedAt: number;
    }> = [];
    const seenConversations = new Set<string>();

    // (1) Title matches first — cheap index scan.
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(SEARCH_TITLE_SCAN);
    const titleById = new Map<string, Doc<"conversations">>();
    for (const conversation of conversations) {
      if (conversation.deleted) continue;
      titleById.set(conversation._id, conversation);
      if (conversation.title.toLowerCase().includes(term)) {
        seenConversations.add(conversation._id);
        results.push({
          conversationId: conversation._id,
          title: conversation.title,
          snippet: conversation.title,
          matchedIn: "title",
          updatedAt: conversation.updatedAt,
        });
      }
    }

    // (2) Message-text matches — bounded scan of the newest messages.
    const messages = await ctx.db
      .query("ashyMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(SEARCH_MESSAGE_SCAN);
    for (const row of messages) {
      if (seenConversations.has(row.conversationId)) continue;
      const index = row.text.toLowerCase().indexOf(term);
      if (index === -1) continue;
      let conversation = titleById.get(row.conversationId);
      if (!conversation) {
        const fetched = await ctx.db.get(row.conversationId);
        if (!fetched || fetched.deleted) continue;
        conversation = fetched;
      }
      seenConversations.add(row.conversationId);
      const start = Math.max(0, index - 50);
      const end = Math.min(row.text.length, index + term.length + 90);
      results.push({
        conversationId: row.conversationId,
        title: conversation.title,
        snippet: `${start > 0 ? "…" : ""}${row.text.slice(start, end).replace(/\s+/g, " ")}${end < row.text.length ? "…" : ""}`,
        matchedIn: "message",
        updatedAt: conversation.updatedAt,
      });
      if (results.length >= SEARCH_RESULT_LIMIT * 2) break;
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt);
    return { results: results.slice(0, SEARCH_RESULT_LIMIT) };
  },
});

/** The student's projects with live chat counts (for menus and confirms). */
export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    const withCounts = await Promise.all(
      projects.map(async (project) => {
        const conversations = await ctx.db
          .query("conversations")
          .withIndex("by_user_project", (q) =>
            q.eq("userId", userId).eq("projectId", project._id),
          )
          .take(999);
        return {
          id: project._id,
          name: project.name,
          emoji: project.emoji,
          instructions: project.instructions,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          chatCount: conversations.filter((c) => !c.deleted).length,
        };
      }),
    );
    return { projects: withCounts };
  },
});

/* -------------------------------------------------------------------------- */
/* Conversation mutations                                                      */
/* -------------------------------------------------------------------------- */

/** Create a chat (optionally straight into a project). Empties are swept. */
export const createConversation = mutation({
  args: {
    title: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    let projectId: Id<"projects"> | undefined;
    if (args.projectId) {
      const project = await ownedProject(ctx, userId, args.projectId);
      if (!project) throw new Error("project-not-found");
      projectId = project._id;
    }

    const now = Date.now();
    // Sweep this student's stale EMPTY chats (nothing was ever typed) so
    // repeated "New chat" clicks don't litter the history list. A chat that
    // is 3 minutes old and still empty is never holding anything.
    try {
      const recent = await ctx.db
        .query("conversations")
        .withIndex("by_user_updated", (q) => q.eq("userId", userId))
        .order("desc")
        .take(15);
      for (const conversation of recent) {
        if (conversation.deleted) continue;
        if ((conversation.messageCount ?? 0) > 0) continue;
        if (now - conversation.updatedAt < 3 * 60_000) continue;
        await ctx.db.patch(conversation._id, {
          deleted: true,
          deletedAt: now,
        });
        await ctx.scheduler.runAfter(
          DELETE_UNDO_MS,
          internal.ashyConversations.purgeConversation,
          { conversationId: conversation._id },
        );
      }
    } catch (error) {
      logKind(`empty-sweep:${error instanceof Error ? "error" : "unknown"}`);
    }

    return await ctx.db.insert("conversations", {
      userId,
      title: cleanTitle(args.title, "New chat"),
      titleAuto: true,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      projectId,
      deleted: false,
      messageCount: 0,
      lastSeq: 0,
    });
  },
});

/** Rename. A rename always wins over later auto-titling. */
export const renameConversation = mutation({
  args: { conversationId: v.id("conversations"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) throw new Error("not-found");
    const title = cleanTitle(args.title, "");
    if (!title) throw new Error("invalid-title");
    await ctx.db.patch(conversation._id, {
      title,
      titleAuto: false,
      renamedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const setConversationPinned = mutation({
  args: { conversationId: v.id("conversations"), pinned: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) throw new Error("not-found");
    await ctx.db.patch(conversation._id, {
      pinned: args.pinned,
      pinnedAt: args.pinned ? Date.now() : undefined,
    });
    return { ok: true };
  },
});

/** Move a chat into a project, or out of it with projectId: null. */
export const moveConversationToProject = mutation({
  args: {
    conversationId: v.id("conversations"),
    projectId: v.union(v.id("projects"), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) throw new Error("not-found");
    if (args.projectId === null) {
      await ctx.db.patch(conversation._id, { projectId: undefined });
      return { ok: true };
    }
    const project = await ownedProject(ctx, userId, args.projectId);
    if (!project) throw new Error("project-not-found");
    await ctx.db.patch(conversation._id, { projectId: project._id });
    return { ok: true };
  },
});

/**
 * Soft delete (hidden immediately, purged after the undo window). The undo
 * action calls restoreConversation within that window.
 */
export const deleteConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) throw new Error("not-found");
    const now = Date.now();
    await ctx.db.patch(conversation._id, { deleted: true, deletedAt: now });
    await ctx.scheduler.runAfter(
      DELETE_UNDO_MS,
      internal.ashyConversations.purgeConversation,
      { conversationId: conversation._id },
    );
    return { ok: true };
  },
});

/** Undo a soft delete (only possible inside the undo window). */
export const restoreConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("not-found");
    }
    if (!conversation.deleted) return { ok: true };
    await ctx.db.patch(conversation._id, {
      deleted: false,
      deletedAt: undefined,
    });
    return { ok: true };
  },
});

/**
 * Edit the student's last user message in place: the new text replaces the
 * stored text and every message after it is removed (a fresh answer follows).
 */
export const editUserMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    clientMessageId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) throw new Error("not-found");
    const row = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation_client", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("clientMessageId", args.clientMessageId),
      )
      .unique();
    if (!row || row.userId !== userId || row.role !== "user") {
      throw new Error("not-found");
    }
    const text = args.text.replace(/\s+$/, "").slice(0, 12_000);
    if (!text.trim()) throw new Error("invalid-text");

    // Drop everything after this message (its answer), then update the text.
    const newer = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId).gt("seq", row.seq),
      )
      .take(200);
    let removed = 0;
    for (const doc of newer) {
      for (const image of doc.images ?? []) {
        try {
          await ctx.storage.delete(image.storageId);
        } catch {
          // Best-effort blob cleanup.
        }
      }
      await ctx.db.delete(doc._id);
      removed += 1;
    }
    await ctx.db.patch(row._id, { text });
    await ctx.db.patch(conversation._id, {
      messageCount: Math.max(0, (conversation.messageCount ?? 1) - removed),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Remove a trailing assistant answer (used by Regenerate). */
export const dropTrailingReply = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) throw new Error("not-found");
    const last = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .first();
    if (last && last.userId === userId && last.role === "assistant") {
      await ctx.db.delete(last._id);
      await ctx.db.patch(conversation._id, {
        messageCount: Math.max(0, (conversation.messageCount ?? 1) - 1),
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/**
 * Persist a successful assistant answer for a conversation the caller owns.
 * Idempotent by clientMessageId, so a retried call never duplicates a reply.
 */
export const appendReply = mutation({
  args: {
    conversationId: v.id("conversations"),
    clientMessageId: v.string(),
    text: v.string(),
    videos: v.optional(
      v.array(
        v.object({
          videoId: v.string(),
          title: v.string(),
          channel: v.string(),
          thumbnail: v.string(),
          durationLabel: v.string(),
        }),
      ),
    ),
    videoSearch: v.optional(
      v.object({
        query: v.string(),
        ok: v.literal(false),
        message: v.string(),
      }),
    ),
    sources: v.optional(
      v.array(
        v.object({ title: v.string(), url: v.string(), domain: v.string() }),
      ),
    ),
    searchQueries: v.optional(v.array(v.string())),
    searchNotice: v.optional(v.string()),
    searchNoticeKind: v.optional(
      v.union(
        v.literal("userLimit"),
        v.literal("providerQuota"),
        v.literal("other"),
      ),
    ),
    grounded: v.optional(v.boolean()),
    searchEntryPointUrl: v.optional(v.string()),
    chips: v.optional(v.array(v.string())),
    planMissions: v.optional(
      v.object({
        itemIds: v.array(v.string()),
        labels: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const conversation = await liveConversation(ctx, userId, args.conversationId);
    if (!conversation) throw new Error("not-found");
    const existing = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation_client", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("clientMessageId", args.clientMessageId),
      )
      .unique();
    if (existing) return { ok: true, duplicate: true };

    const now = Date.now();
    const seq = (conversation.lastSeq ?? 0) + 1;
    await ctx.db.insert("ashyMessages", {
      conversationId: conversation._id,
      userId,
      clientMessageId: args.clientMessageId,
      role: "assistant",
      text: args.text.slice(0, 40_000),
      seq,
      createdAt: now,
      videos: args.videos,
      videoSearch: args.videoSearch,
      sources: args.sources,
      searchQueries: args.searchQueries,
      searchNotice: args.searchNotice,
      searchNoticeKind: args.searchNoticeKind,
      grounded: args.grounded,
      searchEntryPointUrl: args.searchEntryPointUrl,
      chips: args.chips,
      planMissions: args.planMissions,
    });
    await ctx.db.patch(conversation._id, {
      lastSeq: seq,
      messageCount: (conversation.messageCount ?? 0) + 1,
      updatedAt: now,
    });
    return { ok: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Internal: used by the chat action and the delete scheduler                  */
/* -------------------------------------------------------------------------- */

/**
 * Persist the student's outgoing message BEFORE the model runs, so the
 * question survives even when the answer fails. Idempotent by
 * clientMessageId (a network retry re-sends the same id and never
 * duplicates). Called from the chat action with an already-verified userId.
 */
export const persistUserMessage = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    clientMessageId: v.string(),
    text: v.string(),
    /** Photos already uploaded to storage by the chat action. */
    images: v.optional(
      v.array(
        v.object({ mimeType: v.string(), storageId: v.id("_storage") }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== args.userId) {
      return { ok: false as const, kind: "not-found" };
    }
    const existing = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation_client", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("clientMessageId", args.clientMessageId),
      )
      .unique();
    if (existing) return { ok: true as const, duplicate: true };

    // Photos live in Convex storage (uploaded by the chat action) — a
    // base64 photo can exceed the 1 MiB document limit.
    const images =
      args.images && args.images.length > 0 ? args.images : undefined;

    const now = Date.now();
    const seq = (conversation.lastSeq ?? 0) + 1;
    const text = args.text.replace(/\s+$/, "").slice(0, 12_000);
    await ctx.db.insert("ashyMessages", {
      conversationId: conversation._id,
      userId: args.userId,
      clientMessageId: args.clientMessageId,
      role: "user",
      text,
      seq,
      createdAt: now,
      images,
    });

    // Auto-title from the first message — never after a student rename.
    const autoTitle =
      !conversation.renamedAt && conversation.titleAuto !== false && text.trim();
    await ctx.db.patch(conversation._id, {
      lastSeq: seq,
      messageCount: (conversation.messageCount ?? 0) + 1,
      updatedAt: now,
      ...(autoTitle ? { title: titleFromText(text) } : {}),
    });
    return { ok: true as const };
  },
});

/**
 * Read everything the chat action needs for one reply: ownership check,
 * the recent message rows (ids + text + image refs, never bytes) and the
 * owning project's note. Actions have no direct db access, so they go
 * through this query.
 */
export const loadChatForReply = internalQuery({
  args: { userId: v.id("users"), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== args.userId || conversation.deleted) {
      return null;
    }
    const rows = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(80);
    rows.reverse();
    let note = "";
    if (conversation.projectId) {
      const project = await ctx.db.get(conversation.projectId);
      if (project && project.userId === args.userId && project.instructions) {
        note = project.instructions.slice(0, 600);
      }
    }
    return {
      note,
      rows: rows.map((row) => ({
        clientMessageId: row.clientMessageId,
        role: row.role,
        text: row.text,
        failed: row.errorKind !== undefined,
        images: (row.images ?? []).map((image) => ({
          mimeType: image.mimeType,
          storageId: image.storageId,
        })),
      })),
    };
  },
});

/** Scheduled N seconds after a soft delete — hard-delete when still deleted. */
export const purgeConversation = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.deleted) return; // restored in time
    if ((conversation.deletedAt ?? 0) > Date.now() - DELETE_UNDO_MS + 1_000) {
      return; // another delete happened moments ago — its own purge will run
    }
    await deleteMessagesCascade(ctx, conversation._id);
    await ctx.db.delete(conversation._id);
  },
});

/* -------------------------------------------------------------------------- */
/* Project mutations                                                           */
/* -------------------------------------------------------------------------- */

export const createProject = mutation({
  args: {
    name: v.string(),
    emoji: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = cleanName(args.name);
    if (!name) throw new Error("invalid-name");
    const now = Date.now();
    return await ctx.db.insert("projects", {
      userId,
      name,
      emoji: args.emoji?.trim().slice(0, 16) || undefined,
      instructions: args.instructions?.trim().slice(0, INSTRUCTIONS_MAX) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const renameProject = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const project = await ownedProject(ctx, userId, args.projectId);
    if (!project) throw new Error("not-found");
    const name = cleanName(args.name);
    if (!name) throw new Error("invalid-name");
    await ctx.db.patch(project._id, { name, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Edit the emoji and/or the project's own instructions note. */
export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    emoji: v.optional(v.union(v.string(), v.null())),
    instructions: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const project = await ownedProject(ctx, userId, args.projectId);
    if (!project) throw new Error("not-found");
    const patch: Partial<Doc<"projects">> = { updatedAt: Date.now() };
    if (args.emoji !== undefined) {
      patch.emoji =
        args.emoji === null ? undefined : args.emoji.trim().slice(0, 16) || undefined;
    }
    if (args.instructions !== undefined) {
      patch.instructions =
        args.instructions === null
          ? undefined
          : args.instructions.trim().slice(0, INSTRUCTIONS_MAX) || undefined;
    }
    await ctx.db.patch(project._id, patch);
    return { ok: true };
  },
});

/**
 * Delete a project. Its chats either move back to "Chats" (mode "move") or
 * are deleted together with it (mode "delete"). The caller confirms the
 * exact chat count first.
 */
export const deleteProject = mutation({
  args: {
    projectId: v.id("projects"),
    mode: v.union(v.literal("move"), v.literal("delete")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const project = await ownedProject(ctx, userId, args.projectId);
    if (!project) throw new Error("not-found");
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_project", (q) =>
        q.eq("userId", userId).eq("projectId", args.projectId),
      )
      .take(2000);
    let affected = 0;
    for (const conversation of conversations) {
      if (conversation.deleted) continue;
      affected += 1;
      if (args.mode === "move") {
        await ctx.db.patch(conversation._id, { projectId: undefined });
      } else {
        await deleteMessagesCascade(ctx, conversation._id);
        await ctx.db.delete(conversation._id);
      }
    }
    await ctx.db.delete(project._id);
    return { ok: true, affected };
  },
});
