/**
 * Sandbox shell — `/labs` lists every experiment, `/labs/:feature` renders one.
 *
 * This route is deliberately absent from the navigation, so nothing here is
 * reachable unless someone types the URL. Experiments render against mock data
 * and never write to `student-os:v1`, Convex, or any real store, so trying an
 * idea here cannot touch the working project.
 */

import { LABS } from "@/lib/labs";
import { ArrowLeft, FlaskConical } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link, useParams } from "react-router";
import StreakHeatmap from "./streak-heatmap";

interface LabEntry {
  slug: string;
  title: string;
  description: string;
  /** Flag that promotes this experiment into a real screen. */
  flag: keyof typeof LABS;
  Component: ComponentType;
}

/** Add a row here whenever you copy `streak-heatmap.tsx` into a new experiment. */
const LABS_INDEX: LabEntry[] = [
  {
    slug: "streak-heatmap",
    title: "Study streak heatmap",
    description:
      "GitHub-style contribution grid showing when you studied over the last 18 weeks.",
    flag: "streakHeatmap",
    Component: StreakHeatmap,
  },
];

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-primary">
            <FlaskConical className="size-4" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Link
          to="/"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
          Back to app
        </Link>
      </div>

      <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
        Sandbox — this route is not linked from anywhere in the app. Experiments
        render on mock data and never read or write your saved progress.
      </p>

      {children}
    </main>
  );
}

export default function Labs() {
  const { feature } = useParams();
  const entry = LABS_INDEX.find((candidate) => candidate.slug === feature);

  // Typed a slug that doesn't exist — fall back to the index rather than 404,
  // so a mistyped URL still shows what is available.
  if (feature !== undefined && entry === undefined) {
    return (
      <Shell title="Labs" subtitle={`No experiment at "/labs/${feature}".`}>
        <IndexList />
      </Shell>
    );
  }

  if (entry === undefined) {
    return (
      <Shell
        title="Labs"
        subtitle="Experiments that aren't wired into the app yet."
      >
        <IndexList />
      </Shell>
    );
  }

  const { Component } = entry;
  return (
    <Shell title={entry.title} subtitle={entry.description}>
      <Component />
      <p className="text-xs text-muted-foreground">
        Flag{" "}
        <code className="rounded bg-muted px-1 py-0.5">LABS.{entry.flag}</code>{" "}
        is currently{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          {String(LABS[entry.flag])}
        </code>{" "}
        — it controls whether this renders inside the real dashboard.
      </p>
    </Shell>
  );
}

function IndexList() {
  if (LABS_INDEX.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No experiments yet. Copy{" "}
        <code className="rounded bg-muted px-1 py-0.5">streak-heatmap.tsx</code>{" "}
        and add a row to{" "}
        <code className="rounded bg-muted px-1 py-0.5">LABS_INDEX</code>.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {LABS_INDEX.map((entry) => (
        <Link
          key={entry.slug}
          to={`/labs/${entry.slug}`}
          className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold tracking-tight">
              {entry.title}
            </p>
            <span className="rounded-lg border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              LABS.{entry.flag} = {String(LABS[entry.flag])}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.description}
          </p>
          <p className="mt-2 text-xs font-medium text-primary">
            /labs/{entry.slug} →
          </p>
        </Link>
      ))}
    </div>
  );
}
