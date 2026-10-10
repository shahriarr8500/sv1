import { getAuthUserId } from "@convex-dev/auth/server";
import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { ROLES } from "./schema";

/**\n * Admin impersonation — "log in as" any account.\n *\n * Only an account holding the `admin` role can open a session, and that role is\n * re-checked on the server for every call rather than trusted from the client.\n * Each session is recorded in the `impersonations` table and marked ended when\n * it stops, so there is a permanent record of who opened whose account and when.\n *\n * While a session is open the app renders the *target's* dashboard state and\n * writes are routed back to the target, so the admin sees exactly what that\n * student sees.\n */

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

/**\n * The caller's open session, if any, plus the target's identity. Returns\n * `{ active: false }` for everyone else, so this is safe to call on every page.\n */
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

/**\n * The target's dashboard state, so the app can render their screens while the\n * admin is signed in as them. Requires an open session on this account.\n */
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

/**\n * Writes made while impersonating go to the target instead of the admin's own\n * account, so progress changes land on the student whose session is open.\n */
export async function resolveWriteTarget(
  ctx: AnyCtx,
  callerId: Id<"users">,
): Promise<Id<"users">> {
  const caller = await ctx.db.get(callerId);
  if (caller?.role !== ROLES.ADMIN) return callerId;
  const grant = await activeGrant(ctx, callerId);
  return grant?.targetUserId ?? callerId;
}

/**\n * One backend helper for Ashy (and any future feature) that needs to resolve\n * the account whose data should be read while impersonation is active.\n *\n * Normal users always get their own id. An admin who has an open session gets\n * the target user id (after the target actually exists in the DB). An admin\n * with no open session, or a client that supplies an override it is not\n * entitled to, gets its own id — the override is ignored rather than trusted.\n *\n * Callers pass their own auth id (from `getAuthUserId`) as `callerId` and may\n * optionally supply the target id the client wants to view. The backend is the\n * only place the override is honored, and only after the admin role is\n * re-checked from the DB.\n *\n * This is a plain helper (not a Convex function) so it can be called directly\n * from any Convex server context — queries, mutations and actions — without\n * going through runQuery/runMutation and without needing it to be present in\n * the generated API.\n */
export async function getEffectiveUser(
  ctx: AnyCtx,
  callerId: Id<"users">,
  requestedTargetUserId?: Id<"users">,
): Promise<{ effectiveUserId: Id<"users">; isImpersonating: boolean }> {
  const caller = await ctx.db.get(callerId);
  if (caller?.role !== ROLES.ADMIN) {
    // Non-admins always read their own data. Passing someone else's id is
    // ignored — there is no second impersonation path to accidentally reuse.
    return { effectiveUserId: callerId, isImpersonating: false };
  }

  const grant = await activeGrant(ctx, callerId);
  if (grant === null) {
    // Admin with no open session: read own data, ignore any requested override.
    return { effectiveUserId: callerId, isImpersonating: false };
  }

  const target = await ctx.db.get(grant.targetUserId);
  if (target === null) {
    // Session is open but the target no longer exists — treat as no-op so the
    // admin sees their own account rather than leaking nothing / crashing.
    return { effectiveUserId: callerId, isImpersonating: false };
  }

  if (requestedTargetUserId !== undefined) {
    // When a caller explicitly asks to view another account, only honor it if
    // it matches the session the admin actually opened. This keeps the helper
    // safe even if some caller ever passes a non-matching id.
    if (requestedTargetUserId !== grant.targetUserId) {
      return { effectiveUserId: callerId, isImpersonating: false };
    }
  }

  return { effectiveUserId: grant.targetUserId, isImpersonating: true };
}

/**\n * Write an audit entry, de-duplicated so one admin session does not write\n * hundreds of entries while the student's chats are being scrolled.\n *\n * - `view_ashy_history`: once per (admin, target) per 10 minutes.\n * - `view_ashy_chat`: once per (admin, target, conversation) per 10 minutes.\n *\n * When the de-duplication window is still open the call is a no-op. When it\n * has elapsed, a new entry is inserted. No message text, chat titles, project\n * names or keys are ever stored — only the conversation id for\n * `view_ashy_chat`, and only status/kind tokens elsewhere.\n *\n * This function must be called from a mutation/action (a context that supports\n * writes), never from a plain query, because it inserts into\n * `adminAuditLog`.\n */
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
    // Still within the de-duplication window — nothing to write.
    return;
  }

  await ctx.db.insert("adminAuditLog", {
    adminUserId,
    targetUserId,
    action,
    createdAt: now,
    conversationId: action === "view_ashy_chat" && conversationId
      ? conversationId
      : undefined,
  });
}
