/**
 * My Daily Tasks — the personal to-do system running beside the chapter-based
 * missions.
 *
 * Two tables, two jobs:
 *
 *   `dailyTasks`       the *series*: schedule (start date, repeat rule) plus
 *                      the content a task has by default.
 *   `taskOccurrences`  one row per (task, date): the content that day, plus
 *                      that day's own completion and deletion marks.
 *
 * Occurrence rows are materialised by `materialize()`, which only ever *adds*
 * rows — a (taskId, date) key check makes it idempotent, so refreshing,
 * opening the app on a second device or calling `syncWindow` twice can never
 * duplicate a day. Because every day lives in its own row, editing or
 * re-scheduling a series never rewrites days that already happened: history
 * survives edits and repeat changes, and a change only touches the occurrence
 * the student picked, or the current day and every day after it.
 *
 * Dates are plain local "YYYY-MM-DD" keys everywhere (Asia/Dhaka calendar
 * dates, never `toISOString()`), so a task planned for tonight can't drift to
 * tomorrow. Every mutation re-validates through the same pure module the UI
 * uses (`src/lib/student-os/daily-tasks.ts`) and every read/write is scoped to
 * the signed-in user's own rows.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireActiveUser } from "./progress";
import {
  MAX_OCCURRENCES_PER_SYNC,
  isDateKey,
  occursOn,
  occurrenceDates,
  validateTaskDraft,
  validateWindow,
  type TaskDraft,
} from "../lib/student-os/daily-tasks";

type Ctx = GenericMutationCtx<DataModel>;

const priorityArg = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));
const repeatArg = v.union(
  v.literal("none"),
  v.literal("daily"),
  v.literal("weekdays"),
  v.literal("weekly"),
);
const scopeArg = v.union(v.literal("occurrence"), v.literal("future"));
/** Nullable so "clear the description / time" can be expressed as null. */
const textArg = v.union(v.string(), v.null());
const numbersArg = v.union(v.array(v.number()), v.null());

const patchArg = v.optional(
  v.object({
    title: v.optional(v.string()),
    description: v.optional(textArg),
    priority: v.optional(priorityArg),
    category: v.optional(v.string()),
    dueTime: v.optional(textArg),
    date: v.optional(v.string()),
    repeat: v.optional(repeatArg),
    weekdays: v.optional(numbersArg),
  }),
);

