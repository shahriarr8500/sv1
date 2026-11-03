/**
 * Daily tasks — the pure domain behind "My Daily Tasks".
 *
 * Everything here is deterministic and free of React/Convex/DOM so the same
 * rules can be executed by the browser, by the backend and by the test file:
 *
 *   1. Calendar-date helpers — all keys are local "YYYY-MM-DD" strings built
 *      from calendar components, never from `toISOString()` (which would shift
 *      a late-evening task into the next UTC day and, for a student in
 *      Asia/Dhaka, move it off the day they planned it for).
 *   2. Recurrence — which dates a task series actually occurs on, including
 *      the archive cut-off that stops a deleted series without erasing its
 *      past.
 *   3. Validation — one shared, strict definition of a legal task, used by the
 *      UI before a request is sent and again on the server before a write.
 *   4. Success-rate math — completed ÷ planned × 100 with the honest
 *      "no tasks planned" case, plus the range summaries behind the weekly and
 *      monthly analytics.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type TaskPriority = "low" | "medium" | "high";

/** How a task repeats. `weekdays` only applies to the "weekdays" rule. */
export type TaskRepeat = "none" | "daily" | "weekdays" | "weekly";

/** Which occurrences an edit or delete applies to. */
export type TaskScope = "occurrence" | "future" | "all";

export const TASK_PRIORITIES: ReadonlyArray<{
  id: TaskPriority;
  label: string;
  rank: number;
}> = [
  { id: "low", label: "Low", rank: 0 },
  { id: "medium", label: "Medium", rank: 1 },
  { id: "high", label: "High", rank: 2 },
];

export const TASK_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "study", label: "Study" },
  { id: "personal", label: "Personal" },
  { id: "health", label: "Health" },
  { id: "skill", label: "Skill Development" },
  { id: "work", label: "Work" },
];

/** Categories a student can pick straight from the picker. */
export const PRESET_CATEGORY_IDS: readonly string[] = TASK_CATEGORIES.map(
  (category) => category.id,
);

/** Fallback when a stored category no longer maps to a preset. */
export const DEFAULT_CATEGORY = "study";

export function isPriority(value: unknown): value is TaskPriority {
  return (
    value === "low" || value === "medium" || value === "high"
  );
}

export function isRepeat(value: unknown): value is TaskRepeat {
  return value === "none" || value === "daily" || value === "weekdays" || value === "weekly";
}

export function isScope(value: unknown): value is TaskScope {
  return value === "occurrence" || value === "future" || value === "all";
}

/** "study" → "Study", a custom label → itself. */
export function categoryLabel(category: string): string {
  const preset = TASK_CATEGORIES.find((entry) => entry.id === category);
  if (preset) return preset.label;
  return category.trim() || "Personal";
}

export function isPresetCategory(category: string): boolean {
  return PRESET_CATEGORY_IDS.includes(category);
}

export function priorityRank(priority: TaskPriority): number {
  return TASK_PRIORITIES.find((entry) => entry.id === priority)?.rank ?? 1;
}

export function priorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITIES.find((entry) => entry.id === priority)?.label ?? "Medium";
}

/* -------------------------------------------------------------------------- */
/* Calendar dates — local, never UTC                                          */
/* -------------------------------------------------------------------------- */

/** Longest window a single sync/materialisation pass may cover. */
export const MAX_WINDOW_DAYS = 124;

/** Hard ceiling on occurrences created by one sync, so a bad rule can't flood. */
export const MAX_OCCURRENCES_PER_SYNC = 600;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a real calendar date in "YYYY-MM-DD" form. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const probe = toLocalDate(value);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

