/**
 * PCMB 1st Paper syllabus — the single source of truth.
 *
 * Structure: Subject → Chapter → Study Item.
 * Every numbered item is individually trackable. Topic names are never
 * invented: where the dataset has no titles, items display their number
 * (or page range) only.
 */

import type {
  Chapter,
  ItemLocation,
  PaperKey,
  StudyItem,
  Subject,
} from "./types";

/** Default tracked subjects for the HSC PCMB setup. */
export const PCMB_SUBJECT_IDS = ["physics", "chemistry", "mathematics", "biology"];

/** Physics — item counts per chapter: 1.1–1.15 … 10.1–10.22. */
const PHYSICS_CHAPTER_ITEM_COUNTS = [15, 12, 12, 25, 17, 13, 24, 12, 26, 22];

const CHEMISTRY_CHAPTERS = [
  { title: "Laboratory Safety", itemCount: 14 },
  { title: "Qualitative Chemistry", itemCount: 20 },
  { title: "Periodic Properties & Chemical Bonding", itemCount: 21 },
  { title: "Chemical Changes", itemCount: 22 },
  { title: "Working / Applied Chemistry", itemCount: 21 },
];

const HIGHER_MATH_CHAPTER_TITLES = [
  "Matrices & Determinants",
  "Vectors",
  "Straight Lines",
  "Circles",
  "Permutations & Combinations",
  "Trigonometric Ratios",
  "Compound Angles Trigonometric Ratios",
  "Functions & Graphs",
  "Differentiation",
  "Integration",
];

/** Biology — page ranges per chapter. Labels are derived; no topic names invented. */
const BIOLOGY_CHAPTER_PAGE_RANGES: Array<Array<[number, number]>> = [
  [
    [1, 10],
    [11, 20],
    [21, 30],
    [31, 40],
    [41, 50],
    [51, 60],
    [61, 70],
    [71, 78],
  ],
  [
    [79, 88],
    [89, 98],
    [99, 101],
  ],
  [
    [102, 111],
    [112, 121],
    [122, 131],
    [132, 141],
    [142, 146],
  ],
  [
    [147, 156],
    [157, 166],
    [167, 176],
    [177, 186],
    [187, 195],
  ],
  [
    [196, 205],
    [206, 215],
    [216, 225],
  ],
  [
    [226, 235],
    [236, 238],
  ],
  [
    [239, 248],
    [249, 256],
    [257, 267],
  ],
  [
    [268, 277],
    [278, 287],
    [288, 292],
  ],
  [
    [293, 302],
    [303, 312],
    [313, 322],
    [323, 332],
    [333, 342],
    [343, 352],
    [353, 354],
  ],
  [
    [355, 364],
    [365, 374],
    [375, 376],
  ],
  [
    [377, 386],
    [387, 396],
    [397, 406],
    [407, 412],
  ],
  [
    [413, 422],
    [423, 432],
    [433, 442],
    [443, 452],
    [453, 462],
    [463, 463],
  ],
];

function chapterId(subjectId: string, number: number): string {
  return `${subjectId}-ch${number}`;
}

/** Numbered items, e.g. "1.1" … "1.15" (Physics / Chemistry). */
function numberedItems(
  subjectId: string,
  chId: string,
  chapterNumber: number,
  count: number,
): StudyItem[] {
  const items: StudyItem[] = [];
  for (let n = 1; n <= count; n++) {
    const itemNumber = `${chapterNumber}.${n}`;
    items.push({
      id: `${chId}-${itemNumber}`,
      subjectId,
      chapterId: chId,
      itemNumber,
      title: itemNumber,
    });
  }
  return items;
}

/** Chapter-level tracking: one item per chapter, titled by the chapter topic (Higher Mathematics). */
function chapterLevelItems(subjectId: string, chId: string, number: number, title: string): StudyItem[] {
  const itemNumber = String(number);
  return [
    {
      id: `${chId}-${itemNumber}`,
      subjectId,
      chapterId: chId,
      itemNumber,
      title,
    },
  ];
}

