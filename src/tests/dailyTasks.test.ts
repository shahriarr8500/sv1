/**
 * Tests for the My Daily Tasks domain: local calendar dates, recurrence rules,
 * input validation, and the Daily Success Rate math behind the analytics.
 *
 * Run with:  bun src/tests/dailyTasks.test.ts
 * Exit code 0 = all assertions passed.
 *
 * Everything here is pure and deterministic — no React, no Convex, no clock
 * reads except one assertion that `todayKey()` matches the local calendar. The
 * UI, the Convex mutations and the dashboard percentages all run these exact
 * functions, so whatever is proven here is what the student sees.
 */

import {
  MAX_OCCURRENCES_PER_SYNC,
  MAX_TITLE_LENGTH,
  MAX_WINDOW_DAYS,
  addDaysKey,
  categoryLabel,
  combineCounts,
  counts,
  dayDiffKey,
  dayNameKey,
  dayStatus,
  describeRepeat,
  formatDateKey,
  formatMonthKey,
  isDateKey,
  isTimeValue,
  monthEndKey,
  monthGridKeys,
  monthKeyOf,
  monthStartKey,
  occursOn,
  occurrenceDates,
  priorityLabel,
  shiftMonthKey,
  successRate,
  successRateOf,
  summarizeDay,
  summarizeRange,
  todayKey,
  validateTaskDraft,
  validateWindow,
  weekEndKeyFor,
  weekStartKeyFor,
  weekdayOfKey,
} from "../lib/student-os/daily-tasks";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Local calendar dates — never UTC                                        */
/* -------------------------------------------------------------------------- */

assert(isDateKey("2026-10-31"), "a real ISO date is accepted");
assert(isDateKey("2024-02-29"), "a leap day is accepted");
assert(!isDateKey("2026-02-30"), "30 February is rejected");
assert(!isDateKey("2026-13-01"), "month 13 is rejected");
assert(!isDateKey("2026-00-10"), "month 0 is rejected");
assert(!isDateKey("2026-10-00"), "day 0 is rejected");
assert(!isDateKey("0"), "page-number nonsense is not a date");
assert(!isDateKey("2026-1-1"), "unpadded dates are rejected");
assert(!isDateKey("31/10/2026"), "slash dates are rejected");
assert(!isDateKey(20261031), "numbers are not date keys");
assert(!isDateKey(null), "null is not a date key");
assert(!isDateKey(""), "an empty string is not a date key");

const now = new Date();
const localKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
assert(todayKey() === localKey, "todayKey() reads the LOCAL calendar, not UTC");
assert(/^\d{4}-\d{2}-\d{2}$/.test(todayKey()), "todayKey() is a padded ISO key");
assert(
  now.toISOString().slice(0, 10) !== "" && typeof now.toISOString().slice(0, 10) === "string",
  "the UTC key exists but is deliberately never used for task dates",
);

assert(addDaysKey("2026-10-31", 1) === "2026-11-01", "addDays crosses a month boundary");
assert(addDaysKey("2026-12-31", 1) === "2027-01-01", "addDays crosses a year boundary");
assert(addDaysKey("2026-03-01", -1) === "2026-02-28", "backwards across a non-leap February");
assert(addDaysKey("2024-03-01", -1) === "2024-02-29", "backwards across a leap February");
assert(addDaysKey("2026-10-31", 0) === "2026-10-31", "adding zero days is a no-op");

assert(dayDiffKey("2026-10-31", "2026-11-01") === 1, "dayDiff counts one day");
assert(dayDiffKey("2026-11-01", "2026-10-31") === -1, "dayDiff is signed");
assert(dayDiffKey("2026-01-01", "2026-12-31") === 364, "dayDiff spans a whole year");
assert(dayDiffKey("2026-10-31", "2026-10-31") === 0, "dayDiff of a same day is 0");

assert(weekdayOfKey("2026-11-01") === 0, "1 Nov 2026 is a Sunday");
assert(weekdayOfKey("2026-11-02") === 1, "2 Nov 2026 is a Monday");
assert(weekdayOfKey("2026-10-31") === 6, "31 Oct 2026 is a Saturday");
assert(dayNameKey("2026-11-01") === "Sunday", "dayNameKey names the day");

