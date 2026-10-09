/**
 * Pure helpers shared by Ashy's Convex functions — and by local tests.
 *
 * Nothing here touches the network, the database or browser APIs, so the
 * same code runs inside the action ("use node"), inside the internal queries
 * (default runtime) and in a plain `bun` test script.
 */

import {
  calculateOverallProgress,
  calculateSubjectProgress,
  findFirstIncompleteItem,
  listRecentCompletions,
  type CompletionMap,
} from "../lib/student-os/progress";
import { SYLLABUS, getSubject } from "../lib/student-os/syllabus";
import type { Subject } from "../lib/student-os/types";

/* -------------------------------------------------------------------------- */
/* Types returned to the client                                               */
/* -------------------------------------------------------------------------- */

/** One real YouTube video found through the Data API (never invented). */
export interface VideoResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationLabel: string;
}

/** One web source from Google Search grounding. */
export interface GroundedSource {
  title: string;
  url: string;
  domain: string;
}

/* -------------------------------------------------------------------------- */
/* Video marker (Phase 3)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Gemini is asked to emit `[[video: "search query"]]` when the student wants a
 * video. The marker is stripped from the visible text and turned into a real
 * YouTube Data API search — Gemini never invents URLs itself.
 */
const VIDEO_MARKER = /\[\[\s*video\s*:\s*["“'`]?([^\]"\n]+?)["”'`]?\s*\]\]/gi;
const MAX_VIDEO_QUERIES = 3;
const MAX_QUERY_CHARS = 120;

/** Extracts marker queries and returns the text with markers removed. */
export function extractVideoQueries(text: string): {
  clean: string;
  queries: string[];
} {
  const queries: string[] = [];
  const clean = text.replace(VIDEO_MARKER, (_match, rawQuery: string) => {
    const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
    if (query && queries.length < MAX_VIDEO_QUERIES && !queries.includes(query)) {
      queries.push(query);
    }
    return "";
  });
  return {
    clean: clean
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    queries,
  };
}

/** Official YouTube video ids are exactly 11 URL-safe characters. */
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** `PT1H2M3S` → "1:02:03" (empty string when unparseable / no duration). */
export function formatIsoDuration(iso: string | undefined): string {
  if (!iso) return "";
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return "";
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (!hours && !minutes && !seconds) return "";
  const mm = hours ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/* -------------------------------------------------------------------------- */
/* Grounding metadata (Phase 4)                                               */
/* -------------------------------------------------------------------------- */

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}
interface GroundingSupport {
  segment?: { text?: string };
  groundingChunkIndices?: number[];
}
interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  webSearchQueries?: string[];
  searchEntryPoint?: { renderedContent?: string };
}

/** Accepts only real http(s) URLs and derives a display domain safely. */
export function safeSource(
  uri: string | undefined,
  title: string | undefined,
): GroundedSource | null {
  if (!uri) return null;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const domain = url.hostname.replace(/^www\./, "");
  const cleanTitle = (title ?? domain).replace(/\s+/g, " ").trim().slice(0, 160);
  return { title: cleanTitle || domain, url: url.href, domain };
}

/** Deduplicated sources + the queries Gemini actually ran. */
export function parseGroundingMetadata(metadata: unknown): {
  sources: GroundedSource[];
  searchQueries: string[];
  searchEntryPointUrl: string | null;
} {
  const meta = metadata as GroundingMetadata | undefined;
  const sources: GroundedSource[] = [];
  const seen = new Set<string>();
  for (const chunk of meta?.groundingChunks ?? []) {
    const source = safeSource(chunk.web?.uri, chunk.web?.title);
    if (source && !seen.has(source.url)) {
      seen.add(source.url);
      sources.push(source);
    }
    if (sources.length >= 12) break;
  }
  const searchQueries = (meta?.webSearchQueries ?? [])
    .map((query) => query.replace(/\s+/g, " ").trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 8);
  // Google's Search-suggestions entry point is rendered HTML; we only ever
  // extract its link target and render a plain anchor, never raw HTML.
  let searchEntryPointUrl: string | null = null;
  const html = meta?.searchEntryPoint?.renderedContent;
  if (html) {
    const match = /<a[^>]+href="([^"]+)"/i.exec(html);
    if (match) {
      const source = safeSource(match[1], undefined);
      searchEntryPointUrl = source?.url ?? null;
    }
  }
  return { sources, searchQueries, searchEntryPointUrl };
}

/* -------------------------------------------------------------------------- */
/* Progress summary (Phase 2)                                                 */
/* -------------------------------------------------------------------------- */

