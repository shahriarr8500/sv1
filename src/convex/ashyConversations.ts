import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { recordAdminAuditIfDue } from "./impersonation";

async function effectiveUser(
  ctx: any,
  callerId: Id<"users">,
): Promise<{ effectiveUserId: Id<"users">; isImpersonating: boolean }> {
  return ctx.runQuery(internal.impersonation.getEffectiveUser, { callerId });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isOwner(
  convo: Doc<"conversations"> | null,
  effectiveUserId: Id<"users">,
): convo is Doc<"conversations"> {
  return (
    convo != null &&
    convo.userId === effectiveUserId &&
    convo.deleted !== true
  );
}

// ─── queries ─────────────────────────────────────────────────────────────────

export const listConversations = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const limit = Math.max(1, args.limit ?? 20);
    const page = await ctx.db
      .query("conversations")
      .withIndex("by_user_updated", (q) => q.eq("userId", effectiveUserId))
      .order("desc")
      .paginate({ cursor: args.cursor, limit });

    const chats = page.page
      .filter(notDeleted)
      .map(toChatRow);

    return {
      chats,
      nextCursor: page.hasMore ? page.nextCursor : null,
      hasMore: page.hasMore,
    };
  },
});

export const getConversation = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) return null;

    const messages = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();

    const resolved = await Promise.all(
      messages.map(resolveMessage(ctx)),
    );

    return { messages: resolved };
  },
});

export const searchConversations = query({
  args: {
    term: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const needle = args.term.toLowerCase().trim();
    if (needle.length < 2) return { results: [] };

    const convos = await ctx.db
      .query("conversations")
      .withIndex("by_user_updated", (q) => q.eq("userId", effectiveUserId))
      .order("desc")
      .take(25);

    const activeConos = convos.filter(notDeleted);

    const results: Array<{
      conversationId: Id<"conversations">;
      title: string;
      snippet: string;
      matchedIn: "title" | "message";
    }> = [];

    for (const convo of activeConos) {
      if (results.length >= 15) break;

      if (convo.title.toLowerCase().includes(needle)) {
        results.push({
          conversationId: convo._id,
          title: convo.title,
          snippet: convo.title,
          matchedIn: "title",
        });
        continue;
      }

      const recent = await ctx.db
        .query("ashyMessages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", convo._id),
        )
        .order("desc")
        .take(10);

      for (const m of recent) {
        if (results.length >= 15) break;
        if (m.text.toLowerCase().includes(needle)) {
          results.push({
            conversationId: convo._id,
            title: convo.title,
            snippet: m.text.slice(0, 160),
            matchedIn: "message",
          });
          break;
        }
      }
    }

    return { results };
  },
});

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", effectiveUserId))
      .order("desc")
      .take(100);

    const convos = await ctx.db
      .query("conversations")
      .withIndex("by_user_updated", (q) => q.eq("userId", effectiveUserId))
      .order("desc")
      .take(300);

    const counts: Record<string, number> = {};
    for (const c of convos) {
      if (c.deleted === true) continue;
      if (c.projectId == null) continue;
      counts[String(c.projectId)] =
        (counts[String(c.projectId)] ?? 0) + 1;
    }

    return {
      projects: projects.map((p) => ({
        id: p._id,
        name: p.name,
        emoji: p.emoji,
        instructions: p.instructions,
        chatCount: counts[String(p._id)] ?? 0,
      })),
    };
  },
});

// ─── mutations ───────────────────────────────────────────────────────────────

export const createConversation = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);
    const now = Date.now();

    const id = await ctx.db.insert("conversations", {
      userId: effectiveUserId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      lastSeq: 0,
      pinned: false,
      pinnedAt: null,
      projectId: args.projectId ?? null,
      deletedAt: null,
      deleted: false,
      titleAuto: undefined,
      renamedAt: null,
    });

    return { id };
  },
});

