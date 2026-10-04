import { Atom, BookOpen, Dna, FlaskConical, Sigma, type LucideIcon } from "lucide-react";

/** Presentation-only icon mapping for syllabus subjects. */
const SUBJECT_ICONS: Record<string, LucideIcon> = {
  physics: Atom,
  chemistry: FlaskConical,
  mathematics: Sigma,
  biology: Dna,
};

export function iconForSubject(subjectId: string): LucideIcon {
  return SUBJECT_ICONS[subjectId] ?? BookOpen;
}
