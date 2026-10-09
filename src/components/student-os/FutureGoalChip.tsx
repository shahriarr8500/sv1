/**
 * Future goal chip — the small card shown beside the greeting that tells the
 * student what they are working toward and lets them change it inline.
 *
 * Theme-token colors only (bg-card / text-card-foreground / text-muted-
 * foreground / bg-primary), so the card is readable in BOTH light and dark —
 * it used to be hardcoded dark, which made the text invisible on light.
 *
 * Layout is a single row at every width: [icon] [text block, flex-1 min-w-0]
 * [Edit button, shrink-0]. The GOAL label and title stack inside the text
 * block (title clamped to 2 lines, wrapping), so long goal text can never
 * push the Edit button onto its own line. Below 380px the Edit button becomes
 * an icon-only 44px touch target; above that it shows the icon + "Edit".
 *
 * The displayed value is whatever the student saved in onboarding or
 * Settings — never a hardcoded default.
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
        className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm sm:w-auto"
        role="group"
        aria-label="Future goal"
      >
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Target className="size-4" />
        </span>

        {/* Text block — label + title stack so the row never wraps. */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Goal
          </p>
          {goalDraft ? (
            <p className="line-clamp-2 text-sm font-semibold break-words text-card-foreground">
              &ldquo;{goalDraft}&rdquo;
              {targetDraft ? ` · ${targetDraft}` : null}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No goal set yet</p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={hasAny ? "Edit goal" : "Set goal"}
          className="h-11 shrink-0 cursor-pointer gap-1.5 px-3 text-muted-foreground hover:bg-accent hover:text-foreground max-[379px]:w-11 max-[379px]:px-0"
          onClick={() => {
            setGoal(goalDraft);
            setTarget(targetDraft ?? "");
            setPaper("1st" as PaperView);
            setEducationLevel(educationDraft);
            setEditing(true);
          }}
        >
          <Edit className="size-3.5" aria-hidden />
          <span className="max-[379px]:hidden">
            {hasAny ? "Edit" : "Set goal"}
          </span>
        </Button>
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
      className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm sm:w-auto"
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        aria-hidden
      >
        <Target className="size-4" />
      </span>

      <Label className="cursor-pointer flex-1 text-xs font-semibold tracking-wide text-foreground uppercase">
        Where are you heading?
      </Label>

      <div className="min-w-0 flex-1 space-y-2">
        <Label className="cursor-pointer text-xs text-muted-foreground">Goal</Label>
        <Input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="e.g. HSC, Year 13, university entry"
          autoFocus
          className="h-8"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <Label className="cursor-pointer text-xs text-muted-foreground">Target</Label>
        <Input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="e.g. A+ in Chemistry, 90% overall"
          className="h-8"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="space-y-1">
          <Label className="cursor-pointer text-xs text-muted-foreground">Paper</Label>
          <div className="flex gap-1.5" role="group" aria-label="Paper">
            <button
              type="button"
              role="radio"
              aria-pressed={paper === "1st"}
              onClick={() => setPaper("1st")}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors",
                paper === "1st"
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent",
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
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent",
              )}
            >
              2nd Paper
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="cursor-pointer text-xs text-muted-foreground">Level</Label>
          <select
            value={educationLevel}
            onChange={(event) => setEducationLevel(event.target.value)}
            className="h-8 cursor-pointer rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:border-ring focus:ring-ring"
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
          className="cursor-pointer gap-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setEditing(false)}
        >
          <X className="size-3" aria-hidden />
          Cancel
        </Button>
        <Button type="submit" className="cursor-pointer gap-1.5">
          <Check className="size-3" aria-hidden />
          Save
        </Button>
      </div>
    </form>
  );
}