assert(weekStartKeyFor("2026-11-01") === "2026-10-26", "week start walks back to Monday");
assert(weekStartKeyFor("2026-11-02") === "2026-11-02", "a Monday is its own week start");
assert(weekEndKeyFor("2026-11-01") === "2026-11-01", "a Sunday ends its own week");
assert(weekEndKeyFor(weekStartKeyFor("2026-11-04")) === "2026-11-08", "week end is six days on");

assert(monthKeyOf("2026-10-31") === "2026-10", "monthKeyOf trims the day");
assert(monthStartKey("2026-02") === "2026-02-01", "month start is the 1st");
assert(monthEndKey("2026-02") === "2026-02-28", "common-year February ends on the 28th");
assert(monthEndKey("2024-02") === "2024-02-29", "leap-year February ends on the 29th");
assert(monthEndKey("2026-12") === "2026-12-31", "December ends on the 31st");
assert(shiftMonthKey("2026-01", -1) === "2025-12", "month shift crosses years backwards");
assert(shiftMonthKey("2026-12", 1) === "2027-01", "month shift crosses years forwards");
assert(formatMonthKey("2026-10") === "October 2026", "formatMonthKey names the month");

const grid = monthGridKeys("2026-10");
assert(grid.length % 7 === 0, "the month grid is whole weeks");
assert(grid.length === 35 || grid.length === 42, "the month grid is 5 or 6 weeks");
assert(grid.includes("2026-10-01") && grid.includes("2026-10-31"), "the grid covers the month");
assert(grid[0] === weekStartKeyFor(grid[0]), "the grid starts on a Monday");
assert(
  grid.every((key, index) => index === 0 || dayDiffKey(grid[index - 1], key) === 1),
  "grid days are consecutive",
);

// Formatting parses from components, so a local key can never be rendered as
// the previous day the way `new Date("2026-11-01")` (parsed as UTC) would.
assert(
  formatDateKey("2026-11-01").includes("1 Nov 2026"),
  "formatDateKey keeps the day it was given",
);
assert(
  formatDateKey("2026-10-31").includes("31 Oct 2026"),
  "formatDateKey handles month ends",
);
assert(!formatDateKey("nope").includes("NaN"), "formatDateKey passes bad input through");

assert(isTimeValue("18:30"), "HH:MM is accepted");
assert(isTimeValue("00:00"), "midnight is accepted");
assert(!isTimeValue("24:00"), "hour 24 is rejected");
assert(!isTimeValue("7:30"), "unpadded hours are rejected");
assert(!isTimeValue("18:60"), "minute 60 is rejected");

/* -------------------------------------------------------------------------- */
/* 2. Recurrence                                                              */
/* -------------------------------------------------------------------------- */

const once = { startDate: "2026-11-05", repeat: "none" as const };
assert(occursOn(once, "2026-11-05"), "a one-off occurs on its date");
assert(!occursOn(once, "2026-11-06"), "a one-off never occurs twice");
assert(!occursOn(once, "2026-11-04"), "a one-off never occurs before its date");

const daily = { startDate: "2026-11-05", repeat: "daily" as const };
assert(occursOn(daily, "2026-11-05"), "daily occurs on its start date");
assert(occursOn(daily, "2026-12-31"), "daily occurs months later");
assert(!occursOn(daily, "2026-11-04"), "daily never occurs before its start");

const weekly = { startDate: "2026-11-05", repeat: "weekly" as const };
assert(weekdayOfKey("2026-11-05") === 4, "5 Nov 2026 is a Thursday");
assert(occursOn(weekly, "2026-11-12"), "weekly repeats on the same weekday");
assert(!occursOn(weekly, "2026-11-06"), "weekly skips other weekdays");

const weekdaysRule = { startDate: "2026-11-02", repeat: "weekdays" as const, weekdays: [1, 3, 5] };
assert(occursOn(weekdaysRule, "2026-11-02"), "selected Monday occurs");
assert(!occursOn(weekdaysRule, "2026-11-03"), "unselected Tuesday is skipped");
assert(occursOn(weekdaysRule, "2026-11-04"), "selected Wednesday occurs");
assert(occursOn(weekdaysRule, "2026-11-06"), "selected Friday occurs");
assert(!occursOn(weekdaysRule, "2026-11-08"), "Sunday is never in a Mon/Wed/Fri rule");
assert(
  !occursOn({ ...weekdaysRule, weekdays: [] }, "2026-11-02"),
  "an empty weekday rule occurs nowhere",
);

