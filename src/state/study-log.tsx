/**
 * Study log state — running timer + recorded sessions, persisted through the
 * repository. The provider also watches running countdowns so an alarm fires
 * and the session is recorded even if the timer page is closed.
 */

import { playAlarm } from "@/lib/student-os/alarm";
import {
  activeElapsedSeconds,
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
    syllabusItemId?: string,
  ) => void;
  /** Freezes the running timer; elapsed time stops accumulating. */
  pauseTimer: () => void;
  /** Continues a paused timer, keeping the paused time excluded. */
  resumeTimer: () => void;
  /**
   * Records the running timer as a session. Pass a duration to override the
   * measured elapsed time (countdowns do this); omit it to use the elapsed
   * time excluding any pause.
   */
  stopTimer: (durationSeconds?: number) => void;
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
    (
      mode: TimerMode,
      source: TimerSource,
      targetSeconds?: number,
      syllabusItemId?: string,
    ) => {
      alarmFiredRef.current = null;
      setLog((previous) => ({
        ...previous,
        active: {
          mode,
          source,
          startedAt: Date.now(),
          targetSeconds,
          syllabusItemId,
          pausedMs: 0,
        },
      }));
    },
    [],
  );

  const pauseTimer = useCallback(() => {
    setLog((previous) => {
      const active = previous.active;
      if (!active || active.pausedAt !== undefined) return previous;
      return { ...previous, active: { ...active, pausedAt: Date.now() } };
    });
  }, []);

  const resumeTimer = useCallback(() => {
    setLog((previous) => {
      const active = previous.active;
      if (!active || active.pausedAt === undefined) return previous;
      const pausedMs = (active.pausedMs ?? 0) + (Date.now() - active.pausedAt);
      return { ...previous, active: { ...active, pausedAt: undefined, pausedMs } };
    });
  }, []);

  const stopTimer = useCallback((durationSeconds?: number) => {
    setLog((previous) => {
      const active = previous.active;
      if (!active) return previous;
      const duration = Math.floor(
        durationSeconds ?? activeElapsedSeconds(active),
      );
      if (duration < 1) {
        // Too short to be real study — drop it instead of logging junk.
        return { ...previous, active: null };
      }
      const session = {
        id: `study-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        mode: active.mode,
        source: active.source,
        startedAt: active.startedAt,
        endedAt: Date.now(),
        durationSeconds: duration,
        syllabusItemId: active.syllabusItemId,
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
  const activePausedAt = active?.pausedAt;
  const activePausedMs = active?.pausedMs;
  useEffect(() => {
    if (activeSource !== "countdown" || !activeTarget || !activeStartedAt) return;
    const check = () => {
      const current = log.active;
      if (!current) return;
      const elapsed = activeElapsedSeconds(current);
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
  }, [
    activeSource,
    activeTarget,
    activeStartedAt,
    activeMode,
    activePausedAt,
    activePausedMs,
    log.active,
    stopTimer,
  ]);

  const value = useMemo(
    () => ({
      log,
      active: log.active,
      startTimer,
      pauseTimer,
      resumeTimer,
      stopTimer,
      discardTimer,
    }),
    [log, startTimer, pauseTimer, resumeTimer, stopTimer, discardTimer],
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
