/**
 * Deterministic study planner.
 *
 * Ashy used to let the LLM do arithmetic, which produced plans that
 * contradicted themselves. This module does all of it in plain TypeScript:
 * it reads the student's REAL syllabus (subject → paper → chapter → item,
 * with done/not-done from the completion map) and computes a plan whose
 * numbers always reconcile. Gemini only explains the result — it never
 * computes, rounds or invents anything that comes out of here.
 *
 * Everything is pure: no network, no database, no Date.now() unless passed
 * in. The same code runs in the Convex action and in `bun` test scripts.
 */

import { calculateOverallProgress, isItemCompleted, type CompletionMap } from "./progress";
import type { Chapter, StudyItem, Subject } from "./types";

/* -------------------------------------------------------------------------- */
/* Inputs / outputs                                                            */
/* -------------------------------------------------------------------------- */

export interface PlannerInput {
  /** The student's real tracked subjects (1st + 2nd paper siblings included). */
  subjects: Subject[];
  completions: CompletionMap;
  /** Epoch ms. Plans always start "today" unless a start date is given. */
  startDate?: number;
  /** End of the study window (e.g. exam day). Either endDate or months. */
  endDate?: number;
  /** Number of months from startDate when no endDate is known. */
  months?: number;
  /** Study minutes on a normal weekday (default 120). */
  weekdayMinutes?: number;
  /** Study minutes on a weekend day (default = weekdayMinutes). */
  weekendMinutes?: number;
  /** Rest days per week (default 1 → 6 study days). */
  restDaysPerWeek?: number;
  /** Fraction of the window reserved for revision at the end (default 0.2). */
  revisionBufferFraction?: number;
  /**
   * Minutes needed per syllabus item. When omitted, the planner derives an
   * ESTIMATE from the student's own history (measuredMinutesPerItem) if
   * there is enough of it, else falls back to 45.
   */
  minutesPerItem?: number;
  /** How many subjects run in parallel each week for variety (default 3). */
  parallelSubjects?: number;
  /** Synced timer stats (studySecondsTotal) for measured pace. */
  stats?: { studySecondsTotal?: number } | null;
  /** Today, when the caller already has it (avoids a second Date.now()). */
  now?: number;
}

export interface ScheduleBlock {
  /** e.g. "Physics 1st Paper" — real names only, never invented. */
  subjectName: string;
  paper: string;
  chapterLabel: string;
  /** e.g. "items 1.14–1.20" or "item 3.2" (real item numbers from the DB). */
  itemRange: string;
  itemCount: number;
  /** Real syllabus item ids in this block (for one-click mission creation). */
  itemIds: string[];
}

/** Every item id scheduled in a study week, in order. */
export function weekItemIds(week: StudyWeek): string[] {
  return week.blocks.flatMap((b) => b.itemIds);
}

export interface StudyWeek {
  week: number;
  startDate: string; // ISO date (yyyy-mm-dd)
  items: number;
  minutes: number;
  blocks: ScheduleBlock[];
  /** Overall syllabus % projected after this week's items are done. */
  projectedPercent: number;
  kind: "study" | "revision";
}

export interface MonthlyMilestone {
  month: number;
  label: string; // e.g. "Month 1 (by Nov 8)"
  projectedPercent: number;
  itemsScheduled: number;
}

export interface PlannerOption {
  label: string;
  detail: string;
}

export interface MeasuredPace {
  /** Items completed per distinct active day. */
  itemsPerActiveDay: number;
  /** Average study minutes per active day (from the timer, when tracked). */
  minutesPerActiveDay: number | null;
  /** ESTIMATED minutes per item from the student's own data. */
  minutesPerItem: number | null;
  completionsUsed: number;
  activeDaysUsed: number;
}

export interface PlannerResult {
  verdict: "fits" | "tight" | "does not fit";
  /** Human sentence with the exact numbers behind the verdict. */
  verdictDetail: string;

