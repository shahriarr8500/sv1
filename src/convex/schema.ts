import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // Student OS progress mirrored from the student's device so the admin
      // console can read (and correct) each account's dashboard state.
      progress: v.optional(v.any()),
      /** Set when an admin bans this account. Banned users are signed out and
       *  refused by the progress functions. */
      bannedAt: v.optional(v.union(v.number(), v.null())),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    // Audit trail of admin "log in as" sessions. The row is kept after it ends
    // so there is always a record of who entered whose account and when.
    impersonations: defineTable({
      adminUserId: v.id("users"),
      targetUserId: v.id("users"),
      startedAt: v.number(),
      /** null while the session is still open. */
      endedAt: v.optional(v.union(v.number(), v.null())),
      /** Cleared when the session ends so only one can be open at a time. */
      active: v.optional(v.boolean()),
    })
      .index("adminUserId", ["adminUserId"])
      .index("active", ["active"]),

    // Hourly cache of identical YouTube searches made by Ashy (Phase 3), so
    // repeated "video on vectors" asks don't burn API quota. Keyed by the
    // normalized search query; entries expire after ~1 hour.
    ashyVideoCache: defineTable({
      key: v.string(),
      results: v.array(
        v.object({
          videoId: v.string(),
          title: v.string(),
          channel: v.string(),
          thumbnail: v.string(),
          durationLabel: v.string(),
        }),
      ),
      createdAt: v.number(),
      expiresAt: v.number(),
    }).index("key", ["key"]),

    // Per-user daily counters for Ashy's web-search features (Phase 4).
    // Grounded searches are capped at a constant per user per day.
    ashySearchUsage: defineTable({
      userId: v.id("users"),
      day: v.string(),
      groundedCount: v.number(),
      /** Tavily backup-search attempts today (per-user constant cap). */
      tavilyCount: v.optional(v.number()),
    }).index("userId_day", ["userId", "day"]),

    // Backup link-search cache (Tavily results for identical queries,
    // ~45 minutes). Keyed by the normalized query.
    ashyLinkCache: defineTable({
      key: v.string(),
      results: v.array(
        v.object({
          title: v.string(),
          url: v.string(),
          domain: v.string(),
          snippet: v.optional(v.string()),
        }),
      ),
      createdAt: v.number(),
      expiresAt: v.number(),
    }).index("key", ["key"]),

    // ------------------------------------------------------------------
    // Ashy chat history — additive only: no pre-existing chat data was
    // touched (there were no chat tables before this), and every field the
    // panel needs (pinned/projectId/updatedAt) is optional so a row written
    // without it keeps working.
    // ------------------------------------------------------------------

    // One chat. `updatedAt` is bumped on every message so the panel can
    // order by recent activity; `titleAuto` marks a title derived from the
    // first message so a student rename is never overwritten.
    conversations: defineTable({
      userId: v.id("users"),
      title: v.string(),
      /** True while the title was generated from the first message. */
      titleAuto: v.optional(v.boolean()),
      /** Set once the student renames the chat — auto-title never wins after. */
      renamedAt: v.optional(v.number()),
      createdAt: v.number(),
      /** Bumped on every persisted message (activity order). */
      updatedAt: v.number(),
      /** Missing = unpinned. */
      pinned: v.optional(v.boolean()),
      pinnedAt: v.optional(v.number()),
      /** Missing = not in a project ("Chats"). */
      projectId: v.optional(v.id("projects")),
      /** Soft delete for the undo window; missing = live. */
      deletedAt: v.optional(v.number()),
      deleted: v.optional(v.boolean()),
      /** Live message count (0 = empty chat). Missing counts as 0. */
      messageCount: v.optional(v.number()),
      /** Highest message seq used so far — keeps message order stable. */
      lastSeq: v.optional(v.number()),
    })
      .index("by_user_updated", ["userId", "updatedAt"])
      .index("by_user_pinned", ["userId", "pinned", "updatedAt"])
      .index("by_user_project", ["userId", "projectId", "updatedAt"])
      .index("by_user_deleted", ["userId", "deleted"]),

    // One message inside a conversation. Images live in Convex storage
    // (a base64 photo can exceed the 1 MiB document limit), so the row only
    // stores the storage id and the display mime type.
    ashyMessages: defineTable({
      conversationId: v.id("conversations"),
      userId: v.id("users"),
      /** Client-generated id — makes sends idempotent and lets the UI merge. */
      clientMessageId: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant")),
      text: v.string(),
      /** Per-conversation sequence number (order is never ambiguous). */
      seq: v.number(),
      createdAt: v.number(),
      /** Set when this assistant row represents a failure, not an answer. */
      errorKind: v.optional(
        v.union(
          v.literal("unauthorized"),
          v.literal("quota"),
          v.literal("unavailable"),
          v.literal("blocked"),
          v.literal("invalidImage"),
        ),
      ),
      images: v.optional(
        v.array(
          v.object({ mimeType: v.string(), storageId: v.id("_storage") }),
        ),
      ),
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
    })
      .index("by_conversation", ["conversationId", "seq"])
      .index("by_conversation_client", ["conversationId", "clientMessageId"])
      .index("by_user", ["userId", "createdAt"]),

    // Student-created groupings for chats ("Projects").
    projects: defineTable({
      userId: v.id("users"),
      name: v.string(),
      emoji: v.optional(v.string()),
      /** The student's own note for chats in this project (preference only). */
      instructions: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])
  },
  {
    schemaValidation: false,
  },
);

export default schema;
