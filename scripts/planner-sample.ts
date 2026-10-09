/**
 * Planner sample case — runnable with `bun scripts/planner-sample.ts`.
 *
 * Case: 304 items remaining of 338 (the four tracked 1st-paper subjects:
 * Physics 178 + Chemistry 98 + Higher Mathematics 10 + Biology 52), 7 months,
 * 6 study days a week, 20% revision buffer.
 *
 * Verifies that the arithmetic reconciles: the week totals sum exactly to the
 * remaining items, and the schedule only uses real chapter/item names.
 */

import { SYLLABUS } from "../src/lib/student-os/syllabus";
import { computePlan } from "../src/lib/student-os/planner";
import type { CompletionMap } from "../src/lib/student-os/progress";

const TRACKED = ["physics", "chemistry", "mathematics", "biology"];
const subjects = SYLLABUS.filter((s) => TRACKED.includes(s.id));

// Mark the first 34 items complete (real ids) → 304 remaining of 338.
const completions: CompletionMap = {};
let done = 0;
outer: for (const subject of subjects) {
  for (const chapter of subject.chapters) {
    for (const item of chapter.items) {
      if (done >= 34) break outer;
      completions[item.id] = Date.now() - done * 3600_000;
      done += 1;
    }
  }
}

const plan = computePlan({
  subjects,
  completions,
  months: 7,
  weekdayMinutes: 120,
  weekendMinutes: 240,
  restDaysPerWeek: 1,
  revisionBufferFraction: 0.2,
});

const total = subjects.reduce((a, s) => a + s.totalItems, 0);
console.log("=== PLANNER SAMPLE CASE ===");
console.log(
  `Remaining: ${plan.remainingItems} of ${total} (completed ${plan.completedItems}) — start ${plan.startPercent}%, end ${plan.endPercent}%`,
);
console.log(`Verdict: ${plan.verdict.toUpperCase()} — ${plan.verdictDetail}`);
console.log(
  `Window: ${plan.totalWeeks} weeks (${plan.studyWeeks} study + ${plan.revisionWeeks} revision), ${plan.studyDaysPerWeek} study days/week, ${plan.minutesPerWeekday} min weekday / ${plan.minutesPerWeekendDay} min weekend`,
);
console.log(
  `Minutes/item: ${plan.minutesPerItem} (source: ${plan.minutesPerItemSource}) | required ${Math.round(plan.requiredMinutes / 60)} h vs available ${Math.round(plan.availableMinutes / 60)} h`,
);
console.log(`Pace: ${plan.itemsPerWeek} items/week, ${plan.itemsPerDay} items/day`);

const studyWeeks = plan.studySchedule;
const sumWeeks = studyWeeks.reduce((a, w) => a + w.items, 0);
console.log(
  `\nReconciliation: week totals sum = ${sumWeeks}, remaining = ${plan.remainingItems} → ${sumWeeks === plan.remainingItems ? "OK ✓" : "MISMATCH ✗"}`,
);

console.log("\n--- First 6 study weeks ---");
for (const w of studyWeeks.slice(0, 6)) {
  const blocks = w.blocks
    .map((b) => `${b.subjectName} ${b.paper}, ${b.chapterLabel}, ${b.itemRange} (${b.itemCount})`)
    .join(" | ");
  console.log(`Week ${w.week} (${w.startDate}): ${w.items} items — ${blocks} → ${w.projectedPercent}%`);
}
console.log(`... ${Math.max(0, studyWeeks.length - 6)} more study weeks ...`);
const lastWeek = studyWeeks[studyWeeks.length - 1];
if (lastWeek) {
  const blocks = lastWeek.blocks
    .map((b) => `${b.subjectName} ${b.paper}, ${b.chapterLabel}, ${b.itemRange} (${b.itemCount})`)
    .join(" | ");
  console.log(`Week ${lastWeek.week} (${lastWeek.startDate}): ${lastWeek.items} items — ${blocks} → ${lastWeek.projectedPercent}%`);
}

console.log("\n--- Monthly milestones ---");
for (const m of plan.milestones) {
  console.log(`${m.label}: ${m.projectedPercent}% (${m.itemsScheduled} items scheduled)`);
}

console.log(`\n--- Revision block: ${plan.revisionWeeksList.length} weeks ---`);
if (plan.revisionWeeksList[0]) {
  const first = plan.revisionWeeksList[0];
  const last = plan.revisionWeeksList[plan.revisionWeeksList.length - 1];
  console.log(`Weeks ${first.week}–${last.week}, from ${first.startDate} to ${last.startDate}`);
}

if (plan.nextUp) {
  console.log(
    `\nNext up: ${plan.nextUp.subjectName} ${plan.nextUp.paper}, ${plan.nextUp.chapterLabel}, ${plan.nextUp.itemNumber}`,
  );
}

if (plan.options.length > 0) {
  console.log("\n--- Options (verdict not 'fits') ---");
  for (const o of plan.options) console.log(`• ${o.label}: ${o.detail}`);
}

if (plan.assumptions.length > 0) {
  console.log("\n--- Assumptions ---");
  for (const a of plan.assumptions) console.log(`• ${a}`);
}

// Hard assertions — the arithmetic must reconcile.
if (sumWeeks !== plan.remainingItems) {
  console.error("FAIL: week totals do not sum to remaining items");
  process.exit(1);
}
const projectedFinal = studyWeeks[studyWeeks.length - 1]?.projectedPercent;
if (projectedFinal !== plan.endPercent) {
  console.error(`FAIL: final projected % (${projectedFinal}) !== end % (${plan.endPercent})`);
  process.exit(1);
}
if (!plan.verdict) {
  console.error("FAIL: no verdict");
  process.exit(1);
}
console.log("\nAll checks passed ✓");
