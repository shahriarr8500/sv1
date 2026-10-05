/**
 * Student OS state — one provider owns the profile + syllabus completions and
 * persists them through the storage repository. Every page reads the same
 * state, so checking an item updates chapter, subject, overall progress,
 * recent activity, and the dashboard instantly (no reloads).
 */

import { useConvexAuth, useMutation, useQuery } from "convex/react";
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
  /** True while an impersonated account's state is still being fetched. */
  isStateLoading: boolean;
  /** Used by onboarding (first save) and Settings → Goal (edits). */
  saveProfile: (profile: StudentProfile) => void;
  /** Check an item on or off; timestamp is recorded or cleared accordingly. */
  toggleItem: (itemId: string, completed: boolean) => void;
}

const StudentOSContext = createContext<StudentOSContextValue | null>(null);

/** How long progress changes are batched before being mirrored to Convex. */
const SYNC_DEBOUNCE_MS = 2000;

export function StudentOSProvider({ children }: { children: ReactNode }) {
  /** This browser's own Student OS state. */
  const [localState, setLocalState] = useState<StudentOSState>(() =>
    repository.load(),
  );
  /** Edits made while impersonating somebody else, seeded from their record. */
  const [impersonatedEdits, setImpersonatedEdits] = useState<
    StudentOSState | null
  >(null);
  const { isAuthenticated } = useConvexAuth();
  const syncProgress = useMutation(api.progress.syncMyProgress);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  // While an admin is signed in as somebody else, the state shown is the
  // target's — read from the server instead of this browser's storage, and
  // never written back to it. This query must not be skipped: skipping it
  // leaves the provider on the admin's own state while the rest of the UI
  // believes a session is open.
  const impersonation = useQuery(api.impersonation.active);
  const isImpersonating = impersonation?.active === true;

  // A device that has never used the app (new phone, cleared browser) starts
  // with empty local state. Hydrate it from the account so the same student
  // sees the same progress on every device. It only fills an empty local
  // state, so progress already recorded on this device is never overwritten.
  const serverProgress = useQuery(
    api.progress.myProgress,
    isAuthenticated && !isImpersonating ? {} : "skip",
  );
  // Adjusting state during render (React's documented alternative to doing it
  // inside an effect): a device that has never used the app fills its empty
  // local state from the account exactly once. It never overwrites progress
  // already recorded on this device.
  const [hydrated, setHydrated] = useState(false);
  const shouldHydrate =
    !hydrated &&
    isAuthenticated &&
    !isImpersonating &&
    serverProgress !== undefined &&
    serverProgress !== null &&
    Object.keys(serverProgress.completions).length > 0 &&
    Object.keys(localState.completions).length === 0;
  if (shouldHydrate) {
    setHydrated(true);
    setLocalState({
      version: 1,
      profile:
        (serverProgress.profile as StudentProfile | null) ??
        localState.profile,
      completions: serverProgress.completions,
    });
  }
  const targetState = useQuery(
    api.impersonation.targetState,
    isImpersonating ? {} : "skip",
  );

  const state = useMemo<StudentOSState>(() => {
    if (!isImpersonating) return localState;
    if (impersonatedEdits !== null) return impersonatedEdits;
    if (targetState === undefined) return { version: 1, profile: null, completions: {} };
    return {
      version: 1,
      profile: (targetState.profile as StudentProfile | null) ?? null,
      completions: targetState.completions ?? {},
    };
  }, [isImpersonating, localState, impersonatedEdits, targetState]);

  /** True only while an impersonated account's state is still in flight. */
  const isStateLoading = isImpersonating && targetState === undefined;

  /** Applies an update to whichever account is currently being viewed. */
  const updateState = useCallback(
    (updater: (previous: StudentOSState) => StudentOSState) => {
      if (isImpersonating) {
        setImpersonatedEdits((previous) => updater(previous ?? state));
      } else {
        setLocalState(updater);
      }
    },
    [isImpersonating, state],
  );

  // Persist this browser's own changes so progress survives refreshes — never
  // while impersonating, or the admin's state would overwrite the target's.
  useEffect(() => {
    if (isImpersonating) return;
    repository.save(localState);
  }, [localState, isImpersonating]);

  // Mirror the visible state onto the right Convex account so the admin
  // console can read it. Debounced, and a no-op while signed out. While an
  // admin is impersonating, the server routes the write to the target.
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

  const saveProfile = useCallback(
    (profile: StudentProfile) => {
      updateState((previous) => ({ ...previous, profile }));
    },
    [updateState],
  );

  const toggleItem = useCallback(
    (itemId: string, completed: boolean) => {
      updateState((previous) => {
        const completions = { ...previous.completions };
        if (completed) {
          completions[itemId] = Date.now();
        } else {
          delete completions[itemId];
        }
        return { ...previous, completions };
      });
    },
    [updateState],
  );

  const value = useMemo(
    () => ({
      profile: state.profile,
      completions: state.completions,
      isStateLoading,
      saveProfile,
      toggleItem,
    }),
    [state.profile, state.completions, isStateLoading, saveProfile, toggleItem],
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
    return SYLLABUS.filter(
      (subject) => subject.paperKey === "1st" && selected.has(subject.id),
    );
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

/* -------------------------------------------------------------------------- */
/* Paper-aware helpers                                                        */
/* -------------------------------------------------------------------------- */

/** Which paper the student is looking at. */
export type PaperView = "1st" | "2nd" | "all";

/**
 * Subjects for a paper view.
 *
 * The stored profile still lists only the 1st Paper subjects, so 2nd Paper
 * subjects are derived from them rather than requiring a data migration.
 */
export function useSubjectsForPaper(view: PaperView): Subject[] {
  const subjects = useSelectedSubjects();
  return useMemo(() => {
    const wanted = new Set(
      subjects.map((subject) =>
        view === "2nd"
          ? `${subject.id.replace(/-2nd$/, "")}-2nd`
          : subject.id.replace(/-2nd$/, ""),
      ),
    );
    return SYLLABUS.filter((subject) => wanted.has(subject.id));
  }, [subjects, view]);
}

/** True when this subject (either paper) is part of the student's plan. */
export function isSubjectTracked(
  profile: StudentProfile | null,
  subject: Subject,
): boolean {
  if (!profile) return false;
  const base = subject.id.replace(/-2nd$/, "");
  return profile.subjects.includes(subject.id) || profile.subjects.includes(base);
}
