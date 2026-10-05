import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Per-user progress mirroring.
 *
 * The Student OS state (onboarding profile + syllabus completions) lives in
 * the student's browser. This mutation copies it onto their own Convex user
 * document so the admin console can read and correct it. A student can only
 * ever write their own record.
 */
export const syncMyProgress = mutation({
  args: {
    profile: v.optional(v.any()),
    completions: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");

    await ctx.db.patch(userId, {
      progress: {
        profile: args.profile ?? null,
        completions: args.completions,
        updatedAt: Date.now(),
      },
    });
    return { ok: true };
  },
});