export function isTimeValue(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/**
 * "YYYY-MM-DD" → a Date at local midnight.
 *
 * Built from the components on purpose: `new Date("2026-10-31")` would be
 * parsed as UTC and could render as the 30th in a west-of-UTC zone.
 */
function toLocalDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Local calendar key for "now" — the same rule every task list uses. */
export function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDaysKey(key: string, days: number): string {
  const date = toLocalDate(key);
  date.setDate(date.getDate() + days);
  return formatKey(date);
}

function formatKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Day of week for a key, 0 = Sunday … 6 = Saturday. */
export function weekdayOfKey(key: string): number {
  return toLocalDate(key).getDay();
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function dayDiffKey(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Monday-start week containing the key (matches the syllabus week helpers). */
export function weekStartKeyFor(key: string): string {
  const date = toLocalDate(key);
  const offset = (date.getDay() + 6) % 7; // 0 when it is already a Monday
  return addDaysKey(formatKey(date), -offset);
}

export function weekEndKeyFor(key: string): string {
  return addDaysKey(weekStartKeyFor(key), 6);
}

/** "2026-10-31" → "2026-10". */
export function monthKeyOf(key: string): string {
  return key.slice(0, 7);
}

export function monthStartKey(monthKey: string): string {
  return `${monthKey}-01`;
}

export function monthEndKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthKey}-${String(lastDay).padStart(2, "0")}`;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Every date of a Mon–Sun grid covering the month — leading/trailing days from
 * the neighbouring months so the calendar stays a clean 7-column week layout.
 */
export function monthGridKeys(monthKey: string): string[] {
  const start = monthStartKey(monthKey);
  const gridStart = weekStartKeyFor(start);
  const end = monthEndKey(monthKey);
  const gridEnd = addDaysKey(weekEndKeyFor(end), 1);
  const keys: string[] = [];
  for (let cursor = gridStart; cursor < gridEnd; cursor = addDaysKey(cursor, 1)) {
    keys.push(cursor);
  }
  return keys;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dayNameKey(key: string): string {
  return DAY_NAMES[weekdayOfKey(key)];
}

export function shortDayNameKey(key: string): string {
  return dayNameKey(key).slice(0, 3);
}

/** "2026-10-31" → "Sat 31 Oct 2026" (local, no timezone jump). */
export function formatDateKey(key: string): string {
  if (!isDateKey(key)) return key;
  const date = toLocalDate(key);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "October 2026" for the month navigator. */
export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/** "18:30" + "2026-10-31" → a Date in local time (for reminders/display). */
export function dateTimeForKey(key: string, time?: string | null): Date {
  const date = toLocalDate(key);
  if (time && isTimeValue(time)) {
    const [hours, minutes] = time.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_CATEGORY_LENGTH = 40;

/** A validated, trimmed task ready to be written. */
export interface NormalizedTask {
  title: string;
  description?: string;
  date: string;
  priority: TaskPriority;
  category: string;
  repeat: TaskRepeat;
  /** Present only when repeat === "weekdays"; sorted, unique, 0 = Sunday. */
  weekdays?: number[];
  dueTime?: string;
}

export interface TaskDraft {
  title?: unknown;
  description?: unknown;
  date?: unknown;
  priority?: unknown;
  category?: unknown;
  repeat?: unknown;
  weekdays?: unknown;
  dueTime?: unknown;
}

export type ValidationResult =
  | { ok: true; value: NormalizedTask }
  | { ok: false; error: string };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

/**
 * The single definition of a legal task. The UI calls it before sending and
 * the Convex mutation calls it again before writing, so a malformed request
 * can never reach storage — an empty title, page-0-style nonsense, an
 * impossible date or a weekday list without a rule are all rejected with a
 * message a student can act on.
 */
export function validateTaskDraft(draft: TaskDraft): ValidationResult {
  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  if (title.length === 0) return fail("A task needs a title.");
  if (title.length > MAX_TITLE_LENGTH) {
    return fail(`Keep the title under ${MAX_TITLE_LENGTH} characters.`);
  }

  const rawDescription =
    typeof draft.description === "string" ? draft.description.trim() : "";
  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    return fail(`Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  if (!isDateKey(draft.date)) return fail("Pick a valid date for this task.");

  if (!isPriority(draft.priority)) return fail("Priority must be low, medium or high.");
  if (draft.repeat !== undefined && draft.repeat !== null && !isRepeat(draft.repeat)) {
    return fail("Unknown repeat rule.");
  }
  const repeat: TaskRepeat = isRepeat(draft.repeat) ? draft.repeat : "none";

  const category =
    typeof draft.category === "string" && draft.category.trim().length > 0
      ? draft.category.trim()
      : DEFAULT_CATEGORY;
  if (category.length > MAX_CATEGORY_LENGTH) {
    return fail(`Keep the category under ${MAX_CATEGORY_LENGTH} characters.`);
  }

  let weekdays: number[] | undefined;
  if (repeat === "weekdays") {
    if (!Array.isArray(draft.weekdays) || draft.weekdays.length === 0) {
      return fail("Choose at least one weekday.");
    }
    const unique = new Set<number>();
    for (const day of draft.weekdays) {
      if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
        return fail("Weekdays must be whole numbers from 0 (Sunday) to 6.");
      }
      unique.add(day);
    }
    weekdays = [...unique].sort((a, b) => a - b);
    if (weekdays.length === 0) return fail("Choose at least one weekday.");
  }

  let dueTime: string | undefined;
  if (draft.dueTime !== undefined && draft.dueTime !== null && draft.dueTime !== "") {
    if (!isTimeValue(draft.dueTime)) {
      return fail("Time must be in 24-hour HH:MM form.");
    }
    dueTime = draft.dueTime;
  }

  return {
    ok: true,
    value: {
      title,
      description: rawDescription.length > 0 ? rawDescription : undefined,
      date: draft.date,
      priority: draft.priority,
      category,
      repeat,
      weekdays,
      dueTime,
    },
  };
}

