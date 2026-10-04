import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatClock,
  formatDuration,
  type TimerMode,
} from "@/lib/student-os/study-log";
import { cn } from "@/lib/utils";
import { useStudyLog } from "@/state/study-log";
import { format } from "date-fns";
import { Play, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ClockType = "free" | "countdown";

const PRESETS: Record<TimerMode, number[]> = {
  study: [25, 50, 90],
  rest: [5, 10, 15],
};

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg border px-4 py-2 text-sm transition-colors",
        active
          ? "border-primary/60 bg-primary/10 font-medium text-primary"
          : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Timer — study or rest, free count or countdown with an alarm. Stopping
 * records a real session; discarding records nothing.
 */
export function TimerPanel() {
  const { active, startTimer, stopTimer, discardTimer } = useStudyLog();

  const [mode, setMode] = useState<TimerMode>("study");
  const [clockType, setClockType] = useState<ClockType>("free");
  const [minutesInput, setMinutesInput] = useState("25");
  const [now, setNow] = useState(() => Date.now());

  // Tick while a timer runs so the display stays live.
  useEffect(() => {
    if (!active) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [active]);

  const parsedMinutes = Number(minutesInput);
  const minutesValid =
    Number.isFinite(parsedMinutes) && parsedMinutes >= 1 && parsedMinutes <= 600;

  const elapsed = active
    ? Math.max(0, Math.floor((now - active.startedAt) / 1000))
    : 0;
  const remaining =
    active?.targetSeconds != null
      ? Math.max(0, active.targetSeconds - elapsed)
      : null;

  const handleStart = () => {
    if (clockType === "countdown") {
      if (!minutesValid) return;
      startTimer(mode, "countdown", Math.round(parsedMinutes) * 60);
    } else {
      startTimer(mode, "stopwatch");
    }
    setNow(Date.now());
  };

  const handleStop = () => {
    if (!active) return;
    const duration =
      active.targetSeconds != null
        ? Math.min(elapsed, active.targetSeconds)
        : elapsed;
    if (duration < 1) {
      // Too short to be a real session — discard instead of recording junk.
      discardTimer();
      return;
    }
    stopTimer(duration);
    toast("Session recorded", {
      description: `${formatDuration(duration)} of ${
        active.mode === "study" ? "study" : "rest"
      } added to your progress.`,
    });
  };

  const handleDiscard = () => {
    discardTimer();
    toast("Timer discarded", { description: "Nothing was recorded." });
  };

  if (active) {
    const display =
      remaining != null ? formatClock(remaining) : formatClock(elapsed);
    const sub =
      remaining != null && active.targetSeconds != null
        ? `Ends at ${format(
            active.startedAt + active.targetSeconds * 1000,
            "h:mm a",
          )} · elapsed ${formatClock(elapsed)}`
        : `Started at ${format(active.startedAt, "h:mm a")}`;

    return (
      <div className="mx-auto max-w-xl space-y-8 py-2 text-center">
        <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          {active.mode === "study" ? "Study session" : "Rest break"} ·{" "}
          {active.source === "countdown" ? "Countdown" : "Free count"}
        </span>

        <div>
          <p className="text-6xl leading-none font-bold tracking-tight tabular-nums sm:text-7xl">
            {display}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">{sub}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" className="cursor-pointer" onClick={handleStop}>
            <Square className="size-4" aria-hidden />
            Stop &amp; record
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="cursor-pointer text-muted-foreground"
            onClick={handleDiscard}
          >
            <Trash2 className="size-4" aria-hidden />
            Discard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 py-2">
      <div className="space-y-2.5">
        <p className="text-center text-sm font-medium">What are you timing?</p>
        <div
          role="group"
          aria-label="Timer mode"
          className="flex justify-center gap-2"
        >
          <Pill
            label="Study"
            active={mode === "study"}
            onClick={() => setMode("study")}
          />
          <Pill
            label="Rest"
            active={mode === "rest"}
            onClick={() => setMode("rest")}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-center text-sm font-medium">How should it run?</p>
        <div
          role="group"
          aria-label="Timer type"
          className="flex justify-center gap-2"
        >
          <Pill
            label="Free count"
            active={clockType === "free"}
            onClick={() => setClockType("free")}
          />
          <Pill
            label="Countdown with alarm"
            active={clockType === "countdown"}
            onClick={() => setClockType("countdown")}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Free count runs until you stop it. Countdown rings an alarm when time
          runs out and records the session for you.
        </p>
      </div>

      {clockType === "countdown" ? (
        <div className="space-y-2.5">
          <p className="text-center text-sm font-medium">Duration</p>
          <div className="flex flex-wrap justify-center gap-2">
            {PRESETS[mode].map((preset) => (
              <Pill
                key={preset}
                label={`${preset} min`}
                active={minutesInput === String(preset)}
                onClick={() => setMinutesInput(String(preset))}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={minutesInput}
              aria-label="Custom duration in minutes"
              className="w-24 text-center"
              onChange={(event) => setMinutesInput(event.target.value)}
            />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>
          {!minutesValid ? (
            <p className="text-center text-xs text-muted-foreground">
              Enter a duration between 1 and 600 minutes.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5 text-center">
        <p className="text-5xl leading-none font-bold tracking-tight text-muted-foreground/50 tabular-nums">
          {clockType === "countdown" && minutesValid
            ? formatClock(Math.round(parsedMinutes) * 60)
            : "00:00"}
        </p>
        <Button
          size="lg"
          className="cursor-pointer px-8"
          onClick={handleStart}
          disabled={clockType === "countdown" && !minutesValid}
        >
          <Play className="size-4" aria-hidden />
          Start {mode === "study" ? "study" : "rest"} timer
        </Button>
      </div>
    </div>
  );
}