export const renameConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    const title = args.title.trim().slice(0, 200) || "Untitled";
    await ctx.db.patch(args.conversationId, {
      title,
      renamedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const setConversationPinned = mutation({
  args: {
    conversationId: v.id("conversations"),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    await ctx.db.patch(args.conversationId, {
      pinned: args.pinned,
      pinnedAt: args.pinned ? Date.now() : null,
    });

    return { ok: true };
  },
});

export const moveConversationToProject = mutation({
  args: {
    conversationId: v.id("conversations"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    if (args.projectId !== undefined) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.userId !== effectiveUserId) {
        throw new Error("Project not found.");
      }
    }

    await ctx.db.patch(args.conversationId, {
      projectId: args.projectId,
    });

    return { ok: true };
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    await ctx.db.patch(args.conversationId, {
      deleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const restoreConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (
      !convo ||
      convo.userId !== effectiveUserId ||
      convo.deleted !== true
    ) {
      throw new Error("Conversation not found.");
    }

    await ctx.db.patch(args.conversationId, {
      deleted: false,
      deletedAt: null,
    });

    return { ok: true };
  },
});

export const editUserMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    clientMessageId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    const message = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation_client", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("clientMessageId", args.clientMessageId),
      )
      .first();

    if (!message || message.userId !== effectiveUserId) {
      throw new Error("Message not found.");
    }

    await ctx.db.patch(message._id, { text: args.text });
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });

    return { ok: true };
  },
});

export const dropTrailingReply = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    const last = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .first();

    if (!last) return { ok: true, dropped: false };
    if (last.userId !== effectiveUserId) return { ok: true, dropped: false };

    await ctx.db.delete(last._id);

    const remaining = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(2);

    await ctx.db.patch(args.conversationId, {
      messageCount: Math.max(0, (convo.messageCount ?? 1) - 1),
      lastSeq: Math.max(0, (convo.lastSeq ?? 0) - 1),
      updatedAt:
        remaining.length > 1 ? remaining[1].createdAt : convo.createdAt,
      pinned: convo.pinned,
      pinnedAt: convo.pinnedAt,
      projectId: convo.projectId,
      title: convo.title,
      titleAuto: convo.titleAuto,
      renamedAt: convo.renamedAt,
      deletedAt: convo.deletedAt,
      deleted: convo.deleted,
    });

    return { ok: true, dropped: true };
  },
});

export const persistUserMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    clientMessageId: v.string(),
    text: v.string(),
    images: v.optional(
      v.array(
        v.object({
          mimeType: v.string(),
          storageId: v.id("_storage"),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    const now = Date.now();
    const seq = (convo.lastSeq ?? 0) + 1;
    const isFirst = convo.messageCount === 0;

    await ctx.db.insert("ashyMessages", {
      conversationId: args.conversationId,
      userId: effectiveUserId,
      clientMessageId: args.clientMessageId,
      role: "user",
      text: args.text,
      seq,
      createdAt: now,
      images: args.images ?? undefined,
    });

    const newTitle =
      isFirst && convo.renamedAt == null
        ? args.text.slice(0, 200)
        : convo.title;
    const titleAuto =
      isFirst && convo.renamedAt == null ? true : convo.titleAuto;

    await ctx.db.patch(args.conversationId, {
      lastSeq: seq,
      messageCount: (convo.messageCount ?? 0) + 1,
      updatedAt: now,
      title: newTitle,
      titleAuto,
    });

    return { ok: true };
  },
});

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
        v.object({
          title: v.string(),
          url: v.string(),
          domain: v.string(),
        }),
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
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    const now = Date.now();
    const seq = (convo.lastSeq ?? 0) + 1;

    await ctx.db.insert("ashyMessages", {
      conversationId: args.conversationId,
      userId: effectiveUserId,
      clientMessageId: args.clientMessageId,
      role: "assistant",
      text: args.text,
      seq,
      createdAt: now,
      videos: args.videos ?? undefined,
      videoSearch: args.videoSearch ?? undefined,
      sources: args.sources ?? undefined,
      searchQueries: args.searchQueries ?? undefined,
      searchNotice: args.searchNotice ?? undefined,
      searchNoticeKind: args.searchNoticeKind ?? undefined,
      grounded: args.grounded ?? undefined,
      searchEntryPointUrl: args.searchEntryPointUrl ?? undefined,
      chips: args.chips ?? undefined,
      planMissions: args.planMissions ?? undefined,
    });

    await ctx.db.patch(args.conversationId, {
      lastSeq: seq,
      messageCount: (convo.messageCount ?? 0) + 1,
      updatedAt: now,
    });

    return { ok: true };
  },
});

