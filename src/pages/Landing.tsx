import { iconForSubject } from "@/components/student-os/subject-icons";
import { StudentOsLogo } from "@/components/student-os/StudentOsLogo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { CATALOG_TOTAL_ITEMS, SYLLABUS } from "@/lib/student-os/syllabus";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Gauge,
  LayoutGrid,
  ListChecks,
  Save,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

/** Subtle scroll-in wrapper used across the page. */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const PHILOSOPHY = [
  { name: "Goal", copy: "Define the outcome that actually matters to you." },
  { name: "Plan", copy: "Organize the syllabus you have to conquer." },
  { name: "Study", copy: "Work through checklists, one item at a time." },
  { name: "Progress", copy: "Watch real percentages move as you complete." },
  { name: "Achievement", copy: "Arrive knowing the work was earned." },
];

const FEATURES: Array<{
  icon: LucideIcon;
  title: string;
  copy: string;
}> = [
  {
    icon: Target,
    title: "Goal onboarding",
    copy: "Your goal, target, exam, level, curriculum, and subjects — captured once, then displayed everywhere.",
  },
  {
    icon: ListChecks,
    title: "Itemized syllabus",
    copy: `${CATALOG_TOTAL_ITEMS} individually trackable items across Physics, Chemistry, Higher Mathematics, and Biology.`,
  },
  {
    icon: Gauge,
    title: "Honest progress",
    copy: "Percentages come from real item counts — recalculated the moment you check something off.",
  },
  {
    icon: LayoutGrid,
    title: "Resource catalog",
    copy: "Browse and search courses, guides, and sessions — or publish your own content for other students.",
  },
  {
    icon: CalendarCheck,
    title: "Book and check out",
    copy: "Schedule a session at a time that suits you and complete checkout in one short, simple flow.",
  },
  {
    icon: Save,
    title: "Saved on this device",
    copy: "Your profile, progress, and bookings survive refreshes, behind a storage layer ready for a database later.",
  },
];

