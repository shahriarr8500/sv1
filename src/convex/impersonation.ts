import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import type {
  DataModel,
  Doc,
  Id,
} from "./_generated/dataModel";
import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { ROLES } from "./schema";

type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

interface SyncedProgress {
  profile: Record<string, unknown> | null;
  completions: Record<string, number>;
  updatedAt: number;
}

async function adminId(ctx: AnyCtx): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get(userId);
  return user?.role === ROLES.ADMIN ? userId : null;
}

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

export async function resolveWriteTarget(
  ctx: AnyCtx,
  callerId: Id<"users">,
): Promise<Id<"users">> {
  const caller = await ctx.db.get(callerId);
  if (caller?.role !== ROLES.ADMIN) return callerId;
  const grant = await activeGrant(ctx, callerId);
  return grant?.targetUserId ?? callerId;
}

export const getEffectiveUser = internalQuery({
  args: {
    callerId: v.id("users"),
    requestedTargetUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db.get(args.callerId);
    if (caller?.role !== ROLES.ADMIN) {
      return { effectiveUserId: args.callerId, isImpersonating: false };
    }

    const grant = await activeGrant(ctx, args.callerId);
    if (grant === null) {
      return { effectiveUserId: args.callerId, isImpersonating: false };
    }

    const target = await ctx.db.get(grant.targetUserId);
    if (target === null) {
      return { effectiveUserId: args.callerId, isImpersonating: false };
    }

    if (args.requestedTargetUserId !== undefined) {
      if (args.requestedTargetUserId !== grant.targetUserId) {
        return { effectiveUserId: args.callerId, isImpersonating: false };
      }
    }

    return { effectiveUserId: grant.targetUserId, isImpersonating: true };
  },
});

export async function recordAdminAuditIfDue(
  ctx: GenericMutationCtx<DataModel>,
  adminUserId: Id<"users">,
  targetUserId: Id<"users">,
  action: "view_ashy_history" | "view_ashy_chat",
  conversationId?: Id<"conversations">,
): Promise<void> {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;

  type AuditDoc = Doc<"adminAuditLog">;
  const previous: AuditDoc | null = await ctx.db
    .query("adminAuditLog")
    .withIndex("by_admin_target_action_created", (q) =>
      q
        .eq("adminUserId", adminUserId)
        .eq("targetUserId", targetUserId)
        .eq("action", action),
    )
    .order("desc")
    .first();

  if (previous !== null && now - previous.createdAt < windowMs) {
    return;
  }

  await ctx.db.insert("adminAuditLog", {
    adminUserId,
    targetUserId,
    action,
    createdAt: now,
    conversationId:
      action === "view_ashy_chat" && conversationId
        ? conversationId
        : undefined,
  });
}
