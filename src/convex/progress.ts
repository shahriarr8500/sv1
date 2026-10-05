import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { resolveWriteTarget } from "./impersonation";
import { mutation, query } from "./_generated/server";

/**
 * Returns the caller, or throws when the account has been banned.
 *
 * Convex Auth owns the sign-in flow itself, so a ban is enforced here instead:
 * every function that touches a student's own data refuses banned accounts.
 */
async function requireActiveUser(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("This account no longer exists.");
  if (user.bannedAt) {
    throw new Error("This account has been suspended. Contact an admin.");
  }
  return userId;
}

/**
 * Per-user progress mirroring.
 *
 * The Student OS state (onboarding profile + syllabus completions) lives in
 * the student's browser. This mutation copies it onto their own Convex user
 * document so the admin console can read and correct it. A student can only
 * ever write their own record — except while an admin is impersonating them,
 * in which case the write is routed to the account being impersonated.
 */
export const syncMyProgress = mutation({
  args: {
    profile: v.optional(v.any()),
    completions: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const callerId = await requireActiveUser(ctx);

    const targetId = await resolveWriteTarget(ctx, callerId);
    await ctx.db.patch(targetId, {
      progress: {
        profile: args.profile ?? null,
        completions: args.completions,
        updatedAt: Date.now(),
      },
    });
    return { ok: true };
  },
});
/**
 * The caller's own mirrored progress, so a device that has never used the app
 * (new phone, cleared browser) can hydrate from the account instead of
 * starting empty. Returns null when the account has never synced.
 */
export const myProgress = query({
  args: {},
  handler: async (ctx) => {
    let userId: Id<"users"> | null;
    let user: Doc<"users"> | null;
    try {
      userId = await requireActiveUser(ctx);
      user = await ctx.db.get(userId);
    } catch {
      // A banned or removed account simply has nothing to hydrate from.
      return null;
    }
    const raw = user?.progress as
      | { profile?: unknown; completions?: Record<string, number>; updatedAt?: number }
      | undefined;
    if (!raw) return null;
    return {
      profile: (raw.profile ?? null) as Record<string, unknown> | null,
      completions:
        raw.completions && typeof raw.completions === "object" ? raw.completions : {},
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    };
  },
});
