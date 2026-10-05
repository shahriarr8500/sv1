/** Presentation helpers shared by the dashboard, syllabus pages, and navigation. */

import { format, isToday, isYesterday } from "date-fns";
import { PCMB_SUBJECT_IDS } from "./syllabus";
import type {
  Chapter,
  ItemLocation,
  ProgressSummary,
  StudentProfile,
  StudyItem,
  Subject,
} from "./types";

/** "BUET" + "1st" → "BUET 1st". Built from the profile — never hardcoded. */
export function goalHeadline(
  profile: Pick<StudentProfile, "goal" | "target">,
): string {
  return [profile.goal.trim(), profile.target.trim()].filter(Boolean).join(" ");
}

/**
 * True when these subjects cover the full PCMB set, counting each subject once
 * regardless of how many papers are in view (both papers at once is still
 * PCMB, just twice over).
 */
function isPcmb(subjects: Subject[]): boolean {
  const keys = new Set(subjects.map((subject) => subject.subjectKey));
  return (
    keys.size === PCMB_SUBJECT_IDS.length &&
    PCMB_SUBJECT_IDS.every((id) => keys.has(id))
  );
}

/** "1st Paper", "2nd Paper", or "All Papers" for the papers in view. */
function paperScope(subjects: Subject[]): string {
  const keys = new Set(subjects.map((subject) => subject.paperKey));
  if (keys.size !== 1) return "All Papers";
  return subjects[0].paper;
}

/** Distinct subject names, so both papers of a subject read once, not twice. */
function subjectNames(subjects: Subject[]): string[] {
  return [...new Set(subjects.map((subject) => subject.name))];
}

/**
 * Label for the overall progress card, e.g. "PCMB 1st Paper" or
 * "PCMB · All Papers" when both papers are in view.
 */
export function syllabusLabel(subjects: Subject[]): string {
  if (subjects.length === 0) return "Syllabus";
  const scope = paperScope(subjects);
  const base = isPcmb(subjects) ? "PCMB" : subjectNames(subjects).join(" · ");
  return scope === "All Papers" ? `${base} · All Papers` : `${base} ${scope}`;
}

/** Short label used in sentences, e.g. "PCMB syllabus completed". */
export function syllabusShortLabel(subjects: Subject[]): string {
  if (isPcmb(subjects)) return "PCMB";
  return subjectNames(subjects).join(" · ");
}

/** "Chapter 1" or "Chapter 1 · Laboratory Safety". */
export function chapterLabel(chapter: Chapter): string {
  const base = `Chapter ${chapter.number}`;
  return chapter.title ? `${base} · ${chapter.title}` : base;
}

/** Chapter heading inside the chapter list ("Chapter 1 — Laboratory Safety"). */
export function chapterTitle(chapter: Chapter): string {
  return chapter.title ? `Chapter ${chapter.number} — ${chapter.title}` : `Chapter ${chapter.number}`;
}

/** Display label for a checklist item (item number unless the dataset has a real title). */
export function itemLabel(item: StudyItem): string {
  return item.title;
}

/** "Physics 1.1 completed" / "Higher Mathematics: Vectors completed". */
/**
 * Recent-progress label. Includes the paper because the same item number can
 * exist in both papers, e.g. "Physics 2nd Paper - 1.4 completed".
 */
export function formatCompletionText(location: ItemLocation): string {
  return `${location.subject.name} ${location.subject.paper} - ${itemLabel(
    location.item,
  )} completed`;
}

export function formatRelativeDay(timestamp: number): string {
  const date = new Date(timestamp);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMM yyyy");
}

/** "0 / 338" */
export function formatItemCount(summary: ProgressSummary): string {
  return `${summary.completed} / ${summary.total}`;
}

/** "2026-10-05" → "Sun 5 Oct 2026"; absent → "Self-paced". */
export function formatBookingDate(date?: string): string {
  if (!date) return "Self-paced";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, "EEE d MMM yyyy");
}

/** Route to an item's checklist, anchored on the item row. */
export function itemPath(location: ItemLocation): string {
  return `/syllabus/${location.subject.id}/${location.chapter.id}#${location.item.id}`;
}
