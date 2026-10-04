import { Progress } from "@/components/ui/progress";
import { chapterTitle } from "@/lib/student-os/format";
import {
  calculateChapterProgress,
} from "@/lib/student-os/progress";
import { getSubject } from "@/lib/student-os/syllabus";
import { cn } from "@/lib/utils";
import { useSubjectProgress, useStudentOS } from "@/state/student-os";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router";

/** Subject page — header progress plus the chapter list. */
export default function SubjectPage() {
  const { subjectId } = useParams();
  const { profile, completions } = useStudentOS();
  const subject = getSubject(subjectId);
  const progress = useSubjectProgress(subject);

  const chapters = useMemo(
    () =>
      subject
        ? subject.chapters.map((chapter) => ({
            chapter,
            summary: calculateChapterProgress(chapter, completions),
          }))
        : [],
    [subject, completions],
  );

  if (!subject || !profile || !profile.subjects.includes(subject.id)) {
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
          to="/dashboard"
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Dashboard
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {subject.paper}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">{subject.name}</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">
                {progress.completed} / {progress.total}
              </span>{" "}
              completed
            </p>
          </div>
          <span className="text-4xl leading-none font-bold tracking-tight tabular-nums text-primary">
            {progress.percent}%
          </span>
        </div>

        <Progress
          value={progress.percent}
          aria-label={`${subject.name} progress`}
          className="h-2.5 bg-primary/15"
        />
      </div>

      <section aria-labelledby="chapters-heading" className="space-y-3">
        <h2
          id="chapters-heading"
          className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Chapters
        </h2>
        <ul className="space-y-2">
          {chapters.map(({ chapter, summary }) => (
            <li key={chapter.id}>
              <Link
                to={`/syllabus/${subject.id}/${chapter.id}`}
                className="group flex cursor-pointer items-center gap-4 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold tracking-tight">
                    {chapterTitle(chapter)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                    {summary.completed} / {summary.total} completed
                  </span>
                </span>
                <span
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    summary.percent === 100
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-primary",
                  )}
                >
                  {summary.percent}%
                </span>
                {summary.percent === 100 ? (
                  <CheckCircle2
                    className="size-4 shrink-0 text-primary"
                    aria-label="Chapter complete"
                  />
                ) : (
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                    aria-hidden
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </motion.div>
  );
}