/** New users flow into onboarding; returning users are bounced there to the dashboard. */
const CTA_PATH = "/auth?returnTo=/onboarding";

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <StudentOsLogo className="size-6 rounded-md" />
            <span className="text-sm font-bold tracking-tight">Student OS V1</span>
          </Link>

          <nav
            className="hidden items-center gap-6 md:flex"
            aria-label="Landing page"
          >
            <a
              href="#how"
              className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              How it works
            </a>
            <a
              href="#syllabus"
              className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Syllabus
            </a>
            <Link
              to="/catalog"
              className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Catalog
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button className="cursor-pointer" asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="hidden cursor-pointer sm:inline-flex"
                  asChild
                >
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button className="cursor-pointer" asChild>
                  <Link to={CTA_PATH}>
                    Let&apos;s Begin
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="max-w-xl"
          >
            <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              All-in-one academic companion
            </span>
            <h1 className="mt-5 text-4xl leading-[1.06] font-bold tracking-tight sm:text-5xl">
              Turn a long-term goal into measurable progress.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Your all-in-one companion for the academic journey — and the
              lifelong path to achievement that follows it.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="cursor-pointer" asChild>
                <Link to={CTA_PATH}>
                  Let&apos;s Begin
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="cursor-pointer" asChild>
                <a href="#syllabus">See the syllabus</a>
              </Button>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden />
                {CATALOG_TOTAL_ITEMS} trackable items
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden />
                4 PCMB subjects
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden />
                Clean, simple, comfortable to use
              </li>
            </ul>
          </motion.div>

          {/* Dashboard preview — real structure, honest zero state */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          >
            <div className="rounded-2xl border bg-card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold tracking-tight">
                    Overall Syllabus Progress
                  </p>
                  <p className="text-sm text-muted-foreground">
                    PCMB 1st Paper
                  </p>
                </div>
                <span className="text-3xl leading-none font-bold tracking-tight tabular-nums text-primary">
                  0%
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <Progress
                  value={0}
                  aria-label="Overall syllabus progress preview"
                  className="h-2.5 bg-primary/15"
                />
                <p className="text-sm text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">
                    0 / {CATALOG_TOTAL_ITEMS}
                  </span>{" "}
                  items completed
                </p>
              </div>

              <div className="mt-5 space-y-3 border-t pt-5">
                {SYLLABUS.map((subject) => {
                  const Icon = iconForSubject(subject.id);
                  return (
                    <div
                      key={subject.id}
                      className="flex items-center gap-3"
                    >
                      <span
                        aria-hidden
                        className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-xs font-medium">
                            {subject.name}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            0 / {subject.totalItems}
                          </p>
                        </div>
                        <Progress
                          value={0}
                          aria-hidden
                          className="mt-1.5 h-1.5 bg-primary/15"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
                You start at zero — every percent after this is earned.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Operating principle */}
      <section id="how" className="border-b bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              The operating principle
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Goal → Plan → Study → Progress → Achievement
            </h2>
          </Reveal>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PHILOSOPHY.map((step, index) => (
              <Reveal key={step.name} delay={index * 0.05}>
                <li className="h-full rounded-xl border bg-card p-4">
                  <span className="text-xs font-semibold text-primary tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-1.5 text-sm font-semibold tracking-tight">
                    {step.name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {step.copy}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <Reveal className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              One companion for the whole academic journey
            </h2>
            <p className="mt-3 text-muted-foreground">
              Student OS V1 is the companion we provide to our customers —
              everything an academic journey needs, kept deliberately simple and
              comfortable so any student can pick it up and use it right away.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.06} className="h-full">
                <div className="h-full rounded-xl border bg-card p-5">
                  <span
                    aria-hidden
                    className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"
                  >
                    <feature.icon className="size-4" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.copy}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* The two questions */}
      <section className="border-b bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <div className="h-full rounded-2xl border bg-card p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                Question one
              </p>
              <p className="mt-3 text-2xl font-bold tracking-tight">
                “What am I trying to achieve?”
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Your goal, target, and exam sit at the very top of your
                dashboard — the first thing you see every time you open
                Student OS V1.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="h-full rounded-2xl border bg-card p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                Question two
              </p>
              <p className="mt-3 text-2xl font-bold tracking-tight">
                “How much of my syllabus have I completed?”
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                One live percentage, calculated from every trackable item —
                never estimated, never faked, updated the instant you check
                something off.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Syllabus coverage */}
      <section id="syllabus" className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Included out of the box
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                PCMB 1st Paper, fully itemized
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every numbered item, chapter, and page range is its own
                checkbox — no invented topic names, just your syllabus
                organized for tracking.
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-4xl leading-none font-bold tracking-tight tabular-nums text-primary">
                {CATALOG_TOTAL_ITEMS}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                trackable items
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-8 overflow-hidden rounded-xl border bg-card">
              {SYLLABUS.map((subject) => {
                const Icon = iconForSubject(subject.id);
                return (
                  <div
                    key={subject.id}
                    className="flex flex-wrap items-center gap-4 border-b px-5 py-4 last:border-b-0"
                  >
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold tracking-tight">
                        {subject.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {subject.chapters.length} chapters · {subject.paper}
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">
                      {subject.totalItems} items
                    </p>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              You already know your goal. See exactly where you stand.
            </h2>
            <p className="mt-3 text-primary-foreground/80">
              Setup takes under a minute — your first checklist is waiting.
            </p>
            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                className="cursor-pointer bg-background text-primary hover:bg-background/90"
                asChild
              >
                <Link to={CTA_PATH}>
                  Start My Journey
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <StudentOsLogo className="size-6 rounded-md" />
            <span className="text-sm font-bold tracking-tight">Student OS V1</span>
            <span className="text-xs text-muted-foreground">Foundation</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Goal → Plan → Study → Progress → Achievement
          </p>
        </div>
      </footer>
    </div>
  );
}
