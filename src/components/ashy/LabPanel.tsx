/**
 * LabPanel — the chat affordance behind Ashy's `[[lab: …]]` markers and the
 * deterministic intent router (Issue 2).
 *
 * Renders ONLY application-owned lab tools, and only for a spec that passes
 * `validateLabSpec` right here: stored message rows are re-checked
 * (whitelisted kind, bounded charset-checked text, bundled-molecule lookup)
 * before anything is drawn. There is no path by which AI-generated code
 * reaches this component — the spec is a small, explicit, validated
 * structure or nothing renders.
 *
 * The registry is reused from the lab-tools host: the same PHYSICS_SIMS /
 * CHEM_TOOLS / MoleculeViewer components that render at `/labs/lab-tools`,
 * so a chat-launched tool is literally the same tested component.
 *
 * The chat itself never depends on it: a normal answer renders identically
 * whether or not a tool is attached.
 */

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PHYSICS_SIMS } from "@/components/lab/PhysicsSims";
import { CHEM_TOOLS } from "@/components/lab/ChemTools";
import { MoleculeViewer } from "@/components/lab/MoleculeViewer";
import { labToolId, validateLabSpec } from "@/lib/ashy-lab";
import type { AshyLab } from "@/lib/ashy";

/** Chemistry spec type → the CHEM_TOOLS registry kind it opens. */
const CHEM_KIND_FOR_SPEC = {
  balance: "balance",
  moles: "quantities",
  lewis: "structure",
  equilibrium: "equilibrium",
} as const satisfies Partial<Record<AshyLab["type"], (typeof CHEM_TOOLS)[number]["kind"]>>;

export function LabPanel({ lab }: { lab: AshyLab | undefined }) {
  // Re-validated on every render path (never trusted from a stored row);
  // an invalid or unsupported spec renders nothing at all.
  const valid = validateLabSpec(lab);
  const [open, setOpen] = useState(true);
  if (!valid) return null;

  const id = labToolId(valid);
  const isSim = valid.type === "sim";
  const simEntry = isSim
    ? PHYSICS_SIMS.find((entry) => entry.kind === valid.kind)
    : undefined;
  const chemEntry =
    valid.type === "balance" ||
    valid.type === "moles" ||
    valid.type === "lewis" ||
    valid.type === "equilibrium"
      ? CHEM_TOOLS.find((entry) => entry.kind === CHEM_KIND_FOR_SPEC[valid.type])
      : undefined;

  const title = simEntry?.title ?? chemEntry?.title ?? "3D molecular viewer";
  const subtitle =
    simEntry?.subtitle ??
    chemEntry?.subtitle ??
    "Rotatable ball-and-stick model built from published structural parameters";

  const renderTool = () => {
    // The key forces a remount when the spec changes, so a new request
    // (different equation/simulation) always opens in a fresh state.
    if (valid.type === "sim") {
      if (!simEntry) return null;
      const Component = simEntry.Component;
      return <Component key={id} />;
    }
    if (valid.type === "molecule") {
      return <MoleculeViewer key={id} initialFormula={valid.target} />;
    }
    if (!chemEntry) return null;
    const Component = chemEntry.Component;
    if (valid.type === "balance") {
      return <Component key={id} initialEquation={valid.equation} />;
    }
    if (valid.type === "moles") {
      return <Component key={id} initialFormula={valid.formula} />;
    }
    if (valid.type === "lewis") {
      return <Component key={id} initialMode="lewis" initialFormula={valid.formula} />;
    }
    return <Component key={id} />;
  };

  return (
    <div className="my-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-7 cursor-pointer gap-1.5 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <FlaskConical className="size-3.5" aria-hidden />
        Interactive lab · {title}
        <span className="sr-only">
          {open ? " — hide the lab tool" : " — open the lab tool"}
        </span>
      </Button>
      {open ? (
        <div className="mt-2 rounded-xl border bg-card p-3" data-lab-tool={id}>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            {subtitle} — every value below is computed by the app&apos;s own tested
            code from what you enter; nothing here is generated or executed.
          </p>
          {renderTool()}
        </div>
      ) : null}
    </div>
  );
}