/** Page-range items, e.g. "31–40" (Biology). */
function pageRangeItems(
  subjectId: string,
  chId: string,
  ranges: Array<[number, number]>,
): StudyItem[] {
  return ranges.map(([from, to]) => ({
    id: `${chId}-p${from}-${to}`,
    subjectId,
    chapterId: chId,
    itemNumber: from === to ? String(from) : `${from}–${to}`,
    title: from === to ? String(from) : `${from}–${to}`,
  }));
}

function finalizeSubject(
  id: string,
  name: string,
  paper: string,
  chapters: Chapter[],
): Subject {
  const paperKey: PaperKey = paper === "2nd Paper" ? "2nd" : "1st";
  return {
    id,
    subjectKey: paperKey === "2nd" ? id.replace(/-2nd$/, "") : id,
    paperKey,
    name,
    paper,
    chapters,
    totalItems: chapters.reduce((sum, chapter) => sum + chapter.items.length, 0),
  };
}

function buildPhysics(): Subject {
  const chapters = PHYSICS_CHAPTER_ITEM_COUNTS.map((count, index) => {
    const number = index + 1;
    const chId = chapterId("physics", number);
    return {
      id: chId,
      subjectId: "physics",
      number,
      items: numberedItems("physics", chId, number, count),
    };
  });
  return finalizeSubject("physics", "Physics", "1st Paper", chapters);
}

function buildChemistry(): Subject {
  const chapters = CHEMISTRY_CHAPTERS.map((entry, index) => {
    const number = index + 1;
    const chId = chapterId("chemistry", number);
    return {
      id: chId,
      subjectId: "chemistry",
      number,
      title: entry.title,
      items: numberedItems("chemistry", chId, number, entry.itemCount),
    };
  });
  return finalizeSubject("chemistry", "Chemistry", "1st Paper", chapters);
}

function buildHigherMathematics(): Subject {
  const chapters = HIGHER_MATH_CHAPTER_TITLES.map((title, index) => {
    const number = index + 1;
    const chId = chapterId("mathematics", number);
    return {
      id: chId,
      subjectId: "mathematics",
      number,
      title,
      items: chapterLevelItems("mathematics", chId, number, title),
    };
  });
  return finalizeSubject("mathematics", "Higher Mathematics", "1st Paper", chapters);
}

function buildBiology(): Subject {
  const chapters = BIOLOGY_CHAPTER_PAGE_RANGES.map((ranges, index) => {
    const number = index + 1;
    const chId = chapterId("biology", number);
    return {
      id: chId,
      subjectId: "biology",
      number,
      items: pageRangeItems("biology", chId, ranges),
    };
  });
  return finalizeSubject("biology", "Biology", "1st Paper", chapters);
}

/* -------------------------------------------------------------------------- */
/* PCMB 2nd Paper                                                            */
/* -------------------------------------------------------------------------- */

/** Physics 2nd Paper: item counts per chapter (11 chapters, 101 items). */
const PHYSICS_2ND_ITEM_COUNTS = [10, 18, 12, 11, 5, 13, 6, 9, 9, 5, 3];

/** Biology 2nd Paper: item counts per chapter (12 chapters). */
const BIOLOGY_2ND_ITEM_COUNTS = [3, 8, 9, 8, 8, 6, 9, 5, 8, 7, 9, 6];

/**
 * Chemistry 2nd Paper, exactly as supplied: chapter 2 is numbered 2.0-2.23
 * (2.0 is a real, trackable item) and chapter 5 is numbered 4.1-4.17 rather
 * than 5.1-5.17. Both are preserved verbatim.
 */
const CHEMISTRY_2ND_RANGES = [
  { start: 1, end: 23 },
  { start: 0, end: 23 },
  { start: 1, end: 19 },
  { start: 1, end: 19 },
  { start: 1, end: 17, numberOverride: 4 },
];

/** Items numbered across an explicit range, e.g. 2.0 through 2.23. */
function rangeItems(
  subjectId: string,
  chId: string,
  chapterNumber: number,
  from: number,
  to: number,
): StudyItem[] {
  const items: StudyItem[] = [];
  for (let n = from; n <= to; n++) {
    const itemNumber = `${chapterNumber}.${n}`;
    items.push({
      id: `${chId}-${itemNumber}`,
      subjectId,
      chapterId: chId,
      itemNumber,
      title: itemNumber,
    });
  }
  return items;
}