  totalItems: number;
  completedItems: number;
  remainingItems: number;
  startPercent: number;
  endPercent: number;

  availableMinutes: number;
  requiredMinutes: number;
  minutesPerItem: number;
  /** Where minutesPerItem came from: "given" | "measured" | "default". */
  minutesPerItemSource: "given" | "measured" | "default";

  studyWeeks: number;
  revisionWeeks: number;
  totalWeeks: number;
  studyDaysPerWeek: number;
  minutesPerWeekday: number;
  minutesPerWeekendDay: number;
  /** Total study minutes available per week (after rest days). */
  minutesPerWeek: number;
  itemsPerWeek: number;
  itemsPerDay: number;

  /** Week-by-week schedule using REAL chapter and item names. */
  weeks: StudyWeek[];
  /** Study weeks only (revision weeks excluded) — the schedule body. */
  studySchedule: StudyWeek[];
  revisionWeeksList: StudyWeek[];
  milestones: MonthlyMilestone[];

  /** Present when the plan does not fit (or is tight): concrete options. */
  options: PlannerOption[];

  /** The single next thing to do — first remaining item in syllabus order. */
  nextUp: { subjectName: string; paper: string; chapterLabel: string; itemNumber: string; itemId: string } | null;

  measuredPace: MeasuredPace | null;
  assumptions: string[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MS_PER_MIN = 60 * 1000;
const AVG_MONTH_DAYS = 30.4375;

export function chapterLabel(chapter: Chapter): string {
  return chapter.title
    ? `Ch. ${chapter.number} — ${chapter.title}`
    : `Ch. ${chapter.number}`;
}

function itemLabel(item: StudyItem): string {
  return item.title !== item.itemNumber ? `${item.itemNumber} (${item.title})` : item.itemNumber;
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function clampMinutes(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* -------------------------------------------------------------------------- */
/* Measured pace from the student's own history                                */
/* -------------------------------------------------------------------------- */

/**
 * Derives a pace estimate from real data: items completed per active day,
 * average daily study minutes (when the timer has been used), and an
 * ESTIMATED minutes-per-item. Returns null when there is not enough history
 * to be honest about it (fewer than 5 completions or fewer than 3 days).
 */
export function measurePace(
  completions: CompletionMap,
  stats: { studySecondsTotal?: number } | null,
  now = Date.now(),
): MeasuredPace | null {
  const timestamps = Object.values(completions).filter(
    (t) => typeof t === "number" && t > 0 && t <= now + DAY_MS,
  );
  if (timestamps.length < 5) return null;

  const days = new Set(timestamps.map((t) => dateKey(t)));
  if (days.size < 3) return null;

  const itemsPerActiveDay = timestamps.length / days.size;
  const studySeconds = typeof stats?.studySecondsTotal === "number" ? stats.studySecondsTotal : null;
  const minutesPerActiveDay =
    studySeconds !== null && studySeconds > 0 ? studySeconds / 60 / days.size : null;

  // ESTIMATE only: total tracked study minutes / items completed. Meaningful
  // when the student has actually used the timer; otherwise null.
  const minutesPerItem =
    studySeconds !== null && studySeconds > 600
      ? clampMinutes(studySeconds / 60 / timestamps.length, 10, 240)
      : null;

  return {
    itemsPerActiveDay: Math.round(itemsPerActiveDay * 100) / 100,
    minutesPerActiveDay:
      minutesPerActiveDay !== null ? Math.round(minutesPerActiveDay) : null,
    minutesPerItem,
    completionsUsed: timestamps.length,
    activeDaysUsed: days.size,
  };
}

/* -------------------------------------------------------------------------- */
/* The planner                                                                 */
/* -------------------------------------------------------------------------- */

interface FlatItem {
  item: StudyItem;
  chapter: Chapter;
  subject: Subject;
}

export function computePlan(input: PlannerInput): PlannerResult {
  const now = input.now ?? Date.now();
  const assumptions: string[] = [];

  /* --- remaining work, from the REAL syllabus --------------------------- */
  const all: FlatItem[] = [];
  let completedItems = 0;
  for (const subject of input.subjects) {
    for (const chapter of subject.chapters) {
      for (const item of chapter.items) {
        if (isItemCompleted(item, input.completions)) completedItems += 1;
        else all.push({ item, chapter, subject });
      }
    }
  }
  const totalItems = completedItems + all.length;
  const remainingItems = all.length;
  const overall = calculateOverallProgress(input.subjects, input.completions);

  /* --- window ------------------------------------------------------------ */
  const startDate = input.startDate ?? now;
  let endMs: number;
  if (typeof input.endDate === "number" && input.endDate > startDate) {
    endMs = input.endDate;
  } else {
    const months = input.months && input.months > 0 ? input.months : 7;
    endMs = startDate + Math.round(months * AVG_MONTH_DAYS * DAY_MS);
    assumptions.push(
      `Deadline assumed as ${months} months from today (no exact exam date given).`,
    );
  }

  const totalDays = Math.max(7, Math.floor((endMs - startDate) / DAY_MS));
  const totalWeeks = Math.max(2, Math.floor(totalDays / 7));

  /* --- availability ------------------------------------------------------ */
  const restDaysPerWeek = clampMinutes(input.restDaysPerWeek ?? 1, 0, 6);
  const weekdayMinutes = clampMinutes(input.weekdayMinutes ?? 120, 15, 900);
  const weekendMinutes = clampMinutes(
    input.weekendMinutes ?? weekdayMinutes,
    15,
    1200,
  );
  const restOnWeekend = Math.min(2, restDaysPerWeek);
  const restOnWeekday = restDaysPerWeek - restOnWeekend;
  const studyDaysPerWeek = 7 - restDaysPerWeek;
  const minutesPerWeek = (5 - restOnWeekday) * weekdayMinutes + (2 - restOnWeekend) * weekendMinutes;

  /* --- revision buffer --------------------------------------------------- */
  const bufferFraction = Math.min(
    0.4,
    Math.max(0, input.revisionBufferFraction ?? 0.2),
  );
  let revisionWeeks = Math.max(1, Math.ceil(totalWeeks * bufferFraction));
  // Never let the buffer swallow the study time (or vice versa).
  let studyWeeks = totalWeeks - revisionWeeks;
  if (studyWeeks < 1) {
    studyWeeks = 1;
    revisionWeeks = totalWeeks - 1;
  }

  /* --- minutes per item -------------------------------------------------- */
  const measured = measurePace(input.completions, input.stats ?? null, now);
  let minutesPerItem: number;
  let minutesPerItemSource: PlannerResult["minutesPerItemSource"];
  if (typeof input.minutesPerItem === "number" && input.minutesPerItem > 0) {
    minutesPerItem = clampMinutes(input.minutesPerItem, 10, 240);
    minutesPerItemSource = "given";
  } else if (measured?.minutesPerItem) {
    minutesPerItem = measured.minutesPerItem;
    minutesPerItemSource = "measured";
    assumptions.push(
      `Minutes per item (${minutesPerItem}) is an ESTIMATE from your own tracked history (${measured.completionsUsed} completions), not a guess.`,
    );
  } else {
    minutesPerItem = 45;
    minutesPerItemSource = "default";
    assumptions.push(
      "Minutes per item assumed at 45 (no tracked history yet to measure from).",
    );
  }

  /* --- capacity vs requirement ------------------------------------------- */
  const availableMinutes = studyWeeks * minutesPerWeek;
  const requiredMinutes = remainingItems * minutesPerItem;
  const utilization = availableMinutes > 0 ? requiredMinutes / availableMinutes : Infinity;

  const verdict: PlannerResult["verdict"] =
    utilization <= 0.9 ? "fits" : utilization <= 1 ? "tight" : "does not fit";

  /* --- options (always computed; surfaced when not comfortably fitting) -- */
  const options: PlannerOption[] = [];
  if (remainingItems > 0) {
    const excessMinutes = requiredMinutes - availableMinutes * 0.9;
    if (excessMinutes > 0 && studyWeeks > 0 && studyDaysPerWeek > 0) {
      const extraPerDay = Math.ceil(excessMinutes / (studyWeeks * studyDaysPerWeek) / 15) * 15;
      options.push({
        label: `+${extraPerDay} min/day`,
        detail: `Adds ${extraPerDay} minutes to each of your ${studyDaysPerWeek} study days (${Math.round((extraPerDay * studyWeeks * studyDaysPerWeek) / 60)} h total) and leaves a 10% safety margin.`,
      });
    }
    if (bufferFraction > 0.1) {
      const studyWeeks10 = Math.max(1, totalWeeks - Math.max(1, Math.ceil(totalWeeks * 0.1)));
      const capacity10 = studyWeeks10 * minutesPerWeek;
      if (requiredMinutes <= capacity10 * 0.9) {
        options.push({
          label: "Drop the revision buffer to 10%",
          detail: `Gives ${studyWeeks10} study weeks (instead of ${studyWeeks}) and ${Math.round(capacity10 / 60)} h — enough for ${Math.floor(capacity10 / minutesPerItem)} items at ${minutesPerItem} min each. Revision shrinks to ${totalWeeks - studyWeeks10} week(s).`,
        });
      }
    }
    if (minutesPerWeek > 0) {
      const weeksNeeded = Math.ceil(requiredMinutes / 0.9 / minutesPerWeek);
      const totalWeeksNeeded = weeksNeeded + Math.max(1, Math.ceil(weeksNeeded * (bufferFraction / Math.max(0.01, 1 - bufferFraction))));
      const monthsNeeded = Math.ceil((totalWeeksNeeded * 7) / AVG_MONTH_DAYS * 2) / 2;
      const currentMonths = Math.round((totalWeeks * 7) / AVG_MONTH_DAYS * 2) / 2;
      if (monthsNeeded > currentMonths) {
        options.push({
          label: `Extend to ~${monthsNeeded} months`,
          detail: `At ${Math.round(minutesPerWeek / 60)} h/week and ${minutesPerItem} min/item, ${remainingItems} items need ${weeksNeeded} study weeks + revision. ${currentMonths} months is not enough; ~${monthsNeeded} months is.`,
        });
      }
    }
    options.push({
      label: "Prioritize high-weight chapters first",
      detail: "Cover the exam-weighted chapters before the long tail, then loop back. Tell me your exam's chapter weights and I'll reorder the plan around them.",
    });
  }

  /* --- schedule ----------------------------------------------------------- */
  const parallel = Math.min(
    Math.max(1, input.parallelSubjects ?? 3),
    Math.max(1, new Set(all.map((f) => f.subject.id)).size),
  );

  // Queues per subject, in syllabus order.
  const queues = new Map<string, FlatItem[]>();
  const subjectOrder: Subject[] = [];
  for (const f of all) {
    if (!queues.has(f.subject.id)) {
      queues.set(f.subject.id, []);
      subjectOrder.push(f.subject);
    }
    queues.get(f.subject.id)!.push(f);
  }

  const weeks: StudyWeek[] = [];
  const remaining = [...all];
  let assigned = 0;
  let cursor = 0; // rotating subject pointer for variety

  for (let w = 0; w < studyWeeks && assigned < remainingItems; w += 1) {
    const cumulativeTarget = Math.round((remainingItems * (w + 1)) / studyWeeks);
    // Attempt this many items; the week records what was actually taken so
    // the schedule always reconciles with the remaining count.
    const attempt = Math.min(remainingItems - assigned, cumulativeTarget - assigned);
    const weekStart = startDate + w * WEEK_MS;

    // Pick up to `parallel` subjects that still have items, rotating.
    const active: Subject[] = [];
    for (let i = 0; i < subjectOrder.length && active.length < parallel; i += 1) {
      const subject = subjectOrder[(cursor + i) % subjectOrder.length];
      if ((queues.get(subject.id)?.length ?? 0) > 0 && !active.includes(subject)) {
        active.push(subject);
      }
    }
    cursor = (cursor + parallel) % Math.max(1, subjectOrder.length);

    // Split the week's quota as evenly as possible across active subjects.
    const perSubject = Math.floor(attempt / Math.max(1, active.length));
    let leftover = attempt - perSubject * active.length;

    interface MutableBlock {
      subjectName: string;
      paper: string;
      chapterLabel: string;
      firstNumber: string;
      lastNumber: string;
      count: number;
      itemIds: string[];
    }
    const mutableBlocks: MutableBlock[] = [];

    for (const subject of active) {
      if (assigned >= remainingItems) break;
      const take = perSubject + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover -= 1;
      const queue = queues.get(subject.id)!;
      const taken = queue.splice(0, Math.min(take, queue.length));
      if (taken.length === 0) continue;
      assigned += taken.length;

      // Merge consecutive items of the same chapter into one block.
      let block: MutableBlock | null = null;
      for (const f of taken) {
        if (
          block &&
          block.subjectName === f.subject.name &&
          block.chapterLabel === chapterLabel(f.chapter)
        ) {
          block.lastNumber = f.item.itemNumber;
          block.count += 1;
          block.itemIds.push(f.item.id);
        } else {
          block = {
            subjectName: f.subject.name,
            paper: f.subject.paper,
            chapterLabel: chapterLabel(f.chapter),
            firstNumber: f.item.itemNumber,
            lastNumber: f.item.itemNumber,
            count: 1,
            itemIds: [f.item.id],
          };
          mutableBlocks.push(block);
        }
      }
    }

    // `itemRange` uses only real item numbers. A single item reads
    // "item 1.14"; a run reads "items 1.14 → 1.20" (the arrow keeps Biology's
    // page-range labels like "31–40" unambiguous).
    const blocks: ScheduleBlock[] = mutableBlocks.map((b) => ({
      subjectName: b.subjectName,
      paper: b.paper,
      chapterLabel: b.chapterLabel,
      itemRange:
        b.count === 1
          ? `item ${b.firstNumber}`
          : `items ${b.firstNumber} → ${b.lastNumber}`,
      itemCount: b.count,
      itemIds: b.itemIds,
    }));

    const actual = blocks.reduce((sum, b) => sum + b.itemCount, 0);
    weeks.push({
      week: w + 1,
      startDate: dateKey(weekStart),
      items: actual,
      minutes: actual * minutesPerItem,
      blocks,
      projectedPercent:
        totalItems === 0 ? 100 : Math.round(((completedItems + assigned) / totalItems) * 100),
      kind: "study",
    });
  }

  // Any remainder (e.g. rounding across the final weeks) goes into the last
  // study week so the schedule always sums to exactly the remaining items.
  if (assigned < remainingItems && weeks.length > 0) {
    const last = weeks[weeks.length - 1];
    last.items += remainingItems - assigned;
    last.minutes += (remainingItems - assigned) * minutesPerItem;
    last.projectedPercent =
      totalItems === 0 ? 100 : Math.round(((completedItems + remainingItems) / totalItems) * 100);
    assigned = remainingItems;
  }

  // Revision block at the end.
  const revisionWeeksList: StudyWeek[] = [];
  for (let r = 0; r < revisionWeeks; r += 1) {
    const idx = weeks.length + r;
    revisionWeeksList.push({
      week: idx + 1,
      startDate: dateKey(startDate + idx * WEEK_MS),
      items: 0,
      minutes: minutesPerWeek,
      blocks: [],
      projectedPercent: 100,
      kind: "revision",
    });
  }
  weeks.push(...revisionWeeksList);

  /* --- monthly milestones -------------------------------------------------- */
  const milestones: MonthlyMilestone[] = [];
  const studyWeeksActual = weeks.filter((w) => w.kind === "study");
  let cumulativeItems = 0;
  const perMonth = 4;
  for (let m = 0; m * perMonth < studyWeeksActual.length; m += 1) {
    const slice = studyWeeksActual.slice(m * perMonth, (m + 1) * perMonth);
    if (slice.length === 0) break;
    cumulativeItems += slice.reduce((sum, w) => sum + w.items, 0);
    const lastWeekStart = new Date(slice[slice.length - 1].startDate + "T00:00:00").getTime();
    milestones.push({
      month: m + 1,
      label: `Month ${m + 1} (by ${shortDate(lastWeekStart + 6 * DAY_MS)})`,
      projectedPercent:
        totalItems === 0
          ? 100
          : Math.min(100, Math.round(((completedItems + cumulativeItems) / totalItems) * 100)),
      itemsScheduled: cumulativeItems,
    });
  }

  /* --- next up ------------------------------------------------------------- */
  const next = all[0];
  const nextUp = next
    ? {
        subjectName: next.subject.name,
        paper: next.subject.paper,
        chapterLabel: chapterLabel(next.chapter),
        itemNumber: itemLabel(next.item),
        itemId: next.item.id,
      }
    : null;

  /* --- verdict sentence ---------------------------------------------------- */
  const hoursAvailable = Math.round(availableMinutes / 60);
  const hoursRequired = Math.round(requiredMinutes / 60);
  const verdictDetail =
    remainingItems === 0
      ? "Every tracked syllabus item is already complete — nothing left to schedule."
      : verdict === "fits"
        ? `${remainingItems} items remain (of ${totalItems}). At ${minutesPerItem} min/item that's ${hoursRequired} h of work, and you have ${hoursAvailable} h of study time across ${studyWeeks} study weeks (${studyDaysPerWeek} days/week, ~${Math.round(minutesPerWeek / 60)} h/week) before a ${revisionWeeks}-week revision buffer. That uses ${Math.round(utilization * 100)}% of your time — it fits with margin.`
        : verdict === "tight"
          ? `${remainingItems} items remain (of ${totalItems}). At ${minutesPerItem} min/item that's ${hoursRequired} h, and you have exactly ${hoursAvailable} h across ${studyWeeks} study weeks before a ${revisionWeeks}-week revision buffer. It fits at ${Math.round(utilization * 100)}% utilization — but one missed week breaks it. See the options below.`
          : `${remainingItems} items remain (of ${totalItems}). At ${minutesPerItem} min/item that's ${hoursRequired} h, but you only have ${hoursAvailable} h across ${studyWeeks} study weeks before a ${revisionWeeks}-week revision buffer. That's ${Math.round(utilization * 100)}% of your time — it does NOT fit as stated. Here's what would make it fit.`;

  return {
    verdict,
    verdictDetail,
    totalItems,
    completedItems,
    remainingItems,
    startPercent: overall.percent,
    endPercent: totalItems === 0 ? 100 : Math.round(((completedItems + remainingItems) / totalItems) * 100),
    availableMinutes,
    requiredMinutes,
    minutesPerItem,
    minutesPerItemSource,
    studyWeeks,
    revisionWeeks,
    totalWeeks,
    studyDaysPerWeek,
    minutesPerWeekday: weekdayMinutes,
    minutesPerWeekendDay: weekendMinutes,
    minutesPerWeek: minutesPerWeek,
    itemsPerWeek: studyWeeks > 0 ? Math.round((remainingItems / studyWeeks) * 10) / 10 : 0,
    itemsPerDay:
      studyWeeks > 0 && studyDaysPerWeek > 0
        ? Math.round((remainingItems / (studyWeeks * studyDaysPerWeek)) * 10) / 10
        : 0,
    weeks,
    studySchedule: studyWeeksActual,
    revisionWeeksList,
    milestones,
    options: verdict === "fits" ? [] : options,
    nextUp,
    measuredPace: measured,
    assumptions,
  };
}

