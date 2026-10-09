/**
 * Ashy planning + video curation — deterministic helpers (no LLM math).
 *
 * Split out of `ashyShared.ts` to keep each module readable:
 *  - planning intent detection and free-text parameter extraction;
 *  - serialization of the deterministic plan for Gemini to EXPLAIN;
 *  - YouTube result curation (trusted channels, no Shorts/memes).
 *
 * Pure functions only: no network, no database. The Convex action and local
 * `bun` test scripts run the exact same code.
 */

import {
  computePlan,
  measurePace,
  weekItemIds,
  type PlannerInput,
  type PlannerResult,
} from "../lib/student-os/planner";
import { SYLLABUS, getSubject } from "../lib/student-os/syllabus";
import type { CompletionMap } from "../lib/student-os/progress";
import type { Subject } from "../lib/student-os/types";
import type { VideoResult } from "./ashyShared";

/* -------------------------------------------------------------------------- */
/* Planning intent + parameter extraction                                      */
/* -------------------------------------------------------------------------- */

/**
 * Detects study-planning asks: roadmaps, schedules, "how many chapters a
 * week", "finish in N months", "what should I study today/this week".
 * Deliberately broad on purpose words, narrow on length so a homework
 * question ("finish this sum") in a long message doesn't trigger the planner.
 */
const PLANNING_PATTERNS: RegExp[] = [
  /\b(roadmap|road\s?map|study\s+plan|study\s+schedule|study\s+timetable|time\s?table|weekly\s+plan|daily\s+plan|day\s+by\s+day)\b/i,
  /\b(plan|schedule|timetable|routine)\b.{0,40}\b(my|the|whole|entire|this|next|coming)\b/i,
  /\b(my|the|whole|entire)\b.{0,40}\b(syllabus|course|portion|chapters?)\b/i,
  /\bhow\s+many\s+(chapters?|topics?|units?|pages?|items?|exercises?)\b/i,
  /\b(finish|complete|cover|get\s+through|wrap\s+up)\b.{0,50}\b(syllabus|course|portion|chapters?|in\s+\d+)\b/i,
  /\b(in|within|over|across)\s+\d+(\.\d+)?\s*(months?|weeks?|days?|years?)\b/i,
  /\bwhat\s+(should|can|do)\s+i\s+(study|read|work\s+on)\b/i,
  /\b(today|tomorrow|this\s+week|next\s+week)\b.{0,30}\b(study|plan|schedule|read|revise)\b/i,
  /\b(study|plan|schedule|revise|read)\b.{0,30}\b(today|tomorrow|this\s+week|next\s+week)\b/i,
  /\b(fit|fits|fitting)\b.{0,30}\b(in|into)\b.{0,20}\b\d+(\.\d+)?\s*(months?|weeks?)\b/i,
];

export function isPlanningIntent(text: string): boolean {
  const t = text.trim();
  // Long messages are almost never a planning ask; keep the trigger tight.
  if (t.length === 0 || t.length > 400) return false;
  return PLANNING_PATTERNS.some((re) => re.test(t));
}

/** Clamp helper for parsed hours/months. */
function clampNumber(n: number, min: number, max: number): number | null {
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}/**
 * Parses planning inputs the student stated in free text: study hours on
 * weekdays and weekends, plus a deadline in months ("7 months", "12 weeks").
 * Every field is optional — the caller decides what still needs asking.
 *
 * Hours are found by anchoring a number to a marker word ("weekends 4h",
 * "4 hours on weekdays"). The gap between them can contain neither a period
 * nor another number, so "2 hours weekdays, 4 hours weekends" can never
 * cross-match, and minutes ("90 minutes") convert to hours.
 */
const HOUR_UNIT = "(?:hours?|hrs?|h|min(?:ute)?s?|m)";
const WEEKDAY_MARKER =
  "(?:\\bweekdays?|\\bschool\\s+days?|\\bmon(?:day)?|\\btue(?:sday)?|\\bwed(?:nesday)?|\\bthu(?:rsday)?)";
const WEEKEND_MARKER =
  "(?:\\bweekends?|\\bsaturdays?|\\bsundays?|\\bholidays?)";

function toHours(value: string, unit: string): number | null {
  const n = Number.parseFloat(value.replace(",", "."));
  const hours = unit.startsWith("m") ? n / 60 : n;
  return clampNumber(hours, 0.25, 24);
}