export interface CallerProgress {
  profile: Record<string, unknown> | null;
  completions: CompletionMap;
  stats: Record<string, unknown> | null;
  updatedAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function relativeDay(timestamp: number, now: number): string {
  const days = Math.floor((now - timestamp) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)}m`;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

/** 1st-paper subjects from the profile plus their 2nd-paper siblings. */
function trackedSubjects(subjectIds: string[]): Subject[] {
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

function subjectLine(subject: Subject, completions: CompletionMap): string {
  const summary = calculateSubjectProgress(subject, completions);
  return `${subject.name} (${subject.paper}): ${summary.percent}% — ${summary.completed}/${summary.total} items`;
}

/**
 * A compact, human-readable mirror of the student's own account data, built
 * server-side from the `users.progress` document. It is added to the system
 * context of a single request only — never stored in chat history and never
 * logged.
 */
export function buildProgressSummary(
  progress: CallerProgress | null,
  now = Date.now(),
): string {
  if (!progress) {
    return [
      "Student OS progress summary: not available — the student's account has never synced progress data.",
      "If they ask about progress, say it isn't tracked yet and suggest completing onboarding + ticking syllabus items.",
    ].join("\n");
  }

  const profile = progress.profile ?? {};
  const completions = progress.completions ?? {};
  const goal = typeof profile.goal === "string" ? profile.goal : "not set";
  const target = typeof profile.target === "string" ? profile.target : "not set";
  const exam = typeof profile.exam === "string" ? profile.exam : "not set";
  const level =
    typeof profile.educationLevel === "string" ? profile.educationLevel : "not set";
  const curriculum =
    typeof profile.curriculum === "string" ? profile.curriculum : "not set";
  const subjectIds = Array.isArray(profile.subjects)
    ? profile.subjects.filter((id): id is string => typeof id === "string")
    : [];

  const lines: string[] = [];
  lines.push(
    "Student OS progress summary (real data synced from this student's own account):",
  );
  lines.push(
    `- Profile: goal=${goal}; target=${target}; exam=${exam}; level=${level}; curriculum=${curriculum}.`,
  );

  if (subjectIds.length === 0) {
    lines.push("- Subjects: none selected yet (onboarding may be unfinished).");
  } else {
    lines.push(`- Tracking: ${subjectIds.join(", ")}.`);
  }

  const all = trackedSubjects(subjectIds);
  if (all.length > 0) {
    // The dashboard's headline number covers the tracked 1st-paper subjects.
    const firstPaper = all.filter((subject) => subject.paperKey === "1st");
    const overall = calculateOverallProgress(firstPaper, completions);
    lines.push(
      `- Overall completion (tracked 1st-paper subjects): ${overall.percent}% — ${overall.completed}/${overall.total} items.`,
    );
    lines.push("- Per subject and paper:");
    for (const subject of all) {
      lines.push(`  • ${subjectLine(subject, completions)}`);
    }

    const sorted = [...firstPaper].sort(
      (a, b) =>
        calculateSubjectProgress(b, completions).percent -
        calculateSubjectProgress(a, completions).percent,
    );
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];
    if (strongest && weakest && strongest.id !== weakest.id) {
      lines.push(
        `- Strongest: ${strongest.name} (${calculateSubjectProgress(strongest, completions).percent}%). Weakest: ${weakest.name} (${calculateSubjectProgress(weakest, completions).percent}%).`,
      );
    }

    const untouched = firstPaper.filter(
      (subject) => calculateSubjectProgress(subject, completions).completed === 0,
    );
    if (untouched.length > 0) {
      lines.push(
        `- Untouched subjects (0 items done): ${untouched.map((subject) => `${subject.name} (${subject.paper})`).join(", ")}.`,
      );
    }

    const next = findFirstIncompleteItem(firstPaper, completions);
    if (next) {
      const chapterLabel = next.chapter.title
        ? `ch. ${next.chapter.number} "${next.chapter.title}"`
        : `ch. ${next.chapter.number}`;
      lines.push(
        `- Next uncompleted topic in syllabus order: ${next.subject.name} ${chapterLabel}, item ${next.item.itemNumber}${next.item.title !== next.item.itemNumber ? ` (${next.item.title})` : ""} — a good next step toward the ${target} goal.`,
      );
    }
  }

  const recent = listRecentCompletions(completions, 8);
  if (recent.length > 0) {
    lines.push("- Recently completed (newest first):");
    for (const entry of recent) {
      lines.push(
        `  • ${entry.subject.name} ${entry.subject.paper} — ch. ${entry.chapter.number}, item ${entry.item.itemNumber} (${relativeDay(entry.completedAt, now)})`,
      );
    }
  } else {
    lines.push("- No syllabus items have been completed yet.");
  }

  const stats = progress.stats;
  if (stats && typeof stats === "object") {
    const num = (key: string): number | null =>
      typeof stats[key] === "number" ? (stats[key] as number) : null;
    const today = num("studySecondsToday");
    const week = num("studySecondsWeek");
    const total = num("studySecondsTotal");
    const streak = num("streakDays");
    if (today !== null && week !== null && total !== null) {
      lines.push(
        `- Study time: today ${formatHours(today)}; last 7 days ${formatHours(week)}; all time ${formatHours(total)}; streak: ${streak ?? 0} day(s).`,
      );
    }
  } else {
    lines.push(
      "- Study time and streak: not tracked on the account yet (the timer syncs them once used).",
    );
  }

  if (progress.updatedAt > 0) {
    lines.push(
      `- Last synced to the account: ${relativeDay(progress.updatedAt, now)}.`,
    );
  }

  const summary = lines.join("\n");
  // Hard guard: the whole point is a *compact* context addition.
  return summary.length > 6000 ? `${summary.slice(0, 6000)}\n[summary truncated]` : summary;
}
