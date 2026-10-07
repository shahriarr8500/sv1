/**
 * Timer widget — a small floating control available on every page.
 *
 * Renders nothing unless a session is actually running, so it never clutters
 * the UI. Pause/resume keeps elapsed time honest (paused time is excluded),
 * and Finish records the real duration to the study log.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  activeElapsedSeconds,
  formatClock,
} from "@/lib/student-os/study-log";
import { lookupItem } from "@/lib/student-os/syllabus";
import { useStudyLog } from "@/state/study-log";

export function TimerWidget() {
  const { active, pauseTimer, resumeTimer, stopTimer, discardTimer } = useStudyLog();
  const [now, setNow] = useState(() => Date.now());

  // Tick only while something is running or paused, so the clock stays live.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const elapsed = activeElapsedSeconds(active, now);
  const paused = active.pausedAt !== undefined;
  const location_ = active.syllabusItemId
    ? lookupItem(active.syllabusItemId)
    : undefined;
  const context = location_
    ? `${location_.subject.name} · ${location_.item.itemNumber}`
    : active.mode === "study"
      ? "Study session"
      : "Rest break";

  const handleFinish = () => {
    const seconds = activeElapsedSeconds(active, Date.now());
    stopTimer();
    if (seconds >= 60) {
      const minutes = Math.round(seconds / 60);
      toast.success("Session recorded", {
        description: `${minutes} min added to your study time.`,
      });
    } else {
      toast("Session too short", {
        description: "Sessions under a minute aren't recorded.",
      });
    }
  };

  return (
    <div
      className="fixed right-4 bottom-4 left-4 z-40 sm:left-auto sm:w-80"
      role="region"
      aria-label="Study timer"
    >
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-lg">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{context}</p>
          <p
            className={
              paused
                ? "text-lg font-bold text-muted-foreground tabular-nums"
                : "text-lg font-bold tabular-nums"
            }
          >
            {formatClock(elapsed)}
            {paused ? <span className="ml-2 text-xs font-medium">paused</span> : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 cursor-pointer px-2"
            onClick={() => (paused ? resumeTimer() : pauseTimer())}
            aria-label={paused ? "Resume timer" : "Pause timer"}
          >
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            <span className="hidden sm:inline">{paused ? "Resume" : "Pause"}</span>
          </Button>
          <Button
            size="sm"
            className="h-8 cursor-pointer px-2"
            onClick={handleFinish}
            aria-label="Finish session"
          >
            <Square className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Finish</span>
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Discard session"
            title="Discard without recording"
            onClick={() => {
              discardTimer();
              toast("Session discarded", { description: "Nothing was recorded." });
            }}
          >
            ×
          </Button>
        </div>
      </div>
    </div>
  );
}