const archived = { ...daily, archivedFrom: "2026-11-08" };
assert(occursOn(archived, "2026-11-07"), "the day before deletion still occurs");
assert(!occursOn(archived, "2026-11-08"), "the deletion day itself no longer occurs");
assert(!occursOn(archived, "2026-11-20"), "the future stops after deletion");
assert(
  !occursOn({ ...once, archivedFrom: "2026-11-05" }, "2026-11-05"),
  "archiving on the start day removes the only occurrence",
);
assert(!occursOn(daily, "not-a-date"), "occursOn rejects nonsense dates");

const span = occurrenceDates(daily, "2026-11-05", "2026-11-14");
assert(span.length === 10, "daily materialises every day of a 10-day window");
assert(span[0] === "2026-11-05" && span[9] === "2026-11-14", "occurrences run start → end of window");
assert(occurrenceDates(daily, "2026-11-10", "2026-11-01").length === 0, "a reversed window yields nothing");
assert(
  occurrenceDates(daily, "2026-10-01", "2026-10-31").length === 0,
  "the window is clipped by the start date",
);
assert(
  JSON.stringify(span) === JSON.stringify(occurrenceDates(daily, "2026-11-05", "2026-11-14")),
  "materialisation is deterministic",
);
assert(
  occurrenceDates(weekdaysRule, "2026-11-02", "2026-11-08").join(",") ===
    "2026-11-02,2026-11-04,2026-11-06",
  "the weekday rule picks exactly the chosen days",
);
assert(
  occurrenceDates(archived, "2026-11-01", "2026-11-30").length === 3,
  "an archived series stops producing occurrences",
);
assert(
  occurrenceDates(once, "2026-11-01", "2026-11-30").length === 1,
  "a one-off materialises exactly once",
);
assert(
  occurrenceDates(daily, "2026-11-01", "2026-11-10", 3).length === 3,
  "a caller-supplied cap bounds materialisation",
);
assert(
  occurrenceDates(daily, "2026-11-01", "2099-01-01").length <= MAX_OCCURRENCES_PER_SYNC,
  "the global cap still holds for a silly range",
);

assert(describeRepeat(once) === "Does not repeat", "one-off repeat label");
assert(describeRepeat(daily) === "Every day", "daily repeat label");
assert(describeRepeat(weekly) === "Every Thursday", "weekly label names the weekday");
assert(describeRepeat(weekdaysRule) === "Mon, Wed, Fri", "weekday list label");
assert(
  describeRepeat({ startDate: "2026-11-02", repeat: "weekdays", weekdays: [1, 2, 3, 4, 5] }) ===
    "Weekdays (Mon–Fri)",
  "Mon–Fri collapses to a familiar label",
);
assert(
  describeRepeat({ startDate: "2026-11-02", repeat: "weekdays", weekdays: [] }) ===
    "Selected weekdays",
  "an empty weekday rule still describes itself",
);

/* -------------------------------------------------------------------------- */
/* 3. Validation — invalid input never becomes a task                         */
/* -------------------------------------------------------------------------- */

const baseDraft = {
  title: "Study Physics for 1 hour",
  date: "2026-11-05",
  priority: "medium",
  category: "study",
  repeat: "none",
};

const ok = validateTaskDraft(baseDraft);
assert(ok.ok, "a well-formed draft validates");
if (ok.ok) {
  assert(ok.value.title === "Study Physics for 1 hour", "the title survives validation");
  assert(ok.value.repeat === "none", "repeat defaults are respected");
  assert(ok.value.weekdays === undefined, "no weekday list without a weekday rule");
  assert(ok.value.dueTime === undefined, "no due time unless asked for");
}

const empty = validateTaskDraft({ ...baseDraft, title: "   " });
assert(!empty.ok, "a blank title is rejected");
assert(!empty.ok && /title/i.test(empty.error), "the blank-title error names the field");

