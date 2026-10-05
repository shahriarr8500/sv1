import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { ROLES } from "./schema";

/**
 * Admin impersonation — "log in as" any account.
 *
 * Only an account holding the `admin` role can open a session, and that role is
 * re-checked on the server for every call rather than trusted from the client.
 * Each session is recorded in the `impersonations` table and marked ended when
 * it stops, so there is a permanent record of who opened whose account and when.
 *
 * While a session is open the app renders the *target's* dashboard state and
 * writes are routed back to the target, so the admin sees exactly what that
 * student sees.
 */

type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

interface SyncedProgress {
  profile: Record<string, unknown> | null;
  completions: Record<string, number>;
  updatedAt: number;
}

/** The caller's id when they are an admin, otherwise null. */
async function adminId(ctx: AnyCtx): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  return user?.role === ROLES.ADMIN ? userId : null;
}

/** The caller's open impersonation session, if any. */
async function activeGrant(
  ctx: AnyCtx,
  adminUserId: Id<"users">,
): Promise<Doc<"impersonations"> | null> {
  const row = await ctx.db
    .query("impersonations")
    .withIndex("adminUserId", (q) => q.eq("adminUserId", adminUserId))
    .filter((q) => q.eq(q.field("active"), true))
    .first();
  return row ?? null;
}

function readProgress(user: Doc<"users">): SyncedProgress {
  const raw = user.progress as SyncedProgress | undefined;
  return {
    profile: (raw?.profile ?? null) as Record<string, unknown> | null,
    completions:
      raw?.completions && typeof raw.completions === "object"
        ? raw.completions
        : {},
    updatedAt: typeof raw?.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

/** Open an impersonation session on `targetUserId`. */
export const start = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    const adminUserId = await adminId(ctx);
    if (adminUserId === null) {
      throw new Error("Admin access required.");
    }
    if (args.targetUserId === adminUserId) {
      throw new Error("You are already signed in as yourself.");
    }
    const target = await ctx.db.get(args.targetUserId);
    if (target === null) throw new Error("That account no longer exists.");

    // Only one open session per admin.
    const existing = await activeGrant(ctx, adminUserId);
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        active: false,
        endedAt: Date.now(),
      });
    }

    await ctx.db.insert("impersonations", {
      adminUserId,
      targetUserId: args.targetUserId,
      startedAt: Date.now(),
      active: true,
    });
    return { ok: true };
  },
});

/** Close the caller's open impersonation session. */
export const stop = mutation({
  args: {},
  handler: async (ctx) => {
    const adminUserId = await adminId(ctx);
    if (adminUserId === null) throw new Error("Admin access required.");
    const grant = await activeGrant(ctx, adminUserId);
    if (grant !== null) {
      await ctx.db.patch(grant._id, { active: false, endedAt: Date.now() });
    }
    return { ok: true };
  },
});

/**
 * The caller's open session, if any, plus the target's identity. Returns
 * `{ active: false }` for everyone else, so this is safe to call on every page.
 */
export const active = query({
  args: {},
  handler: async (ctx) => {
    const callerId = await getAuthUserId(ctx);
    if (callerId === null) return { active: false as const };
    const caller = await ctx.db.get(callerId);
    if (caller?.role !== ROLES.ADMIN) return { active: false as const };

    const grant = await activeGrant(ctx, callerId);
    if (grant === null) return { active: false as const };
    const target = await ctx.db.get(grant.targetUserId);
    if (target === null) return { active: false as const };

    return {
      active: true as const,
      startedAt: grant.startedAt,
      target: {
        id: target._id,
        name: target.name ?? null,
        email: target.email ?? null,
        role: target.role ?? ROLES.USER,
      },
    };
  },
});

/**
 * The target's dashboard state, so the app can render their screens while the
 * admin is signed in as them. Requires an open session on this account.
 */
export const targetState = query({
  args: {},
  handler: async (ctx) => {
    const adminUserId = await adminId(ctx);
    if (adminUserId === null) throw new Error("Admin access required.");
    const grant = await activeGrant(ctx, adminUserId);
    if (grant === null) throw new Error("No impersonation session is open.");
    const target = await ctx.db.get(grant.targetUserId);
    if (target === null) throw new Error("That account no longer exists.");

    const progress = readProgress(target);
    return {
      targetUserId: target._id,
      profile: progress.profile,
      completions: progress.completions,
      updatedAt: progress.updatedAt,
    };
  },
});

/**
 * Writes made while impersonating go to the target instead of the admin's own
 * account, so progress changes land on the student whose session is open.
 */
export async function resolveWriteTarget(
  ctx: AnyCtx,
  callerId: Id<"users">,
): Promise<Id<"users">> {
  const caller = await ctx.db.get(callerId);
  if (caller?.role !== ROLES.ADMIN) return callerId;
  const grant = await activeGrant(ctx, callerId);
  return grant?.targetUserId ?? callerId;
}