/**
 * Asia/Dhaka is UTC+6 with no daylight saving, so a fixed offset always gives
 * the right calendar date — unlike the server's own timezone, which is UTC.
 */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function dhakaTodayKey(now = Date.now()): string {
  const shifted = new Date(now + DHAKA_OFFSET_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

/** The later of two date keys. */
function later(a: string, b: string): string {
  return a > b ? a : b;
}

/** Convex args may carry null for "empty"; the validator wants undefined. */
function toDraft(input: {
  title?: unknown;
  description?: unknown;
  date?: unknown;
  priority?: unknown;
  category?: unknown;
  repeat?: unknown;
  weekdays?: unknown;
  dueTime?: unknown;
}): TaskDraft {
  return {
    title: input.title,
    description: input.description ?? undefined,
    date: input.date,
    priority: input.priority,
    category: input.category,
    repeat: input.repeat ?? undefined,
    weekdays: input.weekdays ?? undefined,
    dueTime: input.dueTime ?? undefined,
  };
}

function stripUser<T extends { userId: Id<"users"> }>(doc: T): Omit<T, "userId"> {
  const { userId: _owner, ...rest } = doc;
  return rest;
}

/* -------------------------------------------------------------------------- */
/* Occurrence materialisation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Create any missing occurrence rows for `tasks` inside [from, to].
 *
 * Rows that already exist — including ones soft-deleted by the student — are
 * skipped, so this can run as often as the UI likes without ever duplicating a
 * day or resurrecting a deleted one. Returns how many rows it created.
 */
async function materialize(
  ctx: Ctx,
  userId: Id<"users">,
  tasks: Doc<"dailyTasks">[],
  from: string,
  to: string,
): Promise<number> {
  const window = validateWindow(from, to);
  if (!window.ok) return 0;

  const existing = await ctx.db
    .query("taskOccurrences")
    .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", window.from).lte("date", window.to),
      )
    .take(4000);
  const seen = new Set(existing.map((row) => `${row.taskId as string}|${row.date}`));

  const now = Date.now();
  let created = 0;
  for (const task of tasks) {
    for (const date of occurrenceDates(task, window.from, window.to)) {
      const key = `${task._id as string}|${date}`;
      if (seen.has(key)) continue;
      if (created >= MAX_OCCURRENCES_PER_SYNC) return created;
      seen.add(key);
      await ctx.db.insert("taskOccurrences", {
        userId,
        taskId: task._id,
        date,
        title: task.title,
        description: task.description ?? null,
        priority: task.priority,
        category: task.category,
        dueTime: task.dueTime ?? null,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }
  }
  return created;
}

/** The single row for (task, date), or null when it has never been created. */
async function findOccurrence(
  ctx: Ctx,
  taskId: Id<"dailyTasks">,
  date: string,
): Promise<Doc<"taskOccurrences"> | null> {
  return await ctx.db
    .query("taskOccurrences")
    .withIndex("by_task_date", (q) => q.eq("taskId", taskId).eq("date", date))
    .first();
}

/**
 * The row for (task, date), creating it on demand when the series really does
 * occur that day — this is what makes "complete a task" work on a fresh device
 * whose window has never been synced.
 */
async function ensureOccurrence(
  ctx: Ctx,
  userId: Id<"users">,
  task: Doc<"dailyTasks">,
  date: string,
): Promise<Doc<"taskOccurrences">> {
  const existing = await findOccurrence(ctx, task._id, date);
  if (existing) return existing;
  if (!occursOn(task, date)) {
    throw new Error("This task is not scheduled for that date.");
  }
  const now = Date.now();
  const id = await ctx.db.insert("taskOccurrences", {
    userId,
    taskId: task._id,
    date,
    title: task.title,
    description: task.description ?? null,
    priority: task.priority,
    category: task.category,
    dueTime: task.dueTime ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Could not create this occurrence.");
  return created;
}

/** Load a task the caller owns, or fail. */
async function requireTask(
  ctx: Ctx,
  userId: Id<"users">,
  taskId: Id<"dailyTasks">,
): Promise<Doc<"dailyTasks">> {
  const task = await ctx.db.get(taskId);
  if (!task || task.userId !== userId) throw new Error("Task not found.");
  return task;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every task and every live occurrence inside a date window.
 *
 * The window is bounded (124 days), so the client can subscribe to whatever
 * range it is showing — this week, a month, a single day — without pulling a
 * student's whole history.
 */
export const listWindow = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const window = validateWindow(args.from, args.to);
    const userId = await getAuthUserId(ctx);
    if (!window.ok || userId === null) return { occurrences: [], tasks: [] };

    const occurrences = await ctx.db
      .query("taskOccurrences")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", window.from).lte("date", window.to),
      )
      .take(4000);
    const tasks = await ctx.db
      .query("dailyTasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);

    return {
      occurrences: occurrences.filter((row) => !row.deletedAt).map(stripUser),
      tasks: tasks.map(stripUser),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Make sure every scheduled day inside the window has a row.
 *
 * Called whenever the visible range changes and right after any write that
 * could add days (new task, new repeat rule, a date moved forward). Idempotent
 * by construction, so double-mounting a view or syncing from two tabs is safe.
 */
export const syncWindow = mutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    const window = validateWindow(args.from, args.to);
    if (!window.ok) throw new Error(window.error);

    const tasks = await ctx.db
      .query("dailyTasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
    const created = await materialize(ctx, userId, tasks, window.from, window.to);
    return { created };
  },
});

/** Create a series and materialise the days the student is currently viewing. */
export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(textArg),
    date: v.string(),
    priority: priorityArg,
    category: v.string(),
    repeat: repeatArg,
    weekdays: v.optional(numbersArg),
    dueTime: v.optional(textArg),
    syncFrom: v.string(),
    syncTo: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    const window = validateWindow(args.syncFrom, args.syncTo);
    if (!window.ok) throw new Error(window.error);

    const validated = validateTaskDraft(toDraft(args));
    if (!validated.ok) throw new Error(validated.error);
    const value = validated.value;

    const now = Date.now();
    const id = await ctx.db.insert("dailyTasks", {
      userId,
      title: value.title,
      description: value.description ?? null,
      priority: value.priority,
      category: value.category,
      dueTime: value.dueTime ?? null,
      repeat: value.repeat,
      weekdays: value.weekdays ?? null,
      startDate: value.date,
      createdAt: now,
      updatedAt: now,
    });

    const created = await ctx.db.get(id);
    if (created) await materialize(ctx, userId, [created], window.from, window.to);
    return { id };
  },
});

/**
 * Toggle one date of one task — the only way a day ever becomes completed.
 *
 * Completion is stored on the occurrence row, never on the series, so
 * finishing today says nothing about tomorrow, and undoing simply clears the
 * mark.
 */
export const setCompleted = mutation({
  args: { taskId: v.id("dailyTasks"), date: v.string(), completed: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    if (!isDateKey(args.date)) throw new Error("Invalid date.");

    const task = await requireTask(ctx, userId, args.taskId);
    if (task.archivedAt) throw new Error("This task was deleted.");

    const row = await ensureOccurrence(ctx, userId, task, args.date);
    if (row.deletedAt) throw new Error("This occurrence was deleted.");

    await ctx.db.patch(row._id, {
      completedAt: args.completed ? Date.now() : null,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Edit a task.
 *
 * Two scopes, matching the choice the dialog offers:
 *
 *   `occurrence` — content only (title, description, priority, category, due
 *                  time) for that one date. The schedule is never touched, so
 *                  the edit can't leak onto other days.
 *   `future`     — the series itself, applied from an anchor date (the day
 *                  being edited, or today — never a past day, so history can't
 *                  be rewritten). Existing rows from the anchor on are
 *                  re-shaped to the new rule: rows that no longer occur are
 *                  soft-deleted, the rest take the new content, and rows
 *                  before the anchor keep exactly what they had.
 */
export const updateTask = mutation({
  args: {
    taskId: v.id("dailyTasks"),
    scope: scopeArg,
    date: v.string(),
    patch: patchArg,
    syncFrom: v.string(),
    syncTo: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    if (!isDateKey(args.date)) throw new Error("Invalid date.");
    const window = validateWindow(args.syncFrom, args.syncTo);
    if (!window.ok) throw new Error(window.error);

    const task = await requireTask(ctx, userId, args.taskId);
    if (task.archivedAt) throw new Error("This task was deleted.");

    const patch = args.patch ?? {};
    const now = Date.now();

    if (args.scope === "occurrence") {
      const row = await ensureOccurrence(ctx, userId, task, args.date);
      if (row.deletedAt) throw new Error("This occurrence was deleted.");

      const validated = validateTaskDraft(
        toDraft({
          title: patch.title ?? row.title,
          description: patch.description !== undefined ? patch.description : row.description,
          date: row.date,
          priority: patch.priority ?? row.priority,
          category: patch.category ?? row.category,
          repeat: task.repeat,
          weekdays: task.weekdays,
          dueTime: patch.dueTime !== undefined ? patch.dueTime : row.dueTime,
        }),
      );
      if (!validated.ok) throw new Error(validated.error);
      const value = validated.value;

      await ctx.db.patch(row._id, {
        title: value.title,
        description: value.description ?? null,
        priority: value.priority,
        category: value.category,
        dueTime: value.dueTime ?? null,
        updatedAt: now,
      });

      // A one-off has exactly one day, so its series must follow along.
      if (task.repeat === "none") {
        await ctx.db.patch(task._id, {
          title: value.title,
          description: value.description ?? null,
          priority: value.priority,
          category: value.category,
          dueTime: value.dueTime ?? null,
          startDate: row.date,
          updatedAt: now,
        });
      }
      return { ok: true };
    }

    /* scope === "future" — edit the series from the anchor date onwards. */
    const validated = validateTaskDraft(
      toDraft({
        title: patch.title ?? task.title,
        description: patch.description !== undefined ? patch.description : task.description,
        date: patch.date ?? task.startDate,
        priority: patch.priority ?? task.priority,
        category: patch.category ?? task.category,
        repeat: patch.repeat ?? task.repeat,
        weekdays: patch.weekdays !== undefined ? patch.weekdays : task.weekdays,
        dueTime: patch.dueTime !== undefined ? patch.dueTime : task.dueTime,
      }),
    );
    if (!validated.ok) throw new Error(validated.error);
    const value = validated.value;

    // A one-off is edited whole; a repeat never reaches back past today.
    const anchor =
      task.repeat === "none" ? task.startDate : later(args.date, dhakaTodayKey());

    await ctx.db.patch(task._id, {
      title: value.title,
      description: value.description ?? null,
      priority: value.priority,
      category: value.category,
      dueTime: value.dueTime ?? null,
      startDate: value.date,
      repeat: value.repeat,
      weekdays: value.weekdays ?? null,
      updatedAt: now,
    });

    const nextSeries: Doc<"dailyTasks"> = {
      ...task,
      title: value.title,
      description: value.description ?? null,
      priority: value.priority,
      category: value.category,
      dueTime: value.dueTime ?? null,
      startDate: value.date,
      repeat: value.repeat,
      weekdays: value.weekdays ?? null,
      updatedAt: now,
    };

    const rows = await ctx.db
      .query("taskOccurrences")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", anchor).lte("date", "9999-12-31"),
      )
      .take(2000);
    for (const row of rows) {
      if (row.deletedAt) continue; // stays deleted — a delete is its own choice
      if (occursOn(nextSeries, row.date)) {
        await ctx.db.patch(row._id, {
          title: value.title,
          description: value.description ?? null,
          priority: value.priority,
          category: value.category,
          dueTime: value.dueTime ?? null,
          updatedAt: now,
        });
      } else {
        // The new rule no longer covers this day: stop it, keep the record.
        await ctx.db.patch(row._id, { deletedAt: now, updatedAt: now });
      }
    }

    await materialize(ctx, userId, [nextSeries], anchor, window.to);
    return { ok: true };
  },
});

/**
 * Delete a task.
 *
 * `occurrence` removes a single day; `future` archives the series from the
 * anchor date on — no occurrence is ever created from there again, while days
 * before the anchor (and their completions) stay exactly as they were, so
 * history survives a deleted series.
 */
export const deleteTask = mutation({
  args: {
    taskId: v.id("dailyTasks"),
    scope: scopeArg,
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireActiveUser(ctx);
    if (!isDateKey(args.date)) throw new Error("Invalid date.");

    const task = await requireTask(ctx, userId, args.taskId);
    const now = Date.now();

    if (args.scope === "occurrence") {
      const row = await ensureOccurrence(ctx, userId, task, args.date);
      if (!row.deletedAt) await ctx.db.patch(row._id, { deletedAt: now, updatedAt: now });
      return { ok: true };
    }

    const anchor =
      task.repeat === "none" ? task.startDate : later(args.date, dhakaTodayKey());
    if (!task.archivedAt) {
      await ctx.db.patch(task._id, {
        archivedAt: now,
        archivedFrom: anchor,
        updatedAt: now,
      });
    }

    const rows = await ctx.db
      .query("taskOccurrences")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", anchor).lte("date", "9999-12-31"),
      )
      .take(2000);
    for (const row of rows) {
      if (row.deletedAt) continue;
      await ctx.db.patch(row._id, { deletedAt: now, updatedAt: now });
    }
    return { ok: true };
  },
});
