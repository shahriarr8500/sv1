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

/**
 * System instruction for handwritten-note transcription (Phase 2, "Read
 * handwritten notes"). Kept here — pure and testable — so the chat action
 * only injects it. The rules below are the product requirements in prompt
 * form: fidelity first, uncertainty marked, transcription kept separate
 * from explanation.
 */
export const TRANSCRIPTION_INSTRUCTION = `Handwritten-note transcription mode is ON for this message. Your job is to TRANSCRIBE the attached notes/image/PDF, not to solve or explain them.

Transcription rules (breaking any of them ruins the output):
1. Preserve the original meaning, structure and order exactly: headings, numbering, bullet nesting, lists, tables (as Markdown tables when clear), paragraph breaks and underlines/emphasis.
2. Recognize BOTH Bangla (বাংলা) and English, including mixed-language notes. Write each language in its own script — never transliterate Bangla into English letters or vice versa.
3. Preserve mathematical equations in LaTeX ($...$ inline, $$...$$ on display lines), scientific notation, chemical formulas with correct subscripts/superscripts and charges (e.g. $\\text{H}_2\\text{SO}_4$, $\\text{Cu}^{2+}$), units, symbols, Greek letters and significant figures as accurately as you can read them.
4. NEVER invent or guess missing content. Where the handwriting is illegible, ambiguous or cut off, mark it exactly as [unclear]. Prefer a short [unclear] marker over a plausible-sounding guess.
5. Preserve page references when the notes show them (e.g. "Page 47", "পৃষ্ঠা ৪৭") as a heading or margin note per section.
6. Keep handwriting errors as-is only when clearly intentional; otherwise transcribe the intended word and do not add commentary about it.

Output format:
- First output the transcription ONLY, under a "**Transcription**" heading.
- Do not add explanations, solutions, summaries or study advice before or inside the transcription.
- After the transcription you may add one short line: "Ask me to explain it, summarize it, make revision notes, or generate practice questions." — nothing more.

If nothing legible is attached, say so plainly and ask for a clearer photo instead of inventing notes.`;

/**
 * System instruction for answering questions grounded in an attached PDF
 * (Phase 2). Injected by the chat action whenever a document is in the
 * request — or when history merely references one by marker — so answers
 * about notes stay honest: cite the pages that were actually given, never
 * invent content, and separate the document's words from Ashy's own help.
 * Kept here — pure and testable — so the chat action only injects it.
 */
export const DOCUMENT_INSTRUCTION = `Documents (PDF notes and study material):
- When a document or its rendered pages are attached to a message, answer FROM THE DOCUMENT. The message tells you exactly which document and which pages are attached (e.g. "[Attached document: physics notes.pdf]" or "[Attached: Pages 3–5 of notes.pdf]").
- Cite the page number for anything you take from the document ("page 4 states…"), using the page identity given in the message. If the page number is not stated in the message, do NOT state one — say which document it came from instead.
- Separate the document's content from your own words: attribute content to the document ("the notes say…") and clearly mark anything that is your own explanation, extension or general knowledge. Never present your own wording as a quote from the document.
- NEVER invent text, page numbers, formulas, tables, diagrams or citations that are not in the document. Scanned pages and handwriting can be hard to read: if something is blurry, cut off or ambiguous, say which page it is on and ask for a clearer photo or crop instead of guessing.
- Bangla and English content are both supported, including mixed-language notes and handwriting. Keep each language in its own script (never transliterate one into the other) and preserve mathematics in LaTeX.
- When asked for a summary, explanation, revision notes, flashcards or practice questions about an attached document, build them strictly from the document's content, and say plainly when the document does not cover part of the request.
- If a question needs pages that are not attached and are not already covered earlier in this conversation, say so plainly and tell the student to open the document in the reader and use "Ask about page" or the page-range option — then offer to help with what IS in front of you. The file itself is NOT re-sent with every later message; never claim you cannot open files.`;

/* -------------------------------------------------------------------------- */
/* Interactive visual markers (Phase 3)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Structured parameters for an application-owned interactive visual.
 * These are the ONLY visualization shapes the app will render — every field
 * is validated here before it can reach a message row, and the client
 * re-validates before rendering. No AI-generated code is ever executed.
 */
export type ExploreSpec =
  | { type: "vectors"; ax: number; ay: number; bx: number; by: number }
  | { type: "graph"; expression: string };

/** Marker forms the model may emit (one per reply, like the video marker):
 *  `[[explore: vectors A=(3,4) B=(-1,2)]]`
 *  `[[explore: graph y=sin(x)+a]]`
 */
const EXPLORE_MARKER = /\[\[\s*explore\s*:\s*([^\]]{0,400})\]\]/i;
const EXPLORE_MARKER_GLOBAL = /\s*\[\[\s*explore\s*:\s*[^\]]{0,400}\]\]/gi;
const EXPLORE_NUM = "-?\\d+(?:\\.\\d+)?";
const EXPLORE_COMPONENT_CAP = 1000;

