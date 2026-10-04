import { ContinueStudying } from "@/components/student-os/ContinueStudying";
import { GoalHeader } from "@/components/student-os/GoalHeader";
import { OverallProgressCard } from "@/components/student-os/OverallProgressCard";
import { RecentProgress } from "@/components/student-os/RecentProgress";
import { SubjectCard } from "@/components/student-os/SubjectCard";
import { useMemo } from "react";
import {
  calculateSubjectProgress,
  findFirstIncompleteItem,
  listRecentCompletions,
} from "@/lib/student-os/progress";
import {
  useOverallProgress,
  useSelectedSubjects,
  useStudentOS,
} from "@/state/student-os";

/**
 * Dashboard — the Student OS home screen, in priority order:
 *   1. Your goal → 2. Overall progress → 3. Subject progress
 *   → 4. Continue studying → 5. Recent progress
 */
export default function DashboardPage() {
  const { profile, completions } = useStudentOS();
  const subjects = useSelectedSubjects();
  const overall = useOverallProgress();

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

  // AppShell already redirects when no profile exists; this keeps types honest.
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <GoalHeader profile={profile} />

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

      <div className="grid gap-4 lg:grid-cols-2">
        <ContinueStudying next={next} subjects={subjects} />
        <RecentProgress entries={recent} />
      </div>
    </div>
  );
}
