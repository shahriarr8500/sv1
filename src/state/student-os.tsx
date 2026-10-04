/**
 * Student OS state — one provider owns the profile + syllabus completions and
 * persists them through the storage repository. Every page reads the same
 * state, so checking an item updates chapter, subject, overall progress,
 * recent activity, and the dashboard instantly (no reloads).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  calculateOverallProgress,
  calculateSubjectProgress,
  type CompletionMap,
} from "@/lib/student-os/progress";
import { SYLLABUS } from "@/lib/student-os/syllabus";
import { repository, type StudentOSState } from "@/lib/student-os/storage";
import type { ProgressSummary, StudentProfile, Subject } from "@/lib/student-os/types";

interface StudentOSContextValue {
  profile: StudentProfile | null;
  completions: CompletionMap;
  /** Used by onboarding (first save) and Settings → Goal (edits). */
  saveProfile: (profile: StudentProfile) => void;
  /** Check an item on or off; timestamp is recorded or cleared accordingly. */
  toggleItem: (itemId: string, completed: boolean) => void;
}

const StudentOSContext = createContext<StudentOSContextValue | null>(null);

export function StudentOSProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudentOSState>(() => repository.load());

  // Persist on every change so progress survives refreshes.
  useEffect(() => {
    repository.save(state);
  }, [state]);

  const saveProfile = useCallback((profile: StudentProfile) => {
    setState((previous) => ({ ...previous, profile }));
  }, []);

  const toggleItem = useCallback((itemId: string, completed: boolean) => {
    setState((previous) => {
      const completions = { ...previous.completions };
      if (completed) {
        completions[itemId] = Date.now();
      } else {
        delete completions[itemId];
      }
      return { ...previous, completions };
    });
  }, []);

  const value = useMemo(
    () => ({
      profile: state.profile,
      completions: state.completions,
      saveProfile,
      toggleItem,
    }),
    [state.profile, state.completions, saveProfile, toggleItem],
  );

  return <StudentOSContext.Provider value={value}>{children}</StudentOSContext.Provider>;
}

export function useStudentOS(): StudentOSContextValue {
  const context = useContext(StudentOSContext);
  if (!context) {
    throw new Error("useStudentOS must be used within a StudentOSProvider");
  }
  return context;
}

/** Subjects the student is tracking, always in syllabus-catalog order. */
export function useSelectedSubjects(): Subject[] {
  const { profile } = useStudentOS();
  return useMemo(() => {
    if (!profile) return [];
    const selected = new Set(profile.subjects);
    return SYLLABUS.filter((subject) => selected.has(subject.id));
  }, [profile]);
}

/** Overall progress over the selected subjects, weighted by real item counts. */
export function useOverallProgress(): ProgressSummary {
  const subjects = useSelectedSubjects();
  const { completions } = useStudentOS();
  return useMemo(
    () => calculateOverallProgress(subjects, completions),
    [subjects, completions],
  );
}

export function useSubjectProgress(subject: Subject | undefined): ProgressSummary {
  const { completions } = useStudentOS();
  return useMemo(
    () =>
      subject
        ? calculateSubjectProgress(subject, completions)
        : { completed: 0, total: 0, percent: 0 },
    [subject, completions],
  );
}
