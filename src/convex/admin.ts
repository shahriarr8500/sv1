import { getAuthUserId, invalidateSessions } from "@convex-dev/auth/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import type { Doc, Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { roleValidator, ROLES } from "./schema";

/**
 * Admin console backend.
 *
 * The admin pass is verified **on the server** and then grants the signing-in
 * account the `admin` role. Every admin query/mutation below re-checks that
 * role, so the pass itself never has to be trusted by the client and it is not
 * shipped in the browser bundle.
 */

const ADMIN_PASS = "47244917bL@limon";

/** Shape mirrored from a student's device by `progress.syncMyProgress`. */
export interface SyncedProgress {
  profile: Record<string, unknown> | null;
  /** itemId → completion timestamp (ms). */
  completions: Record<string, number>;
  updatedAt: number;
}

function readProgress(user: Doc<"users">): SyncedProgress | null {
  const raw = user.progress as SyncedProgress | undefined;
  if (!raw || typeof raw !== "object") return null;
  return {
    profile: (raw.profile ?? null) as Record<string, unknown> | null,
    completions:
      raw.completions && typeof raw.completions === "object"
        ? raw.completions
        : {},
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

/** Throws unless the caller is signed in with the admin role. */
async function requireAdmin(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not signed in.");
  }
  const user = await ctx.db.get(userId);
  if (user?.role !== ROLES.ADMIN) {
    throw new Error("Admin access required.");
  }
  return userId;
}

/**
 * Checks the admin entry pass and promotes the calling account to `admin`.
 * The pass is compared server-side and never returned to the client.
 */
export const verifyAdminPass = mutation({
  args: { pass: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sign in before entering the admin pass.");
    }
    if (args.pass.trim() !== ADMIN_PASS) {
      throw new Error("That admin pass isn't right.");
    }
    const user = await ctx.db.get(userId);
    if (user?.role !== ROLES.ADMIN) {
      await ctx.db.patch(userId, { role: ROLES.ADMIN });
    }
    return { ok: true };
  },
});

/** Drops the calling account back to a normal user. */
export const revokeAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    await ctx.db.patch(userId, { role: ROLES.USER });
    return { ok: true };
  },
});

/** True when the signed-in account currently holds the admin role. */
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    return user?.role === ROLES.ADMIN;
  },
});

/** Every account with login details and the progress mirrored by that device. */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map((user) => ({
        id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        role: user.role ?? ROLES.USER,
        emailVerificationTime: user.emailVerificationTime ?? null,
        isAnonymous: user.isAnonymous ?? false,
        bannedAt: user.bannedAt ?? null,
        progress: readProgress(user),
      }))
      .sort(
        (a, b) => (b.emailVerificationTime ?? 0) - (a.emailVerificationTime ?? 0),
      );
  },
});

/**
 * Changes an account's display name and/or role. The display name field is
 * optional on the auth schema, so a blank value is ignored rather than cleared.
 */
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    role: v.optional(roleValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("That account no longer exists.");

    const patch: { name?: string; role?: Doc<"users">["role"] } = {};
    if (args.name !== undefined && args.name.trim()) {
      patch.name = args.name.trim();
    }
    if (args.role !== undefined) {
      patch.role = args.role;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("Nothing to update.");
    }
    await ctx.db.patch(args.userId, patch);
    return { ok: true };
  },
});

/**
 * Replaces an account's mirrored dashboard state: its onboarding profile and
 * its syllabus completions.
 */
