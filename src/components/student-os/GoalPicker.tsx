/** Inline reply from the welcome header — lets the student reach their future
 * goal from where the greeting presents it, without leaving that screen.
 */

import { useState } from "react";
import { Check, Edit, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useStudentOS } from "@/state/student-os";
import type { PaperView } from "@/state/student-os";

export function GoalPicker() {
  const { profile, saveProfile } = useStudentOS();
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [paper, setPaper] = useState<PaperView>("1st");
  const [educationLevel, setEducationLevel] = useState("Higher Secondary");

  const goalDraft = profile?.goal.trim() ?? "";
  const targetDraft = profile?.target.trim();
  const educationDraft = profile?.educationLevel ?? "Higher Secondary";
  const saved          = !!profile && (profile.goal || profile.target || profile.educationLevel);

  if (!editing) {
    return (
      <div className="space-y-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-foreground">
            {goalDraft ? (
              <span className="truncate">
                {goalDraft}
                {targetDraft ? ` · ${targetDraft}` : null}
              </span>
            ) : (
              <span className="truncate">No goal set</span>
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer gap-1"
            onClick={() => {
              setGoal(goalDraft);
              setTarget(targetDraft ?? "");
              setPaper("1st" as PaperView);
              setEducationLevel(educationDraft);
              setEditing(true);
            }}
          >
            <Edit className="size-3.5" aria-hidden />
            Edit
          </Button>
        </div>
        {saved ? (
          <p className="text-xs text-muted-foreground">
            Space for your academic future — set it once and I&apos;ll keep your
            missions pointed at it.
          </p>
        ) : profile ? (
          <p className="text-xs text-muted-foreground">
            Space for your academic future — set it once and I&apos;ll keep your
            missions pointed at it.
          </p>
        ) : null}
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
      className="space-y-3 rounded-xl border bg-card px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <Label className="cursor-pointer flex-1 text-sm font-medium">
          Where are you heading?
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer gap-1"
          onClick={() => setEditing(false)}
        >
          <X className="size-3.5" aria-hidden />
          Cancel
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="cursor-pointer">Goal</Label>
        <Input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="e.g. HSC, Year 13, university entry"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label className="cursor-pointer">Target</Label>
        <Input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="e.g. A+ in Chemistry, 90% overall"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="cursor-pointer">Paper</Label>
          <div className="flex gap-2" role="group" aria-label="Paper">
            <button
              type="button"
              role="radio"
              aria-pressed={paper === "1st"}
              onClick={() => setPaper("1st")}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                paper === "1st"
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
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
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                paper === "2nd"
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
              )}
            >
              2nd Paper
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="cursor-pointer">Level</Label>
          <select
            value={educationLevel}
            onChange={(event) => setEducationLevel(event.target.value)}
            className="cursor-pointer rounded-lg border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            <option>Higher Secondary</option>
            <option>Secondary</option>
            <option>College</option>
          </select>
        </div>
      </div>

      <Button type="submit" className="cursor-pointer w-full">
        <Check className="size-3.5" aria-hidden />
        Save goal
      </Button>
    </form>
  );
}
