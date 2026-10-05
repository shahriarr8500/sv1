import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContinueStudying } from "@/components/student-os/ContinueStudying";
import { GoalHeader } from "@/components/student-os/GoalHeader";
import { OverallProgressCard } from "@/components/student-os/OverallProgressCard";
import { RecentProgress } from "@/components/student-os/RecentProgress";
import { SubjectCard } from "@/components/student-os/SubjectCard";
import { formatPrice } from "@/lib/student-os/catalog";
import { formatBookingDate } from "@/lib/student-os/format";
import {
 calculateOverallProgress,
  calculateSubjectProgress,
  findFirstIncompleteItem,
  listRecentCompletions,
} from "@/lib/student-os/progress";
import { cn } from "@/lib/utils";
import {
  useStudentOS,
  useSubjectsForPaper,
  type PaperView,
} from "@/state/student-os";
import { useBookings } from "@/state/workspace";
import { motion } from "framer-motion";
import { CalendarCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

const PAPER_TABS: Array<{ value: PaperView; label: string }> = [
  { value: "1st", label: "1st Paper" },
  { value: "2nd", label: "2nd Paper" },
  { value: "all", label: "All Papers" },
];

/** Segmented control for switching which paper the dashboard summarises. */
function PaperSelector({
  value,
  onChange,
}: {
  value: PaperView;
  onChange: (next: PaperView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Paper"
      className="inline-flex flex-wrap gap-1 rounded-xl border bg-card p-1"
    >
      {PAPER_TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
            value === tab.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Dashboard — the Student OS home screen, in priority order:
 *   1. Your goal → 2. Overall progress → 3. Subject progress
 *   → 4. Continue studying → 5. Recent progress
 */
export default function DashboardPage() {
  const { profile, completions } = useStudentOS();
  const [paper, setPaper] = useState<PaperView>("1st");
  const subjects = useSubjectsForPaper(paper);
  const overall = useMemo(
    () => calculateOverallProgress(subjects, completions),
    [subjects, completions],
  );

  const subjectSummaries = useMemo(
    () => subjects.map((subject) => calculateSubjectProgress(subject, completions)),
    [subjects, completions],
  );
  const next = useMemo(
    () => findFirstIncompleteItem(subjects, completions),
    [subjects, completions],
  );
  const recent = useMemo(
    () => listRecentCompletions(completions, 6),
    [completions],
  );
  const bookings = useBookings();
  const upcoming = useMemo(
    () => bookings.find((booking) => booking.status === "confirmed") ?? null,
    [bookings],
  );

  // AppShell already redirects when no profile exists; this keeps types honest.
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <GoalHeader profile={profile} />

      <PaperSelector value={paper} onChange={setPaper} />

      <OverallProgressCard summary={overall} subjects={subjects} />

      <section aria-labelledby="subject-progress-heading" className="space-y-4">
        <h2
          id="subject-progress-heading"
          className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Subject Progress
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {subjects.map((subject, index) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              summary={subjectSummaries[index]}
              index={index}
            />
          ))}
        </div>
      </section>

      <div
        className={cn(
          "grid gap-4",
          upcoming ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        <ContinueStudying next={next} subjects={subjects} />
        {upcoming ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.22, ease: "easeOut" }}
            className="h-full"
          >
            <Card className="h-full gap-4">
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                  >
                    <CalendarCheck className="size-4" />
                  </span>
                  <CardTitle className="text-base">
                    {upcoming.date ? "Upcoming session" : "Latest booking"}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-semibold tracking-tight">
                    {upcoming.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {upcoming.date && upcoming.time
                      ? `${formatBookingDate(upcoming.date)} · ${upcoming.time}`
                      : "Self-paced"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {upcoming.reference} · {formatPrice(upcoming.amount)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full cursor-pointer"
                  asChild
                >
                  <Link to="/bookings">My bookings</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
        <RecentProgress entries={recent} />
      </div>
    </div>
  );
}
