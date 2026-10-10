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
