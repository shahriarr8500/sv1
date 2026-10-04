/**
 * Study log state — running timer + recorded sessions, persisted through the
 * repository. The provider also watches running countdowns so an alarm fires
 * and the session is recorded even if the timer page is closed.
 */

import { playAlarm } from "@/lib/student-os/alarm";
import {
  studyLogRepository,
  type ActiveTimer,
  type StudyLogState,
  type TimerMode,
  type TimerSource,
} from "@/lib/student-os/study-log";
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
import { toast } from "sonner";

interface StudyLogContextValue {
  log: StudyLogState;
  active: ActiveTimer | null;
  startTimer: (
    mode: TimerMode,
    source: TimerSource,
    targetSeconds?: number,
  ) => void;
  /** Records the running timer as a session of the given duration. */
  stopTimer: (durationSeconds: number) => void;
  /** Clears the running timer without recording anything. */
  discardTimer: () => void;
}

const StudyLogContext = createContext<StudyLogContextValue | null>(null);

export function StudyLogProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<StudyLogState>(() => studyLogRepository.load());
  const alarmFiredRef = useRef<number | null>(null);

  // Persist on every change so study hours survive refreshes.
  useEffect(() => {
    studyLogRepository.save(log);
  }, [log]);

  const startTimer = useCallback(
    (mode: TimerMode, source: TimerSource, targetSeconds?: number) => {
      alarmFiredRef.current = null;
      setLog((previous) => ({
        ...previous,
        active: { mode, source, startedAt: Date.now(), targetSeconds },
      }));
    },
    [],
  );

  const stopTimer = useCallback((durationSeconds: number) => {
    setLog((previous) => {
      if (!previous.active) return previous;
      const session = {
        id: `study-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        mode: previous.active.mode,
        source: previous.active.source,
        startedAt: previous.active.startedAt,
        endedAt: previous.active.startedAt + durationSeconds * 1000,
        durationSeconds,
      };
      return { ...previous, sessions: [session, ...previous.sessions], active: null };
    });
  }, []);

  const discardTimer = useCallback(() => {
    alarmFiredRef.current = null;
    setLog((previous) => ({ ...previous, active: null }));
  }, []);

  // Auto-finish countdown timers at zero — rings the alarm, records the
  // session, and works even when the user is on another page.
  const active = log.active;
  const activeStartedAt = active?.startedAt;
  const activeSource = active?.source;
  const activeTarget = active?.targetSeconds;
  const activeMode = active?.mode;
  useEffect(() => {
    if (activeSource !== "countdown" || !activeTarget || !activeStartedAt) return;
    const check = () => {
      const elapsed = Math.floor((Date.now() - activeStartedAt) / 1000);
      if (elapsed < activeTarget) return;
      if (alarmFiredRef.current !== activeStartedAt) {
        alarmFiredRef.current = activeStartedAt;
        playAlarm();
        toast("Time is up", {
          description:
            activeMode === "study"
              ? "Your study session has been recorded."
              : "Break over — your rest timer has been recorded.",
        });
      }
      stopTimer(activeTarget);
    };
    const intervalId = window.setInterval(check, 500);
    return () => window.clearInterval(intervalId);
  }, [activeSource, activeTarget, activeStartedAt, activeMode, stopTimer]);

  const value = useMemo(
    () => ({ log, active: log.active, startTimer, stopTimer, discardTimer }),
    [log, startTimer, stopTimer, discardTimer],
  );

  return (
    <StudyLogContext.Provider value={value}>{children}</StudyLogContext.Provider>
  );
}

export function useStudyLog(): StudyLogContextValue {
  const context = useContext(StudyLogContext);
  if (!context) {
    throw new Error("useStudyLog must be used within a StudyLogProvider");
  }
  return context;
}
