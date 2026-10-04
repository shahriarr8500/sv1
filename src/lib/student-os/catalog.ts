/**
 * Catalog — resources, courses, guides, and sessions offered to students.
 *
 * Seed entries live here (data, never duplicated in UI); anything a customer
 * posts is stored through the workspace repository and merged on read.
 */

export type CatalogCategory = "Course" | "Tutoring" | "Guide" | "Past Papers";

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  "Course",
  "Tutoring",
  "Guide",
  "Past Papers",
];

export interface CatalogItem {
  id: string;
  title: string;
  category: CatalogCategory;
  /** One-line pitch shown on cards and at the top of the detail page. */
  summary: string;
  description: string;
  provider: string;
  /** Price in taka; 0 means free. */
  price: number;
  /** Bookable items require a date and time slot before checkout. */
  bookable: boolean;
  source: "seed" | "user";
  createdAt?: number;
  /** Optional image (URL or data URL) attached to customer posts. */
  image?: string;
  /** Optional outbound link attached to customer posts. */
  link?: string;
}

export function formatPrice(price: number): string {
  if (price <= 0) return "Free";
  return `৳${price.toLocaleString("en-US")}`;
}

export const SEED_CATALOG: CatalogItem[] = [
  {
    id: "seed-physics-intensive",
    title: "HSC Physics 1st Paper Intensive",
    category: "Course",
    summary:
      "A structured walkthrough of all ten chapters, organized the same way as your syllabus tracker.",
    description:
      "Work through the Physics 1st Paper syllabus chapter by chapter with clear explanations, worked examples, and checkpoints that line up item-for-item with your tracker. Complete the course and your revision plan is already done.",
    provider: "Student OS Faculty",
    price: 1500,
    bookable: false,
    source: "seed",
  },
  {
    id: "seed-chemistry-lab",
    title: "Chemistry Problem-Solving Lab",
    category: "Course",
    summary:
      "Weekly problem sets across the five chemistry chapters, with full solutions.",
    description:
      "A practice-first course covering Laboratory Safety through Working Chemistry. Every week you receive a problem set, a deadline, and a fully worked solution so you can see exactly where your method went wrong.",
    provider: "Student OS Faculty",
    price: 1200,
    bookable: false,
    source: "seed",
  },
  {
    id: "seed-admission-math",
    title: "Admission Mathematics Sprint",
    category: "Course",
    summary:
      "Targeted admission-style practice drawn from matrices, vectors, calculus, and combinatorics.",
    description:
      "A four-week sprint of timed admission questions, ranked by difficulty. Each set is mapped back to the Higher Mathematics chapters it comes from, so practice always points at a concrete gap in your syllabus.",
    provider: "Student OS Faculty",
    price: 900,
    bookable: false,
    source: "seed",
  },
  {
    id: "seed-physics-tutoring",
    title: "One-to-One Physics Tutoring",
    category: "Tutoring",
    summary:
      "A private hour with a Physics tutor, scheduled at a time that suits you.",
    description:
      "Book a full hour with a Physics tutor and bring the topics you are stuck on. Sessions are one-to-one, focused entirely on your questions, and scheduled around your study plan. Choose a date and time at checkout.",
    provider: "Student OS Tutors",
    price: 600,
    bookable: true,
    source: "seed",
  },
  {
    id: "seed-admission-clinic",
    title: "Admission Prep Clinic",
    category: "Tutoring",
    summary:
      "A focused one-to-one session on your weakest topics before the admission test.",
    description:
      "A private clinic built around a diagnostic review of your recent work. Your tutor targets the two or three topics costing you the most marks and leaves you with a short, prioritized revision list.",
    provider: "Student OS Tutors",
    price: 700,
    bookable: true,
    source: "seed",
  },
  {
    id: "seed-physics-past-papers",
    title: "HSC Physics Past Papers Pack",
    category: "Past Papers",
    summary:
      "Past papers with answer sheets, sorted by chapter so they fit your study plan.",
    description:
      "A curated set of Physics past papers with mark schemes, sorted chapter by chapter so you can practise exactly what you just studied — nothing more, nothing less.",
    provider: "Student OS Faculty",
    price: 0,
    bookable: false,
    source: "seed",
  },
  {
    id: "seed-math-guide",
    title: "Higher Mathematics Methods Guide",
    category: "Guide",
    summary:
      "Every method in the ten first-paper chapters, with worked steps and common pitfalls.",
    description:
      "A compact reference covering matrices, vectors, straight lines, circles, combinatorics, trigonometry, functions, differentiation, and integration — written as a checklist you can work through alongside your tracker.",
    provider: "Student OS Faculty",
    price: 0,
    bookable: false,
    source: "seed",
  },
  {
    id: "seed-bio-planner",
    title: "Biology Page-Range Study Planner",
    category: "Guide",
    summary:
      "A printable planner that matches the Biology page ranges in your tracker.",
    description:
      "The Biology syllabus broken into the exact page ranges you track, with space to note questions, revisions, and weak areas after each range is complete.",
    provider: "Student OS Faculty",
    price: 0,
    bookable: false,
    source: "seed",
  },
];
