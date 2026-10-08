/**
 * Today's Missions — the dashboard's daily mission system.
 *
 * Each row is a real syllabus item planned for today. Checking one marks the
 * target complete, fills in the syllabus item if it is not already done, and
 * pays out the mission's XP exactly once. Unchecking only undoes the target.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { celebrate } from "@/state/celebration";
import {
  CheckCircle2,
  Flame,
  Play,
  Plus,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AddMissionDialog } from "@/components/student-os/AddMissionDialog";
import { lookupItem } from "@/lib/student-os/syllabus";
import { perfectDayKeys, PERFECT_DAY_XP } from "@/lib/student-os/gamification";
import { cn } from "@/lib/utils";
import { useStudentOS } from "@/state/student-os";
import { useStudyLog } from "@/state/study-log";
import { useTargets } from "@/state/targets";
import { useGamification } from "@/state/gamification";
import { useMissionActions } from "@/state/missions";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TodayMissions() {
  const { targets, today } = useTargets();
  const { toggleMission, removeMission } = useMissionActions();
  const { xpToday, level, streak } = useGamification();
  const { active, startTimer } = useStudyLog();
  const { completions } = useStudentOS();
  const [dialogOpen, setDialogOpen] = useState(false);

  // The welcome header's "Plan today's missions" CTA hands off here so the
  // student never has to hunt for the planner.
  useEffect(() => {
    const open = () => setDialogOpen(true);
    window.addEventListener("student-os:add-mission", open);
    return () => window.removeEventListener("student-os:add-mission", open);
  }, []);

  const key = todayKey();
  const planned = today.length;
  const completed = today.filter((t) => t.completed).length;
  const percent = planned === 0 ? 0 : Math.round((completed / planned) * 100);
  const perfect = planned > 0 && completed === planned;

  const isPerfectDay = useMemo(
    () => perfectDayKeys(targets).has(key),
    [targets, key],
  );

  const rows = useMemo(
    () =>
      today
        .map((target) => ({
          target,
          location: lookupItem(target.syllabusItemId),
        }))
        .sort((a, b) => Number(a.target.completed) - Number(b.target.completed)),
    [today],
  );

  const handleToggle = (targetId: string, next: boolean) => {
    const target = targets.find((t) => t.id === targetId);
    if (!target || target.completed === next) return;
    toggleMission(target);
    const location = lookupItem(target.syllabusItemId);
    const where = `${location?.subject.name ?? ""} ${location?.item.itemNumber ?? ""}`.trim();
    if (next) {
      // One satisfying moment, not two. The celebration already carries the
      // detail and the XP read-out, so a matching toast would just repeat it.
      const nowCompleted = completed + 1;
      const streakNote =
        streak > 0
          ? `Streak: ${streak} day${streak === 1 ? "" : "s"}`
          : undefined;
      if (planned > 0 && nowCompleted === planned) {
        celebrate({
          kind: "perfect",
          title: "Perfect day",
          detail: `${nowCompleted} / ${planned} missions complete`,
          xp: PERFECT_DAY_XP,
          note: streakNote,
        });
      } else {
        celebrate({
          kind: "target",
          title: "Target complete",
          detail: where || target.syllabusItemId,
          xp: target.xp,
          note: streakNote,
        });
      }
    } else {
      // XP is derived from completion, so it drops straight back out.
      toast("Mission reopened", {
        description: `−${target.xp} XP removed${where ? ` · ${where}` : ""}`,
      });
    }
  };

  const handleStartSession = (itemId: string) => {
    if (active) return;
    startTimer("study", "stopwatch", undefined, itemId);
    toast("Session started", { description: "Tracking time against this mission." });
  };

  return (
    <>
      <Card className="gap-4">
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="size-4 text-primary" aria-hidden />
                Today&apos;s Missions
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {planned === 0 ? (
                  "Nothing planned yet — set your first mission."
                ) : (
                  <>
                    <span className="font-semibold text-foreground tabular-nums">
                      {completed} / {planned}
                    </span>{" "}
                    completed
                    {xpToday > 0 ? (
                      <span className="ml-2 font-medium text-primary">
                        +{xpToday} XP earned
                      </span>
                    ) : null}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/performance"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Performance
              </Link>
              <Button
                size="sm"
                className="cursor-pointer"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="size-4" aria-hidden />
                Add mission
              </Button>
            </div>
          </div>

          {planned > 0 ? (
            <div className="space-y-1.5 pt-1">
              <Progress value={percent} aria-label="Mission progress" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">{percent}% of today&apos;s plan</span>
                <span className="tabular-nums">
                  Level {level.level} · {level.remaining} XP to next
                </span>
              </div>
            </div>
          ) : null}

          {perfect || isPerfectDay ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
              <Flame className="size-4 shrink-0" aria-hidden />
              {perfect ? `Perfect day — ${completed} / ${planned} missions complete` : "Perfect day logged"}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-10 text-center">
              <p className="text-sm font-semibold tracking-tight">
                Your journey starts today
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Set your first mission and start building your streak.
              </p>
              <Button
                className="mt-4 cursor-pointer"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="size-4" aria-hidden />
                Set today&apos;s targets
              </Button>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {rows.map(({ target, location }) => {
                const done = target.completed;
                const syllabusDone =
                  typeof completions[target.syllabusItemId] === "number";
                const studyingHere =
                  active?.syllabusItemId === target.syllabusItemId;
                return (
                  <li
                    key={target.id}
                    className={cn(
                      "group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      done
                        ? "border-primary/30 bg-primary/5"
                        : "hover:border-primary/30 hover:bg-accent/40",
                    )}
                  >
                    <Checkbox
                      className="mt-1"
                      checked={done}
                      aria-label={
                        done ? "Mark mission incomplete" : "Mark mission complete"
                      }
                      onCheckedChange={(state) =>
                        handleToggle(target.id, state === true)
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span
                          className={cn(
                            "text-xs font-semibold tracking-wider uppercase",
                            done ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {location?.subject.name ?? "Syllabus"}
                        </span>
                        {location ? (
                          <span className="text-xs text-muted-foreground">
                            {location.chapter.title
                              ? `Ch ${location.chapter.number} — ${location.chapter.title}`
                              : `Ch ${location.chapter.number}`}
                          </span>
                        ) : null}
                      </div>

                      <p
                        className={cn(
                          "mt-0.5 text-sm font-medium tracking-tight",
                          done && "text-muted-foreground line-through",
                        )}
                      >
                        {location?.item.title ?? target.syllabusItemId}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-medium text-primary tabular-nums">
                          +{target.xp} XP
                        </span>
                        {done ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CheckCircle2 className="size-3.5" aria-hidden />
                            Done
                          </span>
                        ) : null}
                        {syllabusDone && !done ? (
                          <span className="text-muted-foreground">
                            Already in syllabus
                          </span>
                        ) : null}

                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {!done ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 cursor-pointer px-2 text-xs"
                          disabled={Boolean(active) && !studyingHere}
                          title={
                            active && !studyingHere
                              ? "A timer is already running"
                              : "Start a study session for this mission"
                          }
                          onClick={() => handleStartSession(target.syllabusItemId)}
                        >
                          <Play className="size-3" aria-hidden />
                          {studyingHere ? "Studying" : "Start session"}
                        </Button>
                      ) : null}
                      {!done ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label="Remove mission"
                          title="Remove mission"
                          onClick={() => removeMission(target.id)}
                        >
                          <X className="size-3.5" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {planned > 0 ? (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                {completed} of {planned} planned for today
              </span>
              <button
                type="button"
                className="cursor-pointer font-medium text-primary hover:underline"
                onClick={() => setDialogOpen(true)}
              >
                + Add mission
              </button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AddMissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={key}
      />
    </>
  );
}
