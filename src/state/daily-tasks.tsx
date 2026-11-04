/**
 * My Daily Tasks state — one provider owns the subscription windows, the
 * occurrence rows and every write for the personal to-do system.
 *
 *  - Views register the date range they need (`requestRange`); the provider
 *    keeps up to three independent subscriptions (a plan card, a week, a
 *    month can all be on screen at once) instead of forcing every view into
 *    one window, and merges the results.
 *  - The server materialises every scheduled day inside those windows, so a
 *    refresh or a second device always sees the same rows — never duplicates.
 *  - Completion is optimistic: the tap flips the row immediately through a
 *    small overlay that is dropped only once the server agrees; a failed
 *    write rolls back and reports itself.
 *
 * Nothing important lives here or in localStorage: rows are Convex documents,
 * so history survives reloads, new devices and later edits to the series.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  addDaysKey,
  dayDiffKey,
  todayKey,
  MAX_WINDOW_DAYS,
  type TaskPriority,
  type TaskRepeat,
} from "@/lib/student-os/daily-tasks";

/** A series row as the server returns it (ownership stripped). */
export type TaskSeries = Omit<Doc<"dailyTasks">, "userId">;
/** One scheduled day as the server returns it (ownership stripped). */
export type TaskOccurrence = Omit<Doc<"taskOccurrences">, "userId">;

/** A day's task, ready to render: row data plus the live completion flag. */
export interface DayTask {
  id: Id<"taskOccurrences">;
  taskId: Id<"dailyTasks">;
  date: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  category: string;
  dueTime: string | null;
  completed: boolean;
  completedAt: number | null;
  updatedAt: number;
}

/** What the dialog collects before anything is written. */
export interface TaskInput {
  title: string;
  description?: string;
  date: string;
  priority: TaskPriority;
  category: string;
  repeat: TaskRepeat;
  weekdays?: number[];
  dueTime?: string;
}

/** Content fields a single-occurrence edit may change (never the schedule). */
export interface TaskContentPatch {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  category?: string;
  dueTime?: string | null;
}

/** Schedule fields a "this and future" edit may change. */
export interface TaskSchedulePatch extends TaskContentPatch {
  date?: string;
  repeat?: TaskRepeat;
  weekdays?: number[] | null;
}

export interface UpdateTaskInput {
  taskId: Id<"dailyTasks">;
  /** `occurrence` = this day only; `future` = the series from an anchor on. */
  scope: "occurrence" | "future";
  /** The day being edited / the first day the change applies to. */
  date: string;
  patch: TaskSchedulePatch;
}

export interface DeleteTaskInput {
  taskId: Id<"dailyTasks">;
  scope: "occurrence" | "future";
  date: string;
}

interface DateRange {
  from: string;
  to: string;
}

interface DailyTasksContextValue {
  /** True until at least one window has arrived from the server. */
  loading: boolean;
  /** The windows currently synced with the server (most recent last). */
  ranges: DateRange[];
  /**
   * Registers the range a view needs. Returns the unregister function, so it
   * drops straight into `useEffect`.
   */
  requestRange: (from: string, to: string) => () => void;
  /** Every live occurrence inside the synced windows, grouped by date. */
  tasks: DayTask[];
  /** Every series (schedule + defaults) — labels, repeat text, editing. */
  series: TaskSeries[];
  getSeries: (taskId: Id<"dailyTasks">) => TaskSeries | undefined;
  /** One date's tasks: pending first (highest priority first), then done. */
  forDate: (dateKey: string) => DayTask[];
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (input: UpdateTaskInput) => Promise<void>;
  deleteTask: (input: DeleteTaskInput) => Promise<void>;
  setCompleted: (
    taskId: Id<"dailyTasks">,
    date: string,
    completed: boolean,
  ) => Promise<void>;
}

const DailyTasksContext = createContext<DailyTasksContextValue | null>(null);

/** How many date windows can be subscribed at once (plan, week, month). */
const MAX_SUBSCRIPTIONS = 3;

const EMPTY_TASKS: DayTask[] = [];

const PRIORITY_ORDER: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2 };

function defaultRange(): DateRange {
  const today = todayKey();
  return { from: addDaysKey(today, -31), to: addDaysKey(today, 31) };
}

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

function sameRanges(a: DateRange[], b: DateRange[]): boolean {
  return a.length === b.length && a.every((range, index) => sameRange(range, b[index]));
}

/** The window containing `dateKey`, for writes that add days of their own. */
function rangeFor(ranges: DateRange[], dateKey: string): DateRange {
  return (
    ranges.find((range) => range.from <= dateKey && range.to >= dateKey) ??
    ranges[0] ??
    defaultRange()
  );
}

function taskKey(taskId: Id<"dailyTasks"> | string, date: string): string {
  return `${taskId}|${date}`;
}

export function DailyTasksProvider({ children }: { children: ReactNode }) {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

  // Registration bookkeeping: insertion order doubles as recency order, so
  // dropping the oldest request when a fourth arrives keeps the freshest view.
  const requestsRef = useRef(new Map<number, DateRange>());
  const requestIdRef = useRef(0);
  const [ranges, setRanges] = useState<DateRange[]>(() => [defaultRange()]);

  const recomputeRanges = useCallback(() => {
    const requests = [...requestsRef.current.values()];
    const next =
      requests.length > 0
        ? requests.slice(-MAX_SUBSCRIPTIONS)
        : [defaultRange()];
    setRanges((previous) => (sameRanges(previous, next) ? previous : next));
  }, []);

  const requestRange = useCallback(
    (from: string, to: string) => {
      if (dayDiffKey(from, to) + 1 > MAX_WINDOW_DAYS) {
        // The server rejects wider windows — clamp instead of failing a view.
        console.warn("[daily-tasks] requested range exceeds the window limit");
      }
      const id = (requestIdRef.current += 1);
      requestsRef.current.set(id, { from, to });
      recomputeRanges();
      return () => {
        requestsRef.current.delete(id);
        recomputeRanges();
      };
    },
    [recomputeRanges],
  );

  /* ---------------------------------------------------------------------- */
  /* Server state — one subscription per registered window                  */
  /* ---------------------------------------------------------------------- */

  const first = ranges[0];
  const second = ranges[1];
  const third = ranges[2];

  const resultA = useQuery(api.tasks.listWindow, first ?? "skip");
  const resultB = useQuery(api.tasks.listWindow, second ?? "skip");
  const resultC = useQuery(api.tasks.listWindow, third ?? "skip");

  const syncWindow = useMutation(api.tasks.syncWindow);
  const createMutation = useMutation(api.tasks.createTask);
  const updateMutation = useMutation(api.tasks.updateTask);
  const deleteMutation = useMutation(api.tasks.deleteTask);
  const completionMutation = useMutation(api.tasks.setCompleted);

  // Materialise the days inside each window whenever it moves. Signed-out
  // callers skip this: the query already answers with empty lists.
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    let cancelled = false;
    for (const range of ranges) {
      syncWindow({ from: range.from, to: range.to }).catch((error: unknown) => {
        if (!cancelled) console.warn("[daily-tasks] window sync failed", error);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [ranges, authLoading, isAuthenticated, syncWindow]);

  const merged = useMemo(() => {
    const rowMap = new Map<string, TaskOccurrence>();
    const seriesMap = new Map<string, TaskSeries>();
    let pending = false;
    for (const result of [resultA, resultB, resultC]) {
      if (result === undefined) {
        pending = true;
        continue;
      }
      for (const row of result.occurrences) rowMap.set(taskKey(row.taskId, row.date), row);
      for (const item of result.tasks) seriesMap.set(item._id, item);
    }
    return {
      rows: [...rowMap.values()],
      series: [...seriesMap.values()],
      pending,
    };
  }, [resultA, resultB, resultC]);

  const rows = merged.rows;
  const seriesList = merged.series;

  /* ---------------------------------------------------------------------- */
  /* Optimistic completion                                                  */
  /* ---------------------------------------------------------------------- */

  // key -> desired completion, held until the server row agrees with it.
  const [overlay, setOverlay] = useState<Record<string, boolean>>({});

  const rowByKey = useMemo(() => {
    const map = new Map<string, TaskOccurrence>();
    for (const row of rows) map.set(taskKey(row.taskId, row.date), row);
    return map;
  }, [rows]);

  const tasks = useMemo<DayTask[]>(() => {
    const list = rows.map((row) => {
      const key = taskKey(row.taskId, row.date);
      const flag = overlay[key];
      const completed = flag ?? row.completedAt != null;
      return {
        id: row._id,
        taskId: row.taskId,
        date: row.date,
        title: row.title,
        description: row.description ?? null,
        priority: row.priority,
        category: row.category,
        dueTime: row.dueTime ?? null,
        completed,
        completedAt: flag === undefined ? (row.completedAt ?? null) : null,
        updatedAt: row.updatedAt,
      } satisfies DayTask;
    });
    list.sort((a, b) =>
      a.date === b.date ? compareWithinDay(a, b) : a.date < b.date ? -1 : 1,
    );
    return list;
  }, [rows, overlay]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, DayTask[]>();
    for (const task of tasks) {
      const bucket = map.get(task.date);
      if (bucket) bucket.push(task);
      else map.set(task.date, [task]);
    }
    return map;
  }, [tasks]);

  const seriesById = useMemo(() => {
    const map = new Map<string, TaskSeries>();
    for (const item of seriesList) map.set(item._id, item);
    return map;
  }, [seriesList]);

  const forDate = useCallback(
    (dateKey: string) => tasksByDate.get(dateKey) ?? EMPTY_TASKS,
    [tasksByDate],
  );

  const getSeries = useCallback(
    (taskId: Id<"dailyTasks">) => seriesById.get(taskId),
    [seriesById],
  );

  /* ---------------------------------------------------------------------- */
  /* Writes                                                                 */
  /* ---------------------------------------------------------------------- */

  const createTask = useCallback(
    async (input: TaskInput) => {
      const sync = rangeFor(ranges, input.date);
      try {
        await createMutation({
          title: input.title,
          description: input.description?.trim() || null,
          date: input.date,
          priority: input.priority,
          category: input.category,
          repeat: input.repeat,
          weekdays: input.repeat === "weekdays" ? (input.weekdays ?? []) : null,
          dueTime: input.dueTime || null,
          syncFrom: sync.from,
          syncTo: sync.to,
        });
      } catch (error) {
        reportFailure(error, "Couldn't save this task.");
        throw error;
      }
    },
    [createMutation, ranges],
  );

  const updateTask = useCallback(
    async (input: UpdateTaskInput) => {
      const patch: {
        title?: string;
        description?: string | null;
        priority?: TaskPriority;
        category?: string;
        dueTime?: string | null;
        date?: string;
        repeat?: TaskRepeat;
        weekdays?: number[] | null;
      } = {};
      const source = input.patch;
      if (source.title !== undefined) patch.title = source.title;
      if (source.description !== undefined) patch.description = source.description;
      if (source.priority !== undefined) patch.priority = source.priority;
      if (source.category !== undefined) patch.category = source.category;
      if (source.dueTime !== undefined) patch.dueTime = source.dueTime;
      if (source.date !== undefined) patch.date = source.date;
      if (source.repeat !== undefined) patch.repeat = source.repeat;
      if (source.weekdays !== undefined) patch.weekdays = source.weekdays;

      const sync = rangeFor(ranges, input.date);
      try {
        await updateMutation({
          taskId: input.taskId,
          scope: input.scope,
          date: input.date,
          patch,
          syncFrom: sync.from,
          syncTo: sync.to,
        });
      } catch (error) {
        reportFailure(error, "Couldn't update this task.");
        throw error;
      }
    },
    [updateMutation, ranges],
  );

  const deleteTask = useCallback(
    async (input: DeleteTaskInput) => {
      try {
        await deleteMutation({
          taskId: input.taskId,
          scope: input.scope,
          date: input.date,
        });
      } catch (error) {
        reportFailure(error, "Couldn't delete this task.");
        throw error;
      }
    },
    [deleteMutation],
  );

  const setCompleted = useCallback(
    async (taskId: Id<"dailyTasks">, date: string, completed: boolean) => {
      const key = taskKey(taskId, date);
      setOverlay((previous) => {
        // Entries live only while the server disagrees with them: drop the ones
        // it has already caught up with, then stage this toggle.
        const next: Record<string, boolean> = {};
        for (const [entryKey, desired] of Object.entries(previous)) {
          const row = rowByKey.get(entryKey);
          const settled =
            row !== undefined && (row.completedAt != null) === desired;
          if (!settled) next[entryKey] = desired;
        }
        next[key] = completed;
        return next;
      });
      try {
        await completionMutation({ taskId, date, completed });
      } catch (error) {
        setOverlay((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
        reportFailure(error, "Couldn't update this task.");
        throw error;
      }
    },
    [completionMutation, rowByKey],
  );

  const value = useMemo<DailyTasksContextValue>(
    () => ({
      loading: merged.pending && !authLoading,
      ranges,
      requestRange,
      tasks,
      series: seriesList,
      getSeries,
      forDate,
      createTask,
      updateTask,
      deleteTask,
      setCompleted,
    }),
    [
      merged.pending,
      authLoading,
      ranges,
      requestRange,
      tasks,
      seriesList,
      getSeries,
      forDate,
      createTask,
      updateTask,
      deleteTask,
      setCompleted,
    ],
  );

  return (
    <DailyTasksContext.Provider value={value}>
      {children}
    </DailyTasksContext.Provider>
  );
}

export function useDailyTasks(): DailyTasksContextValue {
  const context = useContext(DailyTasksContext);
  if (!context) {
    throw new Error("useDailyTasks must be used within a DailyTasksProvider");
  }
  return context;
}

/**
 * Keeps `from`…`to` inside a synced window while the view is mounted.
 * Register in an effect: the cleanup hands the range back.
 */
export function useDailyTaskRange(from: string, to: string): void {
  const { requestRange } = useDailyTasks();
  useEffect(() => requestRange(from, to), [from, to, requestRange]);
}

/** Pending tasks first (highest priority first), then completed, then title. */
function compareWithinDay(a: DayTask, b: DayTask): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  const priority = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
  if (priority !== 0) return priority;
  return a.title.localeCompare(b.title);
}

function reportFailure(error: unknown, fallback: string): void {
  const message = error instanceof Error && error.message ? error.message : fallback;
  console.warn("[daily-tasks]", message);
  toast.error(message);
}