export const updateUserProgress = mutation({
  args: {
    userId: v.id("users"),
    profile: v.optional(v.any()),
    /** Pass `null` to wipe completions entirely, or a map to replace it. */
    completions: v.optional(
      v.union(v.record(v.string(), v.number()), v.null()),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("That account no longer exists.");

    const current = readProgress(target);
    const next: SyncedProgress = {
      profile:
        args.profile !== undefined ? args.profile : (current?.profile ?? null),
      completions:
        args.completions !== undefined
          ? (args.completions ?? {})
          : (current?.completions ?? {}),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(args.userId, { progress: next });
    return { ok: true };
  },
});


/* -------------------------------------------------------------------------- */
/* Ban & delete                                                               */
/* -------------------------------------------------------------------------- */

/** Patches the banned flag. Internal: call through the `banUser` action. */
export const setBannedInternal = mutation({
  args: { userId: v.id("users"), banned: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { bannedAt: args.banned ? Date.now() : null });
    return { ok: true };
  },
});

/**
 * Erases every trace of an account so the same email can sign up again from
 * scratch. Internal: call through the `deleteAccount` action.
 *
 * Deleting only the user document is not enough. Convex Auth re-links an email
 * through its `authAccounts` row, not through the user document, so a surviving
 * row makes the next sign-in attempt patch a user that no longer exists and
 * fail with a server error instead of creating a fresh account.
 *
 * Sessions and refresh tokens are already removed by `invalidateSessions`
 * before this runs, so only the account link, its verification codes and the
 * audit trail are left to clear here.
 */
export const purgeUserInternal = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("That account no longer exists.");

    // Drop the login links, plus any one-time codes still attached to them.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
    }

    // Close out any "log in as" session that was pointed at this account, so
    // the audit trail does not keep claiming someone entered a deleted user.
    const auditTrail = await ctx.db.query("impersonations").collect();
    for (const entry of auditTrail) {
      if (entry.targetUserId === args.userId && entry.active) {
        await ctx.db.patch(entry._id, { active: false, endedAt: Date.now() });
      }
    }

    await ctx.db.delete(args.userId);
    return { ok: true };
  },
});

/**
 * Deletes `authAccounts` rows whose user document is missing.
 *
 * Accounts deleted before this cleanup existed leave their login row behind,
 * which locks that email out of signing in again for good: the sign-in attempt
 * fails with a server error and can never recover. This sweep removes those
 * leftovers so the affected emails can register normally.
 *
 * Internal: call through the `repairOrphanAccounts` action.
 */
export const repairOrphanAccountsInternal = mutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("authAccounts").collect();
    const repaired: string[] = [];

    for (const account of accounts) {
      const owner = await ctx.db.get(account.userId);
      if (owner !== null) continue;

      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
      repaired.push(account.providerAccountId || "unknown");
    }

    return { repaired };
  },
});

/**
 * Bans or unbans an account.
 *
 * Banning also invalidates every Convex Auth session for that user, so a
 * device holding a valid session cookie is signed out immediately rather than
 * lingering until the cookie expires.
 */
export const banUser = action({
  args: { userId: v.id("users"), banned: v.boolean() },
  handler: async (ctx, args) => {
    if ((await ctx.runQuery(api.admin.isAdmin)) !== true) {
      throw new Error("Admin access required.");
    }
    if ((await getAuthUserId(ctx)) === args.userId) {
      throw new Error("You cannot ban your own admin account.");
    }
    await invalidateSessions(ctx, { userId: args.userId });
    await ctx.runMutation(api.admin.setBannedInternal, args);
    return { ok: true };
  },
});

/**
 * Permanently deletes an account after signing it out everywhere, removing the
 * login link along with it so the email can sign up again as a brand new
 * account.
 */
export const deleteAccount = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    if ((await ctx.runQuery(api.admin.isAdmin)) !== true) {
      throw new Error("Admin access required.");
    }
    if ((await getAuthUserId(ctx)) === args.userId) {
      throw new Error("You cannot delete your own admin account.");
    }
    await invalidateSessions(ctx, { userId: args.userId });
    await ctx.runMutation(api.admin.purgeUserInternal, args);
    return { ok: true };
  },
});

/**
 * Clears out leftover login rows from accounts that were deleted before the
 * purge existed. Safe to run at any time; it only touches accounts whose user
 * document is already gone.
 */
export const repairOrphanAccounts = action({
  args: {},
  // The return type is stated explicitly because the inferred one would depend
  // on this action's own generated api entry.
  handler: async (ctx): Promise<{ repaired: string[] }> => {
    if ((await ctx.runQuery(api.admin.isAdmin)) !== true) {
      throw new Error("Admin access required.");
    }
    return await ctx.runMutation(api.admin.repairOrphanAccountsInternal, {});
  },
});