export const loadChatForReply = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      return null;
    }

    const messages = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();

    const rows = messages.map((m) => ({
      clientMessageId: m.clientMessageId,
      role: m.role,
      text: m.text,
      failed: m.errorKind != null,
      images:
        m.images != null
          ? m.images.map((img) => ({
              mimeType: img.mimeType,
              storageId: img.storageId,
            }))
          : [],
      videos: (m.videos ?? []).map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        thumbnail: v.thumbnail,
        durationLabel: v.durationLabel,
      })),
      videoSearch: m.videoSearch ?? null,
      sources: (m.sources ?? []).map((s) => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
      })),
      searchQueries: m.searchQueries ?? [],
      searchNotice: m.searchNotice ?? null,
      searchNoticeKind: m.searchNoticeKind ?? null,
      grounded: m.grounded ?? false,
      searchEntryPointUrl: m.searchEntryPointUrl ?? null,
      chips: m.chips ?? [],
      planMissions: (m.planMissions ?? {
        itemIds: [],
        labels: [],
      }) as { itemIds: string[]; labels: string[] },
    }));

    const note =
      convo.projectId != null
        ? ((await ctx.db.get(convo.projectId))?.instructions ?? "")
        : "";

    return { rows, note };
  },
});

export const purgeConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    olderThan: v.number(),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const convo = await ctx.db.get(args.conversationId);
    if (!isOwner(convo, effectiveUserId)) {
      throw new Error("Conversation not found.");
    }

    const messages = await ctx.db
      .query("ashyMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((m) => m.createdAt < args.olderThan)
      .collect();

    for (const m of messages) {
      await ctx.db.delete(m._id);
    }

    if (messages.length > 0) {
      const remaining = await ctx.db
        .query("ashyMessages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId),
        )
        .order("desc")
        .take(2);

      await ctx.db.patch(args.conversationId, {
        messageCount:
          Math.max(0, (convo.messageCount ?? 0) - messages.length),
        lastSeq:
          Math.max(0, (convo.lastSeq ?? 0) - messages.length),
        updatedAt:
          remaining.length > 1
            ? remaining[1].createdAt
            : convo.createdAt,
        pinned: convo.pinned,
        pinnedAt: convo.pinnedAt,
        projectId: convo.projectId,
        title: convo.title,
        titleAuto: convo.titleAuto,
        renamedAt: convo.renamedAt,
        deletedAt: convo.deletedAt,
        deleted: convo.deleted,
      });
    }

    return { ok: true };
  },
});

// ─── projects ────────────────────────────────────────────────────────────────

export const createProject = mutation({
  args: {
    name: v.string(),
    emoji: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", effectiveUserId))
      .filter((q) => q.eq(q.field("name"), args.name.trim()))
      .first();

    if (existing) throw new Error("A project with that name already exists.");

    const now = Date.now();
    const id = await ctx.db.insert("projects", {
      userId: effectiveUserId,
      name: args.name.trim(),
      emoji: args.emoji ?? null,
      instructions: args.instructions ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

export const renameProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== effectiveUserId) {
      throw new Error("Project not found.");
    }

    const trimmed = args.name.trim();
    if (trimmed.length === 0)
      throw new Error("Project name must not be empty.");

    const conflict = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", effectiveUserId))
      .filter(
        (q) =>
          q.and(
            q.neq(q.field("_id"), args.projectId),
            q.eq(q.field("name"), trimmed),
          ),
      )
      .first();

    if (conflict)
      throw new Error("A project with that name already exists.");

    await ctx.db.patch(args.projectId, {
      name: trimmed,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    emoji: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== effectiveUserId) {
      throw new Error("Project not found.");
    }

    await ctx.db.patch(args.projectId, {
      emoji: args.emoji !== undefined
        ? args.emoji == null
          ? null
          : args.emoji
        : undefined,
      instructions: args.instructions !== undefined
        ? args.instructions == null
          ? null
          : args.instructions
        : undefined,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const deleteProject = mutation({
  args: {
    projectId: v.id("projects"),
    mode: v.union(v.literal("move"), v.literal("delete")),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId } = await effectiveUser(ctx, callerId);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== effectiveUserId) {
      throw new Error("Project not found.");
    }

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_project", (q) =>
        q.eq("userId", effectiveUserId).eq("projectId", args.projectId),
      )
      .collect();

    const affected = conversations.length;

    if (args.mode === "delete") {
      for (const c of conversations) {
        await ctx.db.delete(c._id);

        const messages = await ctx.db
          .query("ashyMessages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", c._id),
          )
          .collect();

        for (const m of messages) {
          await ctx.db.delete(m._id);
        }
      }

      await ctx.db.delete(args.projectId);
    } else {
      for (const c of conversations) {
        await ctx.db.patch(c._id, {
          projectId: null,
          updatedAt: Date.now(),
        });
      }
    }

    return { affected };
  },
});

// ─── admin audit (de-duplicated) ─────────────────────────────────────────────

export const reportAshyHistoryViewed = mutation({
  args: {},
  handler: async (ctx) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId, isImpersonating } =
      await effectiveUser(ctx, callerId);

    if (!isImpersonating) return { ok: true };

    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: true };

    await recordAdminAuditIfDue(
      ctx,
      userId,
      effectiveUserId,
      "view_ashy_history",
    );

    return { ok: true };
  },
});

