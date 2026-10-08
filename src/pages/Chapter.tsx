import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { chapterTitle, itemLabel } from "@/lib/student-os/format";
import {
  calculateChapterProgress,
  isItemCompleted,
} from "@/lib/student-os/progress";
import { getChapter, getSubject } from "@/lib/student-os/syllabus";
import { cn } from "@/lib/utils";
import { isSubjectTracked, useStudentOS } from "@/state/student-os";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";

/** Chapter checklist — every study item is individually trackable. */
export default function ChapterPage() {
  const { subjectId, chapterId } = useParams();
  const { profile, completions, toggleItem } = useStudentOS();

  const subject = getSubject(subjectId);
  const chapter = subject ? getChapter(subject, chapterId ?? "") : undefined;
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const progress = chapter
    ? calculateChapterProgress(chapter, completions)
    : { completed: 0, total: 0, percent: 0 };

  // "Continue Studying" lands here with #itemId — scroll it into view and
  // briefly highlight it so the next action is obvious.
  useEffect(() => {
    const itemId = window.location.hash.slice(1);
    if (!itemId) return;
    const element = document.getElementById(itemId);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    const showTimer = window.setTimeout(() => setHighlighted(itemId), 0);
    const hideTimer = window.setTimeout(() => setHighlighted(null), 2600);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!subject || !chapter || !profile || !isSubjectTracked(profile, subject)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-8"
    >
      <div className="space-y-4">
        <Link
          to={`/syllabus/${subject.id}`}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {subject.name}
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">
              {subject.name} · {subject.paper}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {chapterTitle(chapter)}
            </h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">
                {progress.completed} / {progress.total}
              </span>{" "}
              completed
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <span className="text-4xl leading-none font-bold tracking-tight tabular-nums text-primary">
              {progress.percent}%
            </span>
            <Button variant="outline" size="sm" className="cursor-pointer" asChild>
              <Link
                to={`/ashy?context=${encodeURIComponent(
                  `Subject: ${subject.name}\nChapter: ${chapterTitle(chapter)}`,
                )}`}
              >
                <Sparkles className="size-3.5" aria-hidden />
                Ask Ashy about this chapter
              </Link>
            </Button>
          </div>
        </div>

        <Progress
          value={progress.percent}
          aria-label="Chapter progress"
          className="h-2.5 bg-primary/15"
        />
      </div>

      <section aria-labelledby="items-heading" className="space-y-3">
        <h2
          id="items-heading"
          className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Study Items
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          {chapter.items.map((item) => {
            const completed = isItemCompleted(item, completions);
            const checkboxId = `check-${item.id}`;
            return (
              <label
                key={item.id}
                id={item.id}
                htmlFor={checkboxId}
                className={cn(
                  "flex cursor-pointer items-center gap-3.5 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-muted/50",
                  highlighted === item.id &&
                    "bg-primary/5 ring-1 ring-primary/30 ring-inset",
                )}
              >
                <Checkbox
                  id={checkboxId}
                  checked={completed}
                  className="size-5"
                  onCheckedChange={(state) =>
                    toggleItem(item.id, state === true)
                  }
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    completed && "text-muted-foreground",
                  )}
                >
                  {itemLabel(item)}
                </span>
                {completed ? (
                  <span className="shrink-0 text-xs font-medium text-primary">
                    Completed
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {progress.completed} of {progress.total} items in this chapter are
          complete.
        </p>
      </section>
    </motion.div>
  );
}
