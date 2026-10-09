/**
 * Home — the daily command center.
 *
 * Hierarchy, top to bottom:
 *   1. Greeting + goal + streak/level (compact)
 *   2. Today's main mission + mission progress
 *   3. Daily Guidance (+ AI summary)
 *   4. Continue studying
 *   5. Syllabus summary
 *   6. Secondary: streak/level detail, bookings, recent activity
 *
 * Everything on this page is computed from the student's real state —
 * no invented missions, percentages, or recommendations.
 */

import React from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useBookings } from "@/state/workspace";
import { formatPrice } from "@/lib/student-os/catalog";
import { formatBookingDate } from "@/lib/student-os/format";
import { CalendarCheck, Sparkles } from "lucide-react";
import type { Subject } from "@/lib/student-os/types";

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-8 w-40" />
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
          <Skeleton className="h-32 w-full rounded-xl" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-xl border bg-card" />
        <Skeleton className="h-24 rounded-xl border bg-card" />
      </div>

      <section aria-labelledby="loading-syllabus-heading" className="space-y-4">
        <Skeleton className="h-5 w-36" />
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
        <Skeleton className="h-32 rounded-xl border bg-card" />
        <Skeleton className="h-32 rounded-xl border bg-card" />
        <RecentProgress entries={[]} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { profile, completions, isStateLoading } = useStudentOS();
  const selectedSubjects = useSelectedSubjects();
  const overall = React.useMemo(
    () => calculateOverallProgress(selectedSubjects, completions),
    [selectedSubjects, completions],
  );

  const subjectSummaries = React.useMemo(
    () =>
      selectedSubjects.map((subject: Subject) =>
        calculateSubjectProgress(subject, completions),
      ),
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

  const bookings = useBookings();
  const upcoming = React.useMemo(
    () => bookings.find((booking) => booking.status === "confirmed") ?? null,
    [bookings],
  );

  if (isStateLoading) return <LoadingFallback />;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 1–2. Greeting, goal, streak, level */}
      <WelcomeHeader />

      {/* 3–4. Today's main mission + progress */}
      <StudentOSTargetsErrorBoundary>
        <TodayMissions />
      </StudentOSTargetsErrorBoundary>

      {/* 5. Daily Guidance + AI summary — items-start so neither card is
          stretched to its row's height; content decides the height. */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <DailyGuidance />
        <DailyBriefing />
      </div>

      {/* Secondary entry point — never louder than the mission.
          One continuous sentence that wraps, with the link on its own stable
          spot: [icon] [text] [link], stacked cleanly on narrow screens. */}
      <Link
        to="/ashy"
        className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      >
        <span className="flex min-w-0 items-start gap-2 text-sm break-words text-muted-foreground">
          <span
            aria-hidden
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
          >
            <Sparkles className="size-3.5" />
          </span>
          <span className="min-w-0">
            Stuck on something? Ask{" "}
            <span className="font-medium text-foreground">Ashy</span>, your
            study assistant.
          </span>
        </span>
        <span className="shrink-0 pl-8 text-xs font-medium text-primary sm:pl-0">
          Ask Ashy →
        </span>
      </Link>

      {/* 6. Continue studying */}
      <ContinueStudying next={next} subjects={selectedSubjects} />

      {/* 7. Syllabus summary */}
      <section aria-labelledby="syllabus-progress-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="syllabus-progress-heading"
            className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            Syllabus
          </h2>
          <Link
            to="/syllabus"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Open syllabus →
          </Link>
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
      </section>

      {/* Secondary: gamification detail + bookings + recent */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StreakStrip />
        <LevelCard />
      </div>

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
                <CardTitle className="text-xs">
                  <Link
                    to="/bookings"
                    className="font-medium text-primary hover:underline"
                  >
                    View bookings →
                  </Link>
                </CardTitle>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
        <RecentProgress entries={recent} />
      </div>
    </div>
  );
}