/** Bounds a requested window so one sync can never scan an unbounded range. */
export function validateWindow(
  from: unknown,
  to: unknown,
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (!isDateKey(from)) return { ok: false, error: "Invalid window start." };
  if (!isDateKey(to)) return { ok: false, error: "Invalid window end." };
  if (from > to) return { ok: false, error: "Window start is after its end." };
  if (dayDiffKey(from, to) + 1 > MAX_WINDOW_DAYS) {
    return {
      ok: false,
      error: `A window may cover at most ${MAX_WINDOW_DAYS} days.`,
    };
  }
  return { ok: true, from, to };
}

/* -------------------------------------------------------------------------- */
/* Recurrence                                                                 */
/* -------------------------------------------------------------------------- */

/** The schedule half of a task — everything that decides *when* it occurs. */
export interface SeriesLike {
  startDate: string;
  repeat: TaskRepeat;
  weekdays?: number[] | null;
  /** First date with NO occurrence (the day a deleted series was archived). */
  archivedFrom?: string | null;
}

/**
 * Does this series occur on `dateKey`?
 *
 * Rules:
 *   - never before its start date;
 *   - never on or after `archivedFrom` (deleting a recurring task stops the
 *     future while every earlier occurrence — and its completion — survives);
 *   - "none" occurs exactly once, on its start date.
 */
export function occursOn(series: SeriesLike, dateKey: string): boolean {
  if (!isDateKey(dateKey)) return false;
  if (dateKey < series.startDate) return false;
  if (series.archivedFrom && dateKey >= series.archivedFrom) return false;

  switch (series.repeat) {
    case "none":
      return dateKey === series.startDate;
    case "daily":
      return true;
    case "weekly":
      return weekdayOfKey(dateKey) === weekdayOfKey(series.startDate);
    case "weekdays":
      return (series.weekdays ?? []).includes(weekdayOfKey(dateKey));
    default:
      return false;
  }
}

/**
 * Every occurrence inside [from, to], in ascending date order.
 *
 * Deterministic and bounded: a loop over at most MAX_WINDOW_DAYS days, so the
 * backend and the tests agree exactly on what materialising a window produces.
 */
export function occurrenceDates(
  series: SeriesLike,
  from: string,
  to: string,
  cap = MAX_OCCURRENCES_PER_SYNC,
): string[] {
  if (!isDateKey(from) || !isDateKey(to) || from > to) return [];
  const start = series.startDate > from ? series.startDate : from;
  if (start > to) return [];

  const dates: string[] = [];
  for (let cursor = start; cursor <= to; cursor = addDaysKey(cursor, 1)) {
    if (occursOn(series, cursor)) {
      dates.push(cursor);
      if (dates.length >= cap) break;
    }
  }
  return dates;
}

