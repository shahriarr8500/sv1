/**
 * ExplorePanel — the chat affordance behind Ashy's "Explore this visually"
 * (Phase 3).
 *
 * Renders ONLY the application-owned explorers below, and only for a spec
 * that passes validation right here: stored message rows are re-checked
 * (finite, bounded numbers; a fully parseable expression) by
 * `validateExploreSpec` before anything is drawn. There is no path by which
 * AI-generated code reaches this component — the spec is a small, explicit,
 * validated structure or nothing renders.
 *
 * The chat itself never depends on it: a normal answer renders identically
 * whether or not a visual is attached.
 */

import { useState } from "react";
import { Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VectorExplorer } from "@/components/ashy/VectorExplorer";
import { FunctionGrapher } from "@/components/ashy/FunctionGrapher";
import { validateExploreSpec } from "@/lib/ashy-graph";
import type { AshyExplore } from "@/lib/ashy";

export function ExplorePanel({ explore }: { explore: AshyExplore | undefined }) {
  const [open, setOpen] = useState(false);
  // Re-validated on every render path (never trusted from a stored row);
  // an invalid spec renders nothing at all.
  const valid = validateExploreSpec(explore);
  if (!valid) return null;

  return (
    <div className="my-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-7 cursor-pointer gap-1.5 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Sigma className="size-3.5" aria-hidden />
        Explore this visually
        <span className="sr-only">
          {open ? " — hide the interactive tool" : " — open the interactive tool"}
        </span>
      </Button>
      {open ? (
        <div className="mt-2 rounded-xl border bg-card p-3">
          {valid.type === "vectors" ? (
            <VectorExplorer
              initial={{ ax: valid.ax, ay: valid.ay, bx: valid.bx, by: valid.by }}
            />
          ) : (
            <FunctionGrapher initialExpression={valid.expression} />
          )}
        </div>
      ) : null}
    </div>
  );
}
