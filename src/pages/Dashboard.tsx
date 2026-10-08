import React, { Suspense } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TodayMissions } from "@/components/student-os/TodayMissions";
import { ContinueStudying } from "@/components/student-os/ContinueStudying";
import { OverallProgressCard } from "@/components/student-os/OverallProgressCard";
import { RecentProgress } from "@/components/student-os/RecentProgress";
import { StreakStrip } from "@/components/student-os/StreakStrip";
import { LevelCard } from "@/components/student-os/LevelCard";
import { SubjectCard } from "@/components/student-os/SubjectCard";
import { WelcomeHeader } from "@/components/student-os/WelcomeHeader";
import { DailyBriefing } from "@/components/student-os/DailyBriefing";
import { DailyGuidance } from "@/components/student-os/DailyGuidance";
import { StudentOSTargetsErrorBoundary } from "@/components/student-os/StudentOSTargetsErrorBoundary";
import { useStudentOS, useSelectedSubjects } from "@/state/student-os";
import {
  calculateOverallProgress,
  calculateSubjectProgress,
  findFirstIncompleteItem,
  listRecentCompletions,
} from "@/lib/student-os/progress";
import { cn } from "@/lib/utils";
import { useBookings } from "@/state/workspace";
import { formatPrice } from "@/lib/student-os/catalog";
import { formatBookingDate } from "@/lib/student-os/format";
import { CalendarCheck, Paperclip, HelpCircle } from "lucide-react";
import { Sparkles, BookOpen } from "lucide-react";
import type { PaperView } from "@/state/student-os";
import type { StudentProfile, Subject } from "@/lib/student-os/types";

const PAPER_TABS: Array<{ value: PaperView; label: string; icon: typeof Paperclip }> = [
  { value: "1st", label: "1st Paper", icon: Paperclip },
  { value: "2nd", label: "2nd Paper", icon: Paperclip },
  { value: "all", label: "All Papers", icon: HelpCircle },
];

function PaperSelector({ value, onChange }: { value: PaperView; onChange: (next: PaperView) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex" role="group" aria-label="Paper">
        {PAPER_TABS.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            variant={value === tab.value ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "pointer-events-auto cursor-pointer text-xs font-medium transition-colors",
              value === tab.value && "text-foreground",
            )}
            onClick={() => onChange(tab.value)}
            aria-pressed={value === tab.value}
            aria-label={tab.label}
          >
            <tab.icon className="mr-1.5 size-3.5" aria-hidden />
            {tab.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      </section>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="mt-4 h-2 w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-xl border bg-card p-4" />
        <Skeleton className="h-32 rounded-xl border bg-card p-4" />
      </div>

      <section aria-labelledby="loading-syllabus-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card className="gap-5">
          <CardHeader>
            <div className="flex w-full items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-60" />
              </div>
              <Skeleton className="h-12 w-16" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-2.5 w-full" />
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl border bg-card p-4" />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-4">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-36" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
        <Card className="gap-4">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-36" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
        <RecentProgress entries={[]} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { profile, completions, isStateLoading } = useStudentOS();
  const [paper, setPaper] = React.useState<PaperView>("1st");
  const selectedSubjects = useSelectedSubjects();
  const overall = React.useMemo(
    () => calculateOverallProgress(selectedSubjects, completions),
    [selectedSubjects, completions],
  );

  const subjectSummaries = React.useMemo(
    () => selectedSubjects.map((subject: Subject) => calculateSubjectProgress(subject, completions)),
    [selectedSubjects, completions],
  );
  const next = React.useMemo(
    () => findFirstIncompleteItem(selectedSubjects, completions),
    [selectedSubjects, completions],
  );
  const recent = React.useMemo(
    () => listRecentCompletions(completions, 6),
    [completions],
  );
  const today = React.useMemo(
    () => selectedSubjects.map((subject: Subject) => ({
      subject,
      summary: calculateSubjectProgress(subject, completions),
    })),
    [selectedSubjects, completions],
  );

  const bookings = useBookings();
  const upcoming = React.useMemo(
    () => bookings.find((booking) => booking.status === "confirmed") ?? null,
    [bookings],
  );

  if (isStateLoading) return <LoadingFallback />;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
      <WelcomeHeader />

      <StudentOSTargetsErrorBoundary>
        <TodayMissions />
      </StudentOSTargetsErrorBoundary>

      <ContinueStudying next={next} subjects={selectedSubjects} />

      <div className="grid gap-4 sm:grid-cols-2">
        <StreakStrip />
        <LevelCard />
      </div>

      {/* Syllabus Progress */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="syllabus-progress-heading"
            className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            Syllabus Progress
          </h2>
          <PaperSelector value={paper} onChange={setPaper} />
        </div>

        <OverallProgressCard summary={overall} subjects={selectedSubjects} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {subjectSummaries.map((summary, index) => (
            <SubjectCard
              key={selectedSubjects[index].id}
              subject={selectedSubjects[index]}
              summary={summary}
              index={index}
            />
          ))}
        </div>

        {/* AI Summary + Daily Guidance as separate rows */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="gap-4">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                >
                  <Sparkles className="size-4" />
                </span>
                <CardTitle className="text-base">AI Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <DailyBriefing />
            </CardContent>
          </Card>

          <Card className="gap-4">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                >
                  <BookOpen className="size-4" />
                </span>
                <CardTitle className="text-base">Daily Guidance</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <DailyGuidance />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upcoming / Recent */}
      <div className="grid gap-4 lg:grid-cols-3">
        {upcoming ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.22, ease: "easeOut" }}
            className="h-full"
          >
            <Card className="gap-4 h-full">
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
                  <p className="text-sm font-semibold tracking-tight">{upcoming.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {upcoming.date && upcoming.time
                      ? `${formatBookingDate(upcoming.date)} · ${upcoming.time}`
                      : "Self-paced"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {upcoming.reference} · {formatPrice(upcoming.amount)}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link to="/bookings">View bookings</Link>
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