/** "Every day" / "Weekdays" / "Every Sunday" / "Does not repeat". */
export function describeRepeat(series: SeriesLike): string {
  switch (series.repeat) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${dayNameKey(series.startDate)}`;
    case "weekdays": {
      const days = (series.weekdays ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((day) => DAY_NAMES[day].slice(0, 3));
      if (days.length === 0) return "Selected weekdays";
      if (days.length === 7) return "Every day";
      if (days.length === 5 && days[0] === "Mon" && days[4] === "Fri") {
        return "Weekdays (Mon–Fri)";
      }
      return days.join(", ");
    }
    default:
      return "Does not repeat";
  }
}

/* -------------------------------------------------------------------------- */
/* Success-rate math                                                          */
/* -------------------------------------------------------------------------- */

export interface DayCounts {
  planned: number;
  completed: number;
}

export const ZERO_COUNTS: DayCounts = { planned: 0, completed: 0 };

export function combineCounts(...parts: DayCounts[]): DayCounts {
  return parts.reduce<DayCounts>(
    (total, part) => ({
      planned: total.planned + part.planned,
      completed: total.completed + part.completed,
    }),
    { planned: 0, completed: 0 },
  );
}

export function counts(planned: number, completed: number): DayCounts {
  const safePlanned = Math.max(0, planned);
  const safeCompleted = Math.min(Math.max(0, completed), safePlanned);
  return { planned: safePlanned, completed: safeCompleted };
}

/**
 * Daily Success Rate = completed ÷ planned × 100, rounded.
 *
 * Returns `null` — never 100 — when nothing was planned, because "no tasks
 * planned" and "everything finished" are different states and pretending
 * otherwise is the exact dishonesty this feature exists to prevent.
 */
export function successRate(part: DayCounts): number | null {
  const { planned, completed } = counts(part.planned, part.completed);
  if (planned === 0) return null;
  return Math.round((completed / planned) * 100);
}

export function successRateOf(planned: number, completed: number): number | null {
  return successRate({ planned, completed });
}

export interface DaySummary extends DayCounts {
  date: string;
  /** null when nothing was planned that day. */
  rate: number | null;
}

export function summarizeDay(date: string, part: DayCounts): DaySummary {
  const normalized = counts(part.planned, part.completed);
  return { date, ...normalized, rate: successRate(normalized) };
}

export interface RangeSummary {
  /** Days in the range. */
  days: number;
  /** Days that actually had something planned. */
  daysWithTasks: number;
  planned: number;
  completed: number;
  /** Mean of the daily rates over days that had tasks; null if none did. */
  averageRate: number | null;
  /** The best day (highest rate), ties broken by the earlier date. */
  bestDay: DaySummary | null;
  /** Days where every planned task was finished. */
  perfectDays: number;
}

export function summarizeRange(summaries: DaySummary[]): RangeSummary {
  const withTasks = summaries.filter((day) => day.planned > 0);
  const planned = summaries.reduce((total, day) => total + day.planned, 0);
  const completed = summaries.reduce((total, day) => total + day.completed, 0);

  let averageRate: number | null = null;
  if (withTasks.length > 0) {
    const total = withTasks.reduce((sum, day) => sum + (day.rate ?? 0), 0);
    averageRate = Math.round(total / withTasks.length);
  }

  let bestDay: DaySummary | null = null;
  for (const day of [...withTasks].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (bestDay === null || (day.rate ?? 0) > (bestDay.rate ?? 0)) bestDay = day;
  }

  return {
    days: summaries.length,
    daysWithTasks: withTasks.length,
    planned,
    completed,
    averageRate,
    bestDay,
    perfectDays: withTasks.filter((day) => day.rate === 100).length,
  };
}

/** "Live today" vs "Final" vs future — how final a day's number is. */
export function dayStatus(date: string, today = todayKey()): "past" | "today" | "future" {
  if (date < today) return "past";
  if (date === today) return "today";
  return "future";
}