/** First number anchored to a marker occurrence, in either direction. */
function hoursInClause(clause: string, markerSource: string): number | null {
  const marker = new RegExp(markerSource, "gi");
  let match: RegExpExecArray | null;
  while ((match = marker.exec(clause)) !== null) {
    const before = clause.slice(Math.max(0, match.index - 32), match.index);
    const afterStart = match.index + match[0].length;
    const after = clause.slice(afterStart, afterStart + 32);
    // Number AFTER the marker: "weekends 4h".
    const afterMatch = new RegExp(
      `[^.\\n\\d]{0,20}(\\d+(?:[.,]\\d+)?)\\s*(${HOUR_UNIT})\\b`,
      "i",
    ).exec(after);
    if (afterMatch) {
      const h = toHours(afterMatch[1], afterMatch[2]);
      if (h !== null) return h;
    }
    // Number BEFORE the marker: "4 hours on weekdays".
    const beforeMatch = new RegExp(
      `(?:^|[^.\\n\\d])(\\d+(?:[.,]\\d+)?)\\s*(${HOUR_UNIT})\\b[^.\\n\\d]{0,20}$`,
      "i",
    ).exec(before);
    if (beforeMatch) {
      const h = toHours(beforeMatch[1], beforeMatch[2]);
      if (h !== null) return h;
    }
  }
  return null;
}

/**
 * Splits free text into clauses so "2 hours weekdays, 4 hours weekends" can
 * never cross-match: each marker only sees the numbers in its own clause
 * (commas / periods / semicolons / newlines / "and" / "plus" split).
 */
function clausesOf(text: string): string[] {
  return text.split(/[,.;:\n]|\s+and\s+|\s+plus\s+|\s+with\s+/i);
}

function hoursNearMarker(text: string, markerSource: string): number | null {
  for (const clause of clausesOf(text)) {
    const h = hoursInClause(clause, markerSource);
    if (h !== null) return h;
  }
  return null;
}

export function extractPlanParams(text: string): {
  weekdayHours: number | null;
  weekendHours: number | null;
  months: number | null;
} {
  const lower = text.toLowerCase();

  let weekdayHours = hoursNearMarker(lower, WEEKDAY_MARKER);
  let weekendHours = hoursNearMarker(lower, WEEKEND_MARKER);

  // A single daily number applies to both: "I study 3 hours a day".
  if (weekdayHours === null && weekendHours === null) {
    const perDay = new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*(${HOUR_UNIT})\\b[^.\\n\\d]{0,16}\\b(?:a|per)\\s+day\\b`,
      "i",
    ).exec(lower);
    if (perDay) {
      const h = toHours(perDay[1], perDay[2]);
      weekdayHours = h;
      weekendHours = h;
    }
  } else if (weekdayHours === null) {
    // Only weekend hours stated: "4 hours on weekends" — assume the same on
    // weekdays rather than silently defaulting to 120; the reply labels it.
    weekdayHours = weekendHours;
  } else if (weekendHours === null) {
    weekendHours = weekdayHours;
  }

  // Deadline: "7 months" → "12 weeks" → "60 days" (converted to months).
  // Week/day numbers only count when they look like a real span: "6 days a
  // week" or "3 weeks of revision" are rhythms, not deadlines.
  let months: number | null = null;
  const mo = /\b(\d+(?:[.,]\d+)?)\s*months?\b/i.exec(lower);
  const wk = /\b(\d+(?:[.,]\d+)?)\s*weeks?\b(?!\s*(?:a|per|each)\s+week)/i.exec(
    lower,
  );
  const dy = /\b(\d+(?:[.,]\d+)?)\s*days?\b(?!\s*(?:a|per|each)\s+(?:week|month))/i.exec(
    lower,
  );
  if (mo) {
    months = clampNumber(Number.parseFloat(mo[1].replace(",", ".")), 0.2, 60);
  } else if (wk && Number.parseFloat(wk[1].replace(",", ".")) >= 3) {
    months = clampNumber(Number.parseFloat(wk[1].replace(",", ".")) / 4.345, 0.2, 60);
  } else if (dy && Number.parseFloat(dy[1].replace(",", ".")) >= 21) {
    months = clampNumber(
      Number.parseFloat(dy[1].replace(",", ".")) / 30.4375,
      0.2,
      60,
    );
  }

  return { weekdayHours, weekendHours, months };
}

/** Pushback like "that's unrealistic" / "are you mad" — never just agree. */
export function isPushback(text: string): boolean {
  return /\b(unrealistic|impossible|too\s+much|no\s+way|are\s+you\s+(mad|crazy|serious)|this\s+is\s+(too|a\s+lot)|i\s+can'?t\s+do\s+(that|this)|be\s+realistic|that\s+won'?t\s+work|don'?t\s+have\s+that\s+much|cant\s+do\s+that)\b/i.test(
    text,
  );
}

/** Progress-report asks (never need web search). */
export function isProgressIntent(text: string): boolean {
  return /\b(progress|how am i doing|how'?s my|how much (have i|of the) (done|syllabus|course)|complet(?:ion|ed)|weakest|strongest|percent(?:age)? (of|done)|syllabus status)\b/i.test(
    text,
  );
}

/** Real item ids of the first study week — powers one-click mission creation. */
export function firstWeekItemIds(plan: PlannerResult): string[] {
  const week = plan.studySchedule[0];
  return week ? weekItemIds(week) : [];
}

/* -------------------------------------------------------------------------- */
/* Plan serialization for the model                                            */
/* -------------------------------------------------------------------------- */

/** 1st-paper subjects from the profile plus their 2nd-paper siblings. */
export function trackedSubjects(subjectIds: string[]): Subject[] {
  const selected = new Set(subjectIds);
  const subjects: Subject[] = [];
  for (const subject of SYLLABUS) {
    if (subject.paperKey !== "1st" || !selected.has(subject.id)) continue;
    subjects.push(subject);
    const second = getSubject(`${subject.id}-2nd`);
    if (second) subjects.push(second);
  }
  return subjects;
}

/**
 * Serializes the deterministic plan into a compact block handed to Gemini as
 * context. Every number and name was computed by `computePlan` from the
 * student's real syllabus — the model is instructed to explain it verbatim.
 */
export function formatPlanForModel(
  plan: PlannerResult,
  opts: { fullSchedule?: boolean } = {},
): string {
  const lines: string[] = [];
  lines.push(
    "STUDY PLAN (computed deterministically from the student's real syllabus — explain it, never recompute it):",
  );
  // A verbatim-copy block: models tend to re-derive weekly hours and totals.
  // These exact strings are the only arithmetic they may repeat.
  lines.push(
    `KEY NUMBERS (copy these EXACTLY, never re-derive them): remaining=${plan.remainingItems} of ${plan.totalItems} items; required=${Math.round(plan.requiredMinutes / 60)} h; available=${Math.round(plan.availableMinutes / 60)} h; load=${Math.round((plan.requiredMinutes / Math.max(1, plan.availableMinutes)) * 100)}% of time; ${Math.round(plan.minutesPerWeek / 60)} h/week (${plan.studyDaysPerWeek} study days: ${plan.minutesPerWeekday} min weekday, ${plan.minutesPerWeekendDay} min weekend day); ${plan.itemsPerWeek} items/week; ${plan.itemsPerDay} items/day; ${plan.studyWeeks} study weeks + ${plan.revisionWeeks} revision weeks; ${plan.minutesPerItem} min/item.`,
  );
  lines.push(`Verdict: ${plan.verdict}. ${plan.verdictDetail}`);
  lines.push(
    `Assumptions: start today; ${plan.studyWeeks} study weeks + ${plan.revisionWeeks} revision weeks (${plan.totalWeeks} total); ${plan.studyDaysPerWeek} study days/week; ${plan.minutesPerWeekday} min on weekdays, ${plan.minutesPerWeekendDay} min on weekend days; ${plan.minutesPerItem} min per item (source: ${plan.minutesPerItemSource}).`,
  );
  lines.push(
    `Workload: ${plan.remainingItems} of ${plan.totalItems} items remain (${plan.completedItems} done; ${plan.startPercent}% now → ${plan.endPercent}% projected). Required ${Math.round(plan.requiredMinutes / 60)} h vs available ${Math.round(plan.availableMinutes / 60)} h. Pace: ${plan.itemsPerWeek} items/week, ${plan.itemsPerDay} items/day.`,
  );
  if (plan.measuredPace) {
    lines.push(
      `Measured pace (ESTIMATE from their own history): ${plan.measuredPace.itemsPerActiveDay} items per active day across ${plan.measuredPace.activeDaysUsed} active days.`,
    );
  }
  for (const a of plan.assumptions) lines.push(`Assumption note: ${a}`);

  const weeksToShow = opts.fullSchedule
    ? plan.studySchedule
    : plan.studySchedule.slice(0, 4);
  lines.push("");
  lines.push(
    `WEEK BY WEEK (showing ${weeksToShow.length} of ${plan.studySchedule.length}):`,
  );
  for (const w of weeksToShow) {
    const blocks = w.blocks
      .map(
        (b) =>
          `${b.subjectName} (${b.paper}), ${b.chapterLabel}, ${b.itemRange} ≈ ${b.itemCount * plan.minutesPerItem} min`,
      )
      .join("; ");
    lines.push(
      `Week ${w.week}, starting ${w.startDate}: ${w.items} items (~${Math.round(w.minutes / 60)} h) — ${blocks || "revision only"}. Projected overall after this week: ${w.projectedPercent}%.`,
    );
  }
  if (!opts.fullSchedule && plan.studySchedule.length > weeksToShow.length) {
    lines.push(
      `[${plan.studySchedule.length - weeksToShow.length} more study weeks exist; the student can ask for the full week-by-week plan. Week totals reconcile to exactly ${plan.remainingItems} items — do not invent other numbers.]`,
    );
  }

  lines.push("");
  lines.push("MONTHLY MILESTONES:");
  for (const m of plan.milestones) {
    lines.push(
      `${m.label}: ${m.projectedPercent}% of the syllabus (${m.itemsScheduled} items scheduled).`,
    );
  }

  lines.push("");
  lines.push(
    `REVISION BLOCK: ${plan.revisionWeeks} weeks at the end (weeks ${plan.studyWeeks + 1}–${plan.totalWeeks}) — no new items, revision of everything covered.`,
  );

  if (plan.options.length > 0) {
    lines.push("");
    lines.push("IF IT DOES NOT FIT — computed options:");
    for (const o of plan.options) lines.push(`- ${o.label}: ${o.detail}`);
  }

  if (plan.nextUp) {
    lines.push("");
    lines.push(
      `NEXT UP (the single immediate action): ${plan.nextUp.subjectName} (${plan.nextUp.paper}), ${plan.nextUp.chapterLabel}, ${plan.nextUp.itemNumber}.`,
    );
  }

  const text = lines.join("\n");
  return text.length > 9000 ? `${text.slice(0, 9000)}\n[plan truncated]` : text;
}

/** Caller progress shape shared with ashyShared (kept structural). */
export interface PlanCallerProgress {
  profile: Record<string, unknown> | null;
  completions: CompletionMap;
  stats: Record<string, unknown> | null;
  updatedAt: number;
}

/**
 * Builds the deterministic plan for a caller from their synced progress.
 * Returns null when there is no progress data or no tracked subjects — the
 * planner never invents a syllabus.
 */
export function buildStudyPlan(
  progress: PlanCallerProgress | null,
  params: {
    months?: number | null;
    weekdayHours?: number | null;
    weekendHours?: number | null;
    fullSchedule?: boolean;
  },
  now = Date.now(),
): { plan: PlannerResult; text: string } | null {
  if (!progress) return null;
  const profile = progress.profile ?? {};
  const subjectIds = Array.isArray(profile.subjects)
    ? profile.subjects.filter((id): id is string => typeof id === "string")
    : [];
  const subjects = trackedSubjects(subjectIds);
  if (subjects.length === 0) return null;

  const stats =
    progress.stats && typeof progress.stats === "object"
      ? (progress.stats as { studySecondsTotal?: number })
      : null;
  const pace = measurePace(progress.completions, stats, now);
  const input: PlannerInput = {
    subjects,
    completions: progress.completions,
    months: params.months ?? undefined,
    weekdayMinutes:
      params.weekdayHours != null ? Math.round(params.weekdayHours * 60) : undefined,
    weekendMinutes:
      params.weekendHours != null ? Math.round(params.weekendHours * 60) : undefined,
    minutesPerItem: pace?.minutesPerItem ?? undefined,
    now,
  };
  const plan = computePlan(input);
  return { plan, text: formatPlanForModel(plan, { fullSchedule: params.fullSchedule }) };
}

/* -------------------------------------------------------------------------- */
/* YouTube result curation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Trusted educational channels for a Bangladeshi HSC / BUET-admission
 * student. EDIT THIS ARRAY to add or remove channels. Anything not listed
 * must still pass the topic-match and quality filters below.
 */
export const TRUSTED_YOUTUBE_CHANNELS: readonly string[] = [
  "Udvash Unmesh",
  "Udvash",
  "উদ্ভাস", // Udvash-Unmesh (Bangla-script channel name)
  "উন্মেষ",
  "10 Minute School",
  "Ten Minute School",
  "১০ মিনিট স্কুল", // 10 Minute School (Bangla)
  "Amader School",
  "আমাদের স্কুল",
  "ACS",
  "Academic & Career School",
  "Chaya Prakashani",
  "ছায়া প্রকাশনী",
  "Physics 247",
  "Khan Academy",
  "3Blue1Brown",
  "Professor Dave Explains",
  "Organic Chemistry Tutor",
  "CrashCourse",
  "MIT OpenCourseWare",
];

/** Titles that mark junk: memes, Shorts, roasts, clickbait. */
const JUNK_TITLE_PATTERN =
  /\b(meme|memes|funny|prank|roast|reaction|vlog|status|lyrics?|song|gaming|gameplay|unboxing|mukbang|clickbait|parody|troll|savage|destroyed|epic\s+fail|fail\s+compilation|shorts?\b|#shorts|tiktok|reels?|instagram)\b/i;

/** "Tips/tricks/hacks" listicles are not lectures. */
const TIPS_TITLE_PATTERN =
  /\b(\d+\s*(?:tips?|tricks?|hacks?|ways?|secrets?)|study\s+tips|exam\s+tips|how\s+to\s+(?:cheat|pass))\b/i;

const STOPWORDS = new Set([
  "the", "a", "an", "for", "and", "or", "of", "to", "in", "on", "with",
  "class", "lecture", "chapter", "lesson", "video", "hsc", "bangla",
  "english", "part", "paper", "2nd", "1st", "full", "complete", "course",
]);

/** Significant topic keywords from a query (unicode-safe for Bangla script). */
export function topicKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Parses "12:34" / "1:02:03" into seconds; 0 when unknown. */
export function durationLabelToSeconds(label: string): number {
  const parts = label.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.length === 0 || parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * Curates raw YouTube results before they ever reach the student:
 *  - drops Shorts / anything under 5 minutes (unless a short clip was asked
 *    for), memes, roasts, clickbait and "tips" listicles;
 *  - requires the title or channel to match the topic keywords;
 *  - prefers trusted channels and lecture-length videos.
 * Returns [] when nothing passes — the caller then shows the plain
 * "Search on YouTube" link instead of junk.
 */
export function curateVideoResults(
  videos: VideoResult[],
  query: string,
  opts: { allowShort?: boolean } = {},
): VideoResult[] {
  const keywords = topicKeywords(query);
  const trusted = TRUSTED_YOUTUBE_CHANNELS.map((c) => c.toLowerCase());
  const minSeconds = opts.allowShort ? 60 : 300;

  const scored: Array<{ video: VideoResult; score: number }> = [];
  for (const video of videos) {
    const title = video.title.toLowerCase();
    const channel = video.channel.toLowerCase();
    const seconds = durationLabelToSeconds(video.durationLabel);
    if (seconds === 0) continue; // unknown duration — cannot vouch for it
    if (seconds < minSeconds) continue;
    if (JUNK_TITLE_PATTERN.test(title) || TIPS_TITLE_PATTERN.test(title)) continue;

    const isTrusted = trusted.some((t) => channel.includes(t));
    const keywordHits = keywords.filter(
      (k) => title.includes(k) || channel.includes(k),
    ).length;
    // Topic match required unless the channel is on the trusted list.
    if (!isTrusted && keywords.length > 0 && keywordHits === 0) continue;

    let score = keywordHits * 2 + (isTrusted ? 4 : 0);
    if (seconds >= 600) score += 2; // lecture-length preferred
    if (seconds > 7200) score -= 2; // 2h+ compilations are rarely focused
    scored.push({ video, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.video);
}