function buildPhysics2nd(): Subject {
  const subjectId = "physics-2nd";
  const chapters = PHYSICS_2ND_ITEM_COUNTS.map((count, index) => {
    const number = index + 1;
    const chId = chapterId(subjectId, number);
    return {
      id: chId,
      subjectId,
      number,
      items: numberedItems(subjectId, chId, number, count),
    };
  });
  return finalizeSubject(subjectId, "Physics", "2nd Paper", chapters);
}

function buildChemistry2nd(): Subject {
  const subjectId = "chemistry-2nd";
  const chapters = CHEMISTRY_2ND_RANGES.map((entry, index) => {
    const number = index + 1;
    const chId = chapterId(subjectId, number);
      return {
      id: chId,
      subjectId,
      number,
      items: rangeItems(
        subjectId,
        chId,
        entry.numberOverride ?? number,
             entry.start,
        entry.end,
      ),
    };
  });
  return finalizeSubject(subjectId, "Chemistry", "2nd Paper", chapters);
}

function buildHigherMathematics2nd(): Subject {
  const subjectId = "mathematics-2nd";
  // The supplied data gives chapter-level information only, so no chapter
  // names or subsection topics are invented: each chapter is one item.
  const chapters = HIGHER_MATH_CHAPTER_TITLES.map((_title, index) => {
    const number = index + 1;
    const chId = chapterId(subjectId, number);
    return {
      id: chId,
      subjectId,
      number,
      items: chapterLevelItems(subjectId, chId, number, String(number)),
    };
  });
  return finalizeSubject(
    subjectId,
    "Higher Mathematics",
    "2nd Paper",
    chapters,
  );
}

function buildBiology2nd(): Subject {
  const subjectId = "biology-2nd";
  const chapters = BIOLOGY_2ND_ITEM_COUNTS.map((count, index) => {
    const number = index + 1;
    const chId = chapterId(subjectId, number);
    return {
      id: chId,
      subjectId,
      number,
      items: numberedItems(subjectId, chId, number, count),
    };
  });
  return finalizeSubject(subjectId, "Biology", "2nd Paper", chapters);
}

/** The syllabus catalog. All subjects in the app come from this list. */
export const SYLLABUS: Subject[] = [
  buildPhysics(),
  buildChemistry(),
  buildHigherMathematics(),
  buildBiology(),
  buildPhysics2nd(),
  buildChemistry2nd(),
  buildHigherMathematics2nd(),
  buildBiology2nd(),
];

const SUBJECT_BY_ID = new Map(SYLLABUS.map((subject) => [subject.id, subject]));

const ITEM_INDEX = new Map<string, ItemLocation>();
for (const subject of SYLLABUS) {
  for (const chapter of subject.chapters) {
    for (const item of chapter.items) {
      ITEM_INDEX.set(item.id, { subject, chapter, item });
    }
  }
}

/**
 * The same subject in the requested paper (`physics` <-> `physics-2nd`).
 * Returns undefined when that paper has no version of the subject.
 */
export function getSiblingPaperSubject(
  subject: Subject,
  paperKey: PaperKey,
): Subject | undefined {
  return SYLLABUS.find(
    (candidate) =>
      candidate.subjectKey === subject.subjectKey &&
      candidate.paperKey === paperKey,
  );
}

export function getSubject(id: string | null | undefined): Subject | undefined {
  return id ? SUBJECT_BY_ID.get(id) : undefined;
}

export function getChapter(subject: Subject, id: string | null | undefined): Chapter | undefined {
  return id ? subject.chapters.find((chapter) => chapter.id === id) : undefined;
}

export function lookupItem(itemId: string): ItemLocation | undefined {
  return ITEM_INDEX.get(itemId);
}

/** Total trackable items across the whole catalog (for stats / previews). */
export const CATALOG_TOTAL_ITEMS = SYLLABUS.reduce(
  (sum, subject) => sum + subject.totalItems,
  0,
);