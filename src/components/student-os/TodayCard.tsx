import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { useStudentOS } from "@/state/student-os";
import { useTargets } from "@/state/targets";
import { useState } from "react";
import { itemLabel, syllabusShortLabel } from "@/lib/student-os/format";
import { findFirstIncompleteItem } from "@/lib/student-os/progress";
import type { ItemLocation, Subject } from "@/lib/student-os/types";

interface TodayCardProps {
  next: ItemLocation | null;
  subjects: Subject[];
}

/** Compact Today panel: Daily Guidance, AI Summary, Continue Studying. */
export function TodayCard({ next, subjects }: TodayCardProps) {
  const { completions } = useStudentOS();
  const { today } = useTargets();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section
      aria-labelledby="today-compact-heading"
      className="overflow-hidden rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="today-compact-heading"
          className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Today
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="More actions"
          className="h-7 w-7 cursor-pointer flex-shrink-0"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Daily Guidance
          </p>
          <p className="mt-1 truncate text-sm text-foreground">
            “With hardship comes ease.” — Quran 94:5
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            AI Summary
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Yesterday you studied <span className="text-foreground">2h 10m</span> across 3 sessions. 2 missions left today.
          </p>
        </div>

        {next ? (
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Continue Studying
            </p>
            <p className="mt-1 truncate text-sm text-foreground">
              {next.subject.name} · {itemLabel(next.item)}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {syllabusShortLabel(subjects)} syllabus
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Continue Studying
            </p>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              Syllabus complete — nothing left to chase.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