export const reportAshyChatOpened = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not signed in.");

    const { effectiveUserId, isImpersonating } =
      await effectiveUser(ctx, callerId);

    if (!isImpersonating) return { ok: true };

    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: true };

    await recordAdminAuditIfDue(
      ctx,
      userId,
      effectiveUserId,
      "view_ashy_chat",
      args.conversationId,
    );

    return { ok: true };
  },
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function notDeleted(c: Doc<"conversations">): boolean {
  return c.deleted !== true;
}

function toChatRow(c: Doc<"conversations">) {
  return {
    _id: c._id,
    title: c.title,
    pinned: (c.pinned ?? false) as boolean,
    projectId: (c.projectId ?? null) as Id<"projects"> | null,
    updatedAt: c.updatedAt,
    messageCount: (c.messageCount ?? 0) as number,
  };
}

type MessageRow = Doc<"ashyMessages">;
type ResolvedMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: Array<{ mimeType: string; url: string | null }>;
  error?: "unauthorized" | "quota" | "unavailable" | "blocked" | "invalidImage";
  videos?:
    | Array<{
        videoId: string;
        title: string;
        channel: string;
        thumbnail: string;
        durationLabel: string;
      }>
    | undefined;
  videoSearch?:
    | {
        query: string;
        ok: false;
        message: string;
      }
    | undefined;
  sources?:
    | Array<{ title: string; url: string; domain: string }>
    | undefined;
  searchQueries?: string[] | undefined;
  searchNotice?: string | undefined;
  searchNoticeKind?:
    | "userLimit"
    | "providerQuota"
    | "other"
    | undefined;
  grounded?: boolean | undefined;
  searchEntryPointUrl?: string | undefined;
  chips?: string[] | undefined;
  planMissions?: { itemIds: string[]; labels: string[] } | undefined;
};

function resolveMessage(
  ctx: any,
): (m: MessageRow) => Promise<ResolvedMessage> {
  return async (m) => {
    const images =
      m.images != null
        ? await Promise.all(
            m.images.map(async (img) => ({
              mimeType: img.mimeType,
              url: await ctx.storage.getUrl(img.storageId),
            })),
          )
        : undefined;

    return {
      id: m.clientMessageId,
      role: m.role,
      text: m.text,
      images,
      error: m.errorKind ?? undefined,
      videos: m.videos ?? undefined,
      videoSearch: m.videoSearch ?? undefined,
      sources: m.sources ?? undefined,
      searchQueries: m.searchQueries ?? undefined,
      searchNotice: m.searchNotice ?? undefined,
      searchNoticeKind: m.searchNoticeKind ?? undefined,
      grounded: m.grounded ?? undefined,
      searchEntryPointUrl: m.searchEntryPointUrl ?? undefined,
      chips: m.chips ?? undefined,
      planMissions: m.planMissions ?? undefined,
    };
  };
}
