/**
 * Student OS core data model.
 *
 * The syllabus lives entirely in `syllabus.ts` (data) and is consumed by
 * `progress.ts` (calculations) — UI components never hold syllabus data of
 * their own, so new subjects/papers can be added without touching the UI.
 */

/** A single trackable unit inside a chapter (numbered item, page range, or a whole chapter). */
export interface StudyItem {
  /** Stable unique id — used as the completion key and as a DOM anchor. */
  id: string;
  subjectId: string;
  chapterId: string;
  /** Item number as shown to the student, e.g. "1.4" or "31–40". */
  itemNumber: string;
  /** Display label. Never an invented topic name — falls back to the item number. */
  title: string;
}

export interface Chapter {
  id: string;
  subjectId: string;
  number: number;
  /** Topic title only when the dataset provides one; never invented. */
  title?: string;
  items: StudyItem[];
}

export interface ItemLocation {
  subject: Subject;
  chapter: Chapter;
  item: StudyItem;
}

export interface ProgressSummary {
  completed: number;
  total: number;
  /** Rounded to the nearest whole number, 0–100. */
  percent: number;
}

/** Everything onboarding captures. Changing it must never touch syllabus progress. */
export interface StudentProfile {
  goal: string;
  target: string;
  exam: string;
  educationLevel: string;
  curriculum: string;
  /** Ids of the subjects the student is tracking (subset of the syllabus catalog). */
  subjects: string[];
}

/** Which HSC paper a subject belongs to. */
export type PaperKey = "1st" | "2nd";

export interface Subject {
  /** Unique key within its paper: `physics` or `physics-2nd`. */
  id: string;
  /** Base key shared by both papers, e.g. `physics`. */
  subjectKey: string;
  paperKey: PaperKey;
  name: string;
  paper: string;
  chapters: Chapter[];
  /** Derived from chapters — never entered by hand. */
  totalItems: number;
}