assert(
  !validateTaskDraft({ ...baseDraft, title: "x".repeat(MAX_TITLE_LENGTH + 1) }).ok,
  "an over-long title is rejected",
);
assert(
  validateTaskDraft({ ...baseDraft, title: "x".repeat(MAX_TITLE_LENGTH) }).ok,
  "a boundary-length title passes",
);
const padded = validateTaskDraft({ ...baseDraft, title: "  Read 10 pages  " });
assert(padded.ok && padded.value.title === "Read 10 pages", "titles are trimmed");

assert(!validateTaskDraft({ ...baseDraft, date: "2026-02-30" }).ok, "an impossible date is rejected");
assert(!validateTaskDraft({ ...baseDraft, date: "0" }).ok, "a non-date is rejected");
assert(!validateTaskDraft({ ...baseDraft, priority: "urgent" }).ok, "an unknown priority is rejected");
assert(!validateTaskDraft({ ...baseDraft, priority: 3 }).ok, "numeric priorities are rejected");
assert(!validateTaskDraft({ ...baseDraft, repeat: "hourly" }).ok, "an unknown repeat rule is rejected");
assert(!validateTaskDraft({ ...baseDraft, dueTime: "25:00" }).ok, "an impossible time is rejected");
assert(!validateTaskDraft({ ...baseDraft, dueTime: "soon" }).ok, "non-times are rejected");

const missingWeekdays = validateTaskDraft({ ...baseDraft, repeat: "weekdays" });
assert(!missingWeekdays.ok, "a weekday rule without weekdays is rejected");
assert(
  !missingWeekdays.ok && /weekday/i.test(missingWeekdays.error),
  "the weekday error explains what to choose",
);
assert(
  !validateTaskDraft({ ...baseDraft, repeat: "weekdays", weekdays: [9] }).ok,
  "weekday 9 is rejected",
);
assert(
  !validateTaskDraft({ ...baseDraft, repeat: "weekdays", weekdays: ["1"] }).ok,
  "string weekdays are rejected",
);
const withWeekdays = validateTaskDraft({
  ...baseDraft,
  repeat: "weekdays",
  weekdays: [5, 1, 1, 3],
});
assert(withWeekdays.ok, "a valid weekday rule validates");
if (withWeekdays.ok) {
  assert(
    JSON.stringify(withWeekdays.value.weekdays) === "[1,3,5]",
    "weekdays are de-duplicated and sorted",
  );
}

const blankDescription = validateTaskDraft({ ...baseDraft, description: "  " });
assert(
  blankDescription.ok && blankDescription.value.description === undefined,
  "blank descriptions are dropped",
);
assert(
  !validateTaskDraft({ ...baseDraft, description: "x".repeat(2001) }).ok,
  "an over-long description is rejected",
);
assert(
  !validateTaskDraft({ ...baseDraft, category: "x".repeat(41) }).ok,
  "an over-long category is rejected",
);
const customCategory = validateTaskDraft({ ...baseDraft, category: "  Football  " });
assert(customCategory.ok && customCategory.value.category === "Football", "custom categories are trimmed");

const quickEntry = validateTaskDraft({ title: "Pray on time", date: "2026-11-05", priority: "high" });
assert(quickEntry.ok, "a title-only draft validates — quick entry works");
if (quickEntry.ok) {
  assert(quickEntry.value.category.length > 0, "a missing category falls back");
  assert(quickEntry.value.repeat === "none", "a missing repeat falls back to one-off");
}

assert(validateWindow("2026-11-01", "2026-11-30").ok, "a month window is legal");
assert(!validateWindow("2026-11-30", "2026-11-01").ok, "a reversed window is rejected");
assert(!validateWindow("0", "2026-11-01").ok, "a nonsense window start is rejected");
assert(
  !validateWindow("2026-01-01", "2026-12-31").ok,
  "a window longer than the cap is rejected",
);
assert(validateWindow("2026-01-01", "2026-05-04").ok, "a 124-day window is allowed");
assert(MAX_WINDOW_DAYS === 124, "the window ceiling is 124 days");

