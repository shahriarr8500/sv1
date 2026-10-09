/**
 * Future goal chip — the small dark card shown beside the greeting that tells
 * the student what they are working toward and lets them change it inline.
 *
 * It is intentionally tiny and dark so it reads as a calm sidebar note, not
 * another competing card on the dashboard. The displayed value is whatever the
 * student saved in onboarding or Settings — never a hardcoded default.
 */

import { Check, Edit, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useStudentOS } from "@/state/student-os";
import type { PaperView } from "@/state/student-os";
import { useState } from "react";

export function FutureGoalChip() {
  const { profile, saveProfile } = useStudentOS();
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [paper, setPaper] = useState<PaperView>("1st");
  const [educationLevel, setEducationLevel] = useState("Higher Secondary");

  const goalDraft = profile?.goal.trim() ?? "";
  const targetDraft = profile?.target.trim();
  const educationDraft = profile?.educationLevel ?? "Higher Secondary";
  const hasAny = !!(profile && (profile.goal || profile.target || profile.educationLevel));

  if (!editing) {
    return (
      <div
        className="inline-flex w-full max-w-full flex-wrap items-center gap-3 rounded-xl border bg-[#18181a] px-4 py-3 text-sm shadow-sm sm:w-auto"
        role="group"
        aria-label="Future goal"
      >
        <span
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 bg-[#2c3545] px-2.5 py-1.5 text-xs font-medium text-sky-300"
          aria-hidden="false"
        >
          <Target className="size-3.5" aria-hidden />
          <span className="sr-only">Goal</span>
        </span>

        <span className="font-semibold tracking-wide text-white/90 uppercase text-xs">
          Goal
        </span>

        <span className="min-w-0 flex-1 basis-40">
          {goalDraft ? (
            // Full goal text, wrapping — the chip is width-bounded by the
            // page, so nothing can push past the viewport.
            <span className="block break-words">
              “{goalDraft}”
              {targetDraft ? ` · ${targetDraft}` : null}
            </span>
          ) : (
            <span className="text-white/70">No goal set yet</span>
          )}
        </span>

        <div className="flex gap-2">
          {hasAny ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer gap-1.5 bg-transparent text-white/80 hover:bg-white/5 hover:text-white"
              onClick={() => {
                setGoal(goalDraft);
                setTarget(targetDraft ?? "");
                setPaper("1st" as PaperView);
                setEducationLevel(educationDraft);
                setEditing(true);
              }}
            >
              <Edit className="size-3" aria-hidden />
              Edit
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer gap-1.5 bg-transparent text-white/80 hover:bg-white/5 hover:text-white"
              onClick={() => {
                setPaper("1st" as PaperView);
                setEducationLevel(educationDraft);
                setEditing(true);
              }}
            >
              <Edit className="size-3" aria-hidden />
              Set goal
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        saveProfile({
          goal: goal.trim() ?? "",
          target: target.trim() ?? "",
          exam: profile?.exam ?? "",
          educationLevel,
          curriculum: profile?.curriculum ?? "",
          subjects: profile?.subjects ?? [],
        });
        setEditing(false);
      }}
      className="inline-flex w-full max-w-full flex-wrap items-center gap-3 rounded-xl border bg-[#18181a] px-4 py-3 text-sm shadow-sm sm:w-auto"
    >
      <span
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 bg-[#2c3545] px-2.5 py-1.5 text-xs font-medium text-sky-300"
        aria-hidden="false"
      >
        <Target className="size-3.5" aria-hidden />
        <span className="sr-only">Goal</span>
      </span>

      <Label className="cursor-pointer flex-1 text-xs font-semibold tracking-wide text-white/90 uppercase">
        Where are you heading?
      </Label>

      <div className="flex-1 min-w-0 space-y-2">
        <Label className="cursor-pointer text-xs text-white/70">Goal</Label>
        <Input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="e.g. HSC, Year 13, university entry"
          autoFocus
          className="h-8 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-sky-400/60 focus:ring-sky-400/20"
        />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <Label className="cursor-pointer text-xs text-white/70">Target</Label>
        <Input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="e.g. A+ in Chemistry, 90% overall"
          className="h-8 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-sky-400/60 focus:ring-sky-400/20"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="space-y-1">
          <Label className="cursor-pointer text-xs text-white/70">Paper</Label>
          <div className="flex gap-1.5" role="group" aria-label="Paper">
            <button
              type="button"
              role="radio"
              aria-pressed={paper === "1st"}
              onClick={() => setPaper("1st")}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors",
                paper === "1st"
                  ? "border-sky-400/60 bg-sky-400/10 font-medium text-sky-300"
                  : "border-white/10 text-white/70 hover:border-white/20 hover:bg-white/5",
              )}
            >
              1st Paper
            </button>
            <button
              type="button"
              role="radio"
              aria-pressed={paper === "2nd"}
              onClick={() => setPaper("2nd")}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors",
                paper === "2nd"
                  ? "border-sky-400/60 bg-sky-400/10 font-medium text-sky-300"
                  : "border-white/10 text-white/70 hover:border-white/20 hover:bg-white/5",
              )}
            >
              2nd Paper
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="cursor-pointer text-xs text-white/70">Level</Label>
          <select
            value={educationLevel}
            onChange={(event) => setEducationLevel(event.target.value)}
            className="h-8 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white focus:border-sky-400/60 focus:ring-sky-400/20"
          >
            <option>Higher Secondary</option>
            <option>Secondary</option>
            <option>College</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer gap-1.5 bg-transparent text-white/80 hover:bg-white/5 hover:text-white"
          onClick={() => setEditing(false)}
        >
          <X className="size-3" aria-hidden />
          Cancel
        </Button>
        <Button
          type="submit"
          className="cursor-pointer gap-1.5 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30"
        >
          <Check className="size-3" aria-hidden />
          Save
        </Button>
      </div>
    </form>
  );
}
