import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { resolveWriteTarget } from "./impersonation";
import { mutation } from "./_generated/server";

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
    const callerId = await getAuthUserId(ctx);
    if (callerId === null) throw new Error("Not signed in.");

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