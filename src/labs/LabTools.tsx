/**
 * Lab tools host — `/labs/lab-tools`.
 *
 * One page for the four-subject learning lab: Mathematics, Physics, Biology
 * and Chemistry. Every tool is an application-owned component over the pure
 * engines in `src/lib/lab/*` — inputs are parsed/validated by that code, and
 * no AI-generated code is ever executed here.
 */

import { useState, type ComponentType } from "react";
import { MATH_TOOLS } from "@/components/lab/MathTools";
import { PHYSICS_SIMS } from "@/components/lab/PhysicsSims";
import { BIO_TOOLS } from "@/components/lab/BiologyTools";
import { CHEM_TOOLS } from "@/components/lab/ChemTools";
import { MoleculeViewer } from "@/components/lab/MoleculeViewer";

interface ToolEntry {
  id: string;
  title: string;
  subtitle: string;
  Component: ComponentType;
}

const GROUPS: readonly { name: string; blurb: string; entries: readonly ToolEntry[] }[] = [
  {
    name: "Mathematics",
    blurb: "Manipulable mathematical objects — drag them and every equation, feature and readout is recomputed exactly.",
    entries: MATH_TOOLS.map((entry) => ({
      id: `math-${entry.kind}`,
      title: entry.title,
      subtitle: entry.subtitle,
      Component: entry.Component,
    })),
  },
  {
    name: "Physics",
    blurb: "Animated simulations — moving objects in a scene, every frame a pure function of the controls and the simulation clock.",
    entries: PHYSICS_SIMS.map((entry) => ({
      id: `physics-${entry.kind}`,
      title: entry.title,
      subtitle: entry.subtitle,
      Component: entry.Component,
    })),
  },
  {
    name: "Biology",
    blurb: "Simplified interactive models of living systems — the assumptions each one makes are stated right in the tool.",
    entries: BIO_TOOLS.map((entry) => ({
      id: `bio-${entry.kind}`,
      title: entry.title,
      subtitle: entry.subtitle,
      Component: entry.Component,
    })),
  },
  {
    name: "Chemistry",
    blurb: "Exact calculators plus 3D structures — equations, quantities and equilibrium come from tested code, not guesses.",
    entries: [
      ...CHEM_TOOLS.map((entry) => ({
        id: `chem-${entry.kind}`,
        title: entry.title,
        subtitle: entry.subtitle,
        Component: entry.Component,
      })),
      {
        id: "molecules-3d",
        title: "3D molecular viewer",
        subtitle: "Ball-and-stick, stick and space-filling models of small molecules",
        Component: MoleculeViewer as ComponentType,
      },
    ],
  },
];

const ALL_TOOLS: readonly ToolEntry[] = GROUPS.flatMap((group) => group.entries);

export default function LabTools() {
  const [selectedId, setSelectedId] = useState(ALL_TOOLS[0].id);
  const active = ALL_TOOLS.find((tool) => tool.id === selectedId) ?? ALL_TOOLS[0];
  const Active = active.Component;

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Four subjects, one lab: drag, press and tune the controls and every number, curve and
        moving object below is recomputed by the app&apos;s own deterministic code — invalid input is
        rejected with an explanation, never executed. Each tool also states what its model leaves
        out, so an educational approximation is never mistaken for a real-world prediction.
      </p>

      <div className="space-y-4">
        {GROUPS.map((group) => (
          <section key={group.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">{group.name}</h2>
              <p className="text-[11px] text-muted-foreground">{group.blurb}</p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.entries.map((entry) => {
                const selected = entry.id === selectedId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedId(entry.id)}
                    className={`cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      selected
                        ? "border-primary bg-accent shadow-sm"
                        : "bg-card hover:bg-accent/60"
                    }`}
                  >
                    <p className="text-xs font-semibold tracking-tight">{entry.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {entry.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <Active />
      </div>
    </div>
  );
}
