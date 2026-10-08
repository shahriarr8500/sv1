/**
 * Syllabus index — the academic backbone's front door.
 *
 * One row per subject: real progress from real item counts, plus the single
 * next thing to study. Everything here is derived from the student's own
 * completions — no invented chapters, no estimated percentages.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, BookOpenCheck, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { iconForSubject } from "@/components/student-os/subject-icons";
import {
  calculateOverallProgress,
  calculateSubjectProgress,
  findFirstIncompleteItem,
} from "@/lib/student-os/progress";
import { chapterLabel, itemLabel, itemPath } from "@/lib/student-os/format";
import type { PaperView } from "@/state/student-os";
import { useSubjectsForPaper, useStudentOS } from "@/state/student-os";
import { cn } from "@/lib/utils";

const PAPERS: Array<{ value: PaperView; label: string }> = [
  { value: "1st", label: "1st Paper" },
  { value: "2nd", label: "2nd Paper" },
  { value: "all", label: "All Papers" },
];

export default function SyllabusPage() {
  const [paper, setPaper] = useState<PaperView>("1st");
  const subjects = useSubjectsForPaper(paper);
  const { completions } = useStudentOS();
  const navigate = useNavigate();

  const overall = useMemo(
    () => calculateOverallProgress(subjects, completions),
    [subjects, completions],
  );

  const rows = useMemo(
    () =>
      subjects.map((subject) => ({
        subject,
        summary: calculateSubjectProgress(subject, completions),
        next: findFirstIncompleteItem([subject], completions),
      })),
    [subjects, completions],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-4xl space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Syllabus
          </h1>
          <p className="text-sm text-muted-foreground">
            Where you are, what&apos;s done, and what to study next.
          </p>
        </div>

        <div
          role="group"
          aria-label="Paper"
          className="flex rounded-lg border bg-muted/40 p-0.5"
        >
          {PAPERS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={paper === entry.value}
              onClick={() => setPaper(entry.value)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                paper === entry.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overall */}
      <Card className="gap-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold tracking-tight">
              Overall progress
            </p>
            <Progress
              value={overall.percent}
              aria-label="Overall syllabus progress"
              className="h-2.5 bg-primary/15"
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">
                {overall.completed} / {overall.total}
              </span>{" "}
              items completed · {overall.percent}%
            </p>
          </div>
          <span className="text-3xl leading-none font-bold tracking-tight tabular-nums text-primary sm:text-4xl">
            {overall.percent}%
          </span>
        </CardContent>
      </Card>

      {/* Subjects */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-semibold tracking-tight">
            No subjects selected yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Pick the subjects you are studying and your syllabus will appear
            here with live progress.
          </p>
          <Button className="mt-4 cursor-pointer" asChild>
            <Link to="/goal">Choose subjects</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ subject, summary, next }, index) => {
            const Icon = iconForSubject(subject.id);
            const complete = next === null;
            return (
              <motion.li
                key={subject.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.05 + index * 0.05,
                  ease: "easeOut",
                }}
              >
                <div className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 sm:p-5">
                  <div className="flex items-start gap-3.5">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                    >
                      <Icon className="size-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <Link
                          to={`/syllabus/${subject.id}`}
                          className="min-w-0 cursor-pointer truncate text-sm font-semibold tracking-tight hover:text-primary"
                        >
                          {subject.name}
                        </Link>
                        <span className="text-sm font-bold tabular-nums text-primary">
                          {summary.percent}%
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <Progress
                          value={summary.percent}
                          aria-label={`${subject.name} progress`}
                          className="h-2 bg-primary/15"
                        />
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {summary.completed} / {summary.total} items completed
                          {" · "}
                          {subject.paper}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 text-xs">
                          {complete ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                              <BookOpenCheck className="size-3.5" aria-hidden />
                              Syllabus complete
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Continue:{" "}
                              <span className="font-medium text-foreground">
                                {chapterLabel(next.chapter)}
                              </span>
                              {next.item.title !== next.chapter.title ? (
                                <span className="text-primary">
                                  {" "}
                                  · {itemLabel(next.item)}
                                </span>
                              ) : null}
                            </span>
                          )}
                        </div>

                        {!complete ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 cursor-pointer px-3 text-xs"
                            onClick={() => navigate(itemPath(next))}
                          >
                            Continue
                            <ArrowRight className="size-3" aria-hidden />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 cursor-pointer px-3 text-xs"
                            onClick={() => navigate(`/syllabus/${subject.id}`)}
                          >
                            Review
                            <ArrowRight className="size-3" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ListChecks className="size-3.5 shrink-0 text-primary" aria-hidden />
        Every percentage comes from individually tracked study items — never
        estimated.
      </p>
    </motion.div>
  );
}