function boundedExploreNumber(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > EXPLORE_COMPONENT_CAP) return null;
  return value;
}

/** Parses one marker payload; null when malformed (caller strips it anyway). */
function parseExplorePayload(payload: string): ExploreSpec | null {
  const text = payload.trim();
  if (/^vectors\b/i.test(text)) {
    const match = new RegExp(
      `a\\s*=\\s*\\(\\s*(${EXPLORE_NUM})\\s*,\\s*(${EXPLORE_NUM})\\s*\\)\\s*` +
        `b\\s*=\\s*\\(\\s*(${EXPLORE_NUM})\\s*,\\s*(${EXPLORE_NUM})\\s*\\)`,
      "i",
    ).exec(text);
    if (!match) return null;
    const [ax, ay, bx, by] = [match[1], match[2], match[3], match[4]].map(
      boundedExploreNumber,
    );
    if (ax === null || ay === null || bx === null || by === null) return null;
    return { type: "vectors", ax, ay, bx, by };
  }
  if (/^graph\b/i.test(text)) {
    let expression = text.replace(/^graph\b/i, "").trim();
    // Tolerate the model writing the subject explicitly.
    expression = expression.replace(/^(?:y|f\(x\))\s*=\s*/i, "").trim();
    if (expression.length === 0 || expression.length > 160) return null;
    // Charset whitelist — lowercase names, digits, operators and dots only.
    if (!/^[a-z0-9+\-*/^().\s]+$/.test(expression)) return null;
    if (!/[a-z0-9]/.test(expression)) return null;
    return { type: "graph", expression };
  }
  return null;
}

/**
 * Extracts at most ONE `[[explore: …]]` marker from a model reply. Marker
 * lines are always stripped from the visible text; the structured spec is
 * returned only when every parameter passed validation — a malformed marker
 * silently degrades to a normal text answer, never to a broken widget.
 */