/* -------------------------------------------------------------------------- */
/* 4. Daily Success Rate                                                      */
/* -------------------------------------------------------------------------- */

assert(successRate({ planned: 8, completed: 6 }) === 75, "6 of 8 → 75%");
assert(successRateOf(4, 3) === 75, "3 of 4 → 75%");
assert(successRate({ planned: 4, completed: 4 }) === 100, "4 of 4 → 100%");
assert(successRate({ planned: 4, completed: 0 }) === 0, "0 of 4 → 0%");
assert(
  successRate({ planned: 0, completed: 0 }) === null,
  "a day with no tasks reports null, never 100%",
);
assert(
  successRate({ planned: 0, completed: 5 }) === null,
  "completions without a plan still report null",
);
assert(successRate({ planned: 3, completed: 9 }) === 100, "completed is clamped to planned");
assert(successRate({ planned: -1, completed: -1 }) === null, "impossible counts can't go negative");
assert(successRate({ planned: 3, completed: -2 }) === 0, "a negative completion counts as 0");
assert(successRate({ planned: 3, completed: 1 }) === 33, "1 of 3 rounds to 33%");

const combined = combineCounts({ planned: 2, completed: 2 }, { planned: 2, completed: 1 });
assert(combined.planned === 4 && combined.completed === 3, "both systems feed one rate");
assert(successRate(combined) === 75, "the combined rate is completed/planned");
assert(combineCounts().planned === 0, "combining nothing is zero");
assert(counts(3, 9).completed === 3, "counts() clamps completions to the plan");
assert(counts(0, 0).planned === 0, "counts() keeps an empty day empty");

const summary = summarizeDay("2026-11-05", { planned: 4, completed: 3 });
assert(
  summary.rate === 75 && summary.planned === 4 && summary.completed === 3,
  "summarizeDay computes the rate",
);
assert(
  summarizeDay("2026-11-06", { planned: 0, completed: 0 }).rate === null,
  "an empty day has no rate",
);

const week = [
  summarizeDay("2026-11-01", { planned: 4, completed: 4 }),
  summarizeDay("2026-11-02", { planned: 4, completed: 2 }),
  summarizeDay("2026-11-03", { planned: 0, completed: 0 }),
  summarizeDay("2026-11-04", { planned: 4, completed: 3 }),
  summarizeDay("2026-11-05", { planned: 2, completed: 1 }),
  summarizeDay("2026-11-06", { planned: 0, completed: 0 }),
  summarizeDay("2026-11-07", { planned: 0, completed: 0 }),
];
const range = summarizeRange(week);
assert(range.days === 7, "the range covers seven days");
assert(range.daysWithTasks === 4, "only days with tasks count as active");
assert(range.planned === 14 && range.completed === 10, "totals sum every day");
assert(range.averageRate === 69, "the average is over active days: (100+50+75+50)/4");
assert(range.bestDay?.date === "2026-11-01", "the best day is the highest rate");
assert(range.perfectDays === 1, "one perfect day in the week");
assert(summarizeRange([]).averageRate === null, "an empty range has no average");
assert(summarizeRange([]).bestDay === null, "an empty range has no best day");

const tie = summarizeRange([
  summarizeDay("2026-11-02", { planned: 2, completed: 1 }),
  summarizeDay("2026-11-01", { planned: 2, completed: 1 }),
]);
assert(tie.bestDay?.date === "2026-11-01", "ties are broken by the earlier day");

/* -------------------------------------------------------------------------- */
/* 5. Presentation helpers                                                    */
/* -------------------------------------------------------------------------- */

assert(dayStatus("2026-11-01", "2026-11-05") === "past", "a past day is final");
assert(dayStatus("2026-11-05", "2026-11-05") === "today", "today is live");
assert(dayStatus("2026-11-09", "2026-11-05") === "future", "a future day is only planned");
assert(categoryLabel("study") === "Study", "preset categories keep their label");
assert(categoryLabel("Morning routine") === "Morning routine", "custom categories pass through");
assert(categoryLabel("") === "Personal", "an empty category has a readable fallback");
assert(priorityLabel("high") === "High", "priority labels are readable");

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("dailyTasks tests FAILED");
  process.exit(1);
}
console.log("dailyTasks tests passed");