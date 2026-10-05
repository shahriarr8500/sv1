/**
 * Student OS state — one provider owns the profile + syllabus completions and
 * persists them through the storage repository. Every page reads the same
 * state, so checking an item updates chapter, subject, overall progress,
 * recent activity, and the dashboard instantly (no reloads).
 */

import { useConvexAuth, useMutation } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
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

/** How long progress changes are batched before being mirrored to Convex. */
const SYNC_DEBOUNCE_MS = 2000;

export function StudentOSProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudentOSState>(() => repository.load());
  const { isAuthenticated } = useConvexAuth();
  const syncProgress = useMutation(api.progress.syncMyProgress);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist on every change so progress survives refreshes.
  useEffect(() => {
    repository.save(state);
  }, [state]);

  // Mirror this student's state onto their Convex account so the admin
  // console can read it. Debounced, and a no-op while signed out.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncProgress({ profile: state.profile, completions: state.completions }).catch(
        (error) => {
          console.warn("Progress sync failed:", error);
        },
      );
    }, SYNC_DEBOUNCE_MS);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [state, isAuthenticated, syncProgress]);

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