export function extractExploreMarker(text: string): {
  clean: string;
  explore: ExploreSpec | null;
} {
  let explore: ExploreSpec | null = null;
  const match = EXPLORE_MARKER.exec(text);
  if (match) {
    explore = parseExplorePayload(match[1] ?? "");
  }
  const clean = text
    .replace(EXPLORE_MARKER_GLOBAL, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { clean, explore };
}

/**
 * System instruction for offering interactive visuals. Kept here — pure and
 * testable — so the chat action only injects it.
 */
export const MATH_VISUALIZATION_INSTRUCTION = `Interactive visuals (opt-in markers):
- When a math explanation would genuinely benefit from manipulation — vector composition and resultants, or how a function's shape changes with a parameter — you MAY offer an interactive visual. Emit exactly ONE marker, on its own line, in one of these forms:
  [[explore: vectors A=(3,4) B=(-1,2)]]
  [[explore: graph y=a*sin(x)]]
- Vector parameters are finite component numbers (absolute value ≤ 1000). Graph expressions use the variable x plus optional parameters a, b, c, d; allowed functions are sin, cos, tan, asin, acos, atan, sqrt, abs, exp, ln, log, floor, ceil, round, with constants pi and e.
- The app renders the visual itself from application-owned components — the marker only carries validated numbers and a validated expression, never code.
- The written answer must stand alone: never rely on the visual to make your point, never emit a marker for a non-math answer, and never emit more than one marker. Malformed markers are silently dropped.`;

/* -------------------------------------------------------------------------- */
/* Lab tool markers (Phase 4)                                                 */
/* -------------------------------------------------------------------------- */

/** Physics simulations the app can open (whitelist — nothing else renders). */
export const LAB_SIM_KINDS = [
  "motion",
  "projectile",
  "forces",
  "waves",
  "circuits",
  "optics",
] as const;
export type LabSimKind = (typeof LAB_SIM_KINDS)[number];

/**
 * Structured parameters for an application-owned lab tool. The only text
 * that crosses the boundary is a bounded, charset-checked equation/formula/
 * molecule name — the client re-validates it and the lab's own parsers parse
 * it again before anything renders. Never code, never a URL, never free-form
 * instructions.
 */
export type LabSpec =
  | { type: "balance"; equation: string }
  | { type: "moles"; formula: string }
  | { type: "lewis"; formula: string }
  | { type: "molecule"; target: string }
  | { type: "sim"; kind: LabSimKind }
  | { type: "equilibrium" };

/** Marker forms the model may emit (at most one per reply):
 *  `[[lab: balance Fe + O2 -> Fe2O3]]`
 *  `[[lab: moles C6H12O6]]`
 *  `[[lab: lewis CO3^2-]]`
 *  `[[lab: molecule water]]`
 *  `[[lab: sim projectile]]`
 *  `[[lab: equilibrium]]`
 */
const LAB_MARKER = /\[\[\s*lab\s*:\s*([^\n]{0,400}?)\]\]/i;
const LAB_MARKER_GLOBAL = /\s*\[\[\s*lab\s*:\s*[^\n]{0,400}?\]\]/gi;

/** Same arrow set the equation parser accepts (src/lib/lab/equation.ts). */
const LAB_ARROW = /(<=>|<->|-->|->|→|⇒|⇌|=)/;
const LAB_EQUATION_CHARSET = /^[A-Za-z0-9+\-*\/^()<>=\[\].\s→⇌⇒]+$/;
const LAB_FORMULA_CHARSET = /^[A-Za-z0-9+\-^().·]+$/;
const LAB_TARGET_CHARSET = /^[A-Za-z0-9()\- ]+$/;

/** Parses one `lab:` payload; null when malformed (caller strips it anyway). */
function parseLabPayload(payload: string): LabSpec | null {
  const text = payload.trim();
  const match = /^(balance|moles|lewis|molecule|sim|equilibrium)\b\s*([\s\S]*)$/i.exec(text);
  if (!match) return null;
  const tool = (match[1] ?? "").toLowerCase();
  const rest = (match[2] ?? "").trim();

  if (tool === "equilibrium") {
    // No parameters: the tool opens with its defaults and the student sets Kc.
    return rest === "" ? { type: "equilibrium" } : null;
  }

  if (tool === "sim") {
    const kind = rest.toLowerCase();
    return (LAB_SIM_KINDS as readonly string[]).includes(kind)
      ? { type: "sim", kind: kind as LabSimKind }
      : null;
  }

  if (tool === "balance") {
    // Mirrors MAX_EQUATION_LENGTH (300) in src/lib/lab/equation.ts.
    if (rest.length < 4 || rest.length > 300) return null;
    if (!LAB_EQUATION_CHARSET.test(rest)) return null;
    if (!LAB_ARROW.test(rest)) return null;
    return { type: "balance", equation: rest };
  }

  if (tool === "moles" || tool === "lewis") {
    // Mirrors MAX_FORMULA_LENGTH (120) in src/lib/lab/formula.ts.
    const compact = rest.replace(/\s+/g, "");
    if (compact.length === 0 || compact.length > 120) return null;
    if (!LAB_FORMULA_CHARSET.test(compact)) return null;
    return { type: tool, formula: compact };
  }

  // tool === "molecule": a bundled id, formula or name (client re-checks
  // the whitelist against structures.ts before rendering).
  if (rest.length === 0 || rest.length > 60) return null;
  if (!LAB_TARGET_CHARSET.test(rest)) return null;
  return { type: "molecule", target: rest };
}

/**
 * Extracts at most ONE `[[lab: …]]` marker from a model reply. The marker is
 * always stripped from the visible text; the structured spec is returned
 * only when every field passed validation — a malformed marker degrades to a
 * normal text answer, never to a broken tool, and never to executed code.
 */
export function extractLabMarker(text: string): {
  clean: string;
  lab: LabSpec | null;
} {
  let lab: LabSpec | null = null;
  const match = LAB_MARKER.exec(text);
  if (match) {
    lab = parseLabPayload(match[1] ?? "");
  }
  const clean = text
    .replace(LAB_MARKER_GLOBAL, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { clean, lab };
}

/**
 * System instruction for offering the lab tools. Kept here — pure and
 * testable — so the chat action only injects it.
 */
export const LAB_TOOL_INSTRUCTION = `Lab tools (opt-in markers):
- When a physics or chemistry question would genuinely benefit from an interactive tool you MAY emit exactly ONE lab marker, on its own line, picking the single best fit:
  [[lab: balance <equation>]] — a full chemical equation to balance (include an arrow: ->, →, ⇌ or =)
  [[lab: moles <formula>]] — a molar mass / moles / concentration calculation
  [[lab: lewis <formula>]] — a main-group species (≤ 16 atoms) whose electron pairs or shape matters
  [[lab: molecule <name or formula>]] — a small bundled molecule whose 3D shape helps (water, methane, CO2, …)
  [[lab: sim <motion|projectile|forces|waves|circuits|optics>]] — a physics situation a simulation would clarify
  [[lab: equilibrium]] — a Kc / ICE-table problem
- The app opens its own lab tool from application-owned components; the marker only carries a whitelisted kind plus bounded validated text (equation/formula/molecule name), never code, never a URL.
- Emit at most ONE marker of any kind per reply (a lab marker OR an explore visual, never both), only when the tool adds real value, and never for general writing, history or coding answers. The written answer must stand alone without the tool. Malformed markers are silently dropped.`;
