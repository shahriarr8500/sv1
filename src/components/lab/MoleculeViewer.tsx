/**
 * MoleculeViewer — rotatable 3D models via 3dmol.js (already bundled in the
 * project; no API keys, no network fetches).
 *
 * The ONLY data rendered here comes from `structures.ts`: coordinates built
 * in code from published structural parameters. The viewer never fetches
 * coordinates, never parses model-supplied structure files, and never
 * claims a shape proves how a reaction behaves — that warning is on screen.
 *
 * Interaction: drag to rotate, scroll to zoom (3dmol's built-in controls).
 */

import { useEffect, useRef, useState } from "react";
import {
  MOLECULES,
  findMolecule,
  toMolfile,
  type MoleculeStructure,
} from "./structures";
import { Equations, SimSegmented, SimTitle } from "./framework";

type ViewerStyle = "ball-and-stick" | "stick" | "spacefill";

const STYLE_OPTIONS: { value: ViewerStyle; label: string }[] = [
  { value: "ball-and-stick", label: "Ball & stick" },
  { value: "stick", label: "Stick" },
  { value: "spacefill", label: "Space-filling" },
];

function styleSpec(style: ViewerStyle): Record<string, unknown> {
  switch (style) {
    case "stick":
      return { stick: { radius: 0.18 }, sphere: { scale: 0 } };
    case "spacefill":
      return { sphere: { scale: 1.0 }, stick: { radius: 0 } };
    case "ball-and-stick":
    default:
      return { stick: { radius: 0.15 }, sphere: { scale: 0.3 } };
  }
}

export function MoleculeViewer({
  initialFormula,
}: {
  /** Optional molecule id/formula/name from Ashy's tool marker (validated). */
  initialFormula?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 3dmol is heavy — load it only when the tool is actually opened.
  const [viewerApi, setViewerApi] = useState<{
    createViewer: (element: HTMLElement, config?: Record<string, unknown>) => MolViewer;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [style, setStyle] = useState<ViewerStyle>("ball-and-stick");
  const [spinning, setSpinning] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const match = initialFormula ? findMolecule(initialFormula) : null;
    return match?.id ?? MOLECULES[0].id;
  });

  const structure: MoleculeStructure =
    MOLECULES.find((molecule) => molecule.id === selectedId) ?? MOLECULES[0];

  const viewerRef = useRef<MolViewer | null>(null);
  const molfile = toMolfile(structure);

  // Load the 3dmol module once, then create the viewer against the div.
  useEffect(() => {
    let cancelled = false;
    let created: MolViewer | null = null;
    void (async () => {
      try {
        const mod = (await import("3dmol")) as unknown as {
          createViewer: (element: HTMLElement, config?: Record<string, unknown>) => MolViewer;
        };
        if (cancelled || !containerRef.current) return;
        setViewerApi(mod);
        created = mod.createViewer(containerRef.current, {
          backgroundColor: "rgba(0,0,0,0)",
          antialias: true,
        });
        viewerRef.current = created;
      } catch {
        if (!cancelled) setLoadError("The 3D viewer library could not load — the data table below still works.");
      }
    })();
    return () => {
      cancelled = true;
      if (created) {
        try {
          created.removeAllModels();
        } catch {
          // viewer already torn down — nothing to do
        }
      }
      if (containerRef.current) containerRef.current.innerHTML = "";
      viewerRef.current = null;
    };
  }, []);

  // (Re)load the structure whenever the selection or style changes.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      viewer.removeAllModels();
      viewer.addModel(molfile, "mol");
      viewer.setStyle({}, styleSpec(style) as never);
      viewer.zoomTo();
      viewer.render();
    } catch {
      setLoadError("This structure could not be drawn — see the parameters below.");
    }
  }, [viewerApi, molfile, style]);

  // Spin toggle (mouse drag always overrides while spinning is off).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      if (spinning) viewer.spin("y", 0.6);
      else viewer.spin(false);
    } catch {
      // spin is cosmetic — ignore failures
    }
  }, [spinning, viewerApi]);

  // Keep the canvas sized to its container.
  useEffect(() => {
    const container = containerRef.current;
    const viewer = viewerRef.current;
    if (!container || !viewer) return;
    const observer = new ResizeObserver(() => {
      try {
        viewer.resize();
        viewer.render();
      } catch {
        // ignore mid-teardown resize errors
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [viewerApi]);

  return (
    <div className="space-y-4">
      <SimTitle
        title="Molecular shapes in 3D"
        subtitle="Drag to rotate, scroll to zoom. Every model is built from published structural parameters bundled with the app."
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Molecule</span>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="block w-56 cursor-pointer rounded-lg border bg-card px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {MOLECULES.map((molecule) => (
              <option key={molecule.id} value={molecule.id}>
                {molecule.name} ({molecule.formula})
              </option>
            ))}
          </select>
        </label>
        <SimSegmented label="Style" value={style} options={STYLE_OPTIONS} onChange={setStyle} />
        <SimSegmented
          label="Auto-spin"
          value={spinning ? "on" : "off"}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
          onChange={(next) => setSpinning(next === "on")}
        />
      </div>

      <div
        ref={containerRef}
        className="h-[300px] w-full rounded-lg border bg-card sm:h-[360px]"
        role="img"
        aria-label={`Rotatable 3D model of ${structure.name}`}
      />
      {loadError ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {loadError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Equations title="Geometry used">
          <span>{structure.geometry}</span>
          <span className="font-sans text-[11px] leading-relaxed text-muted-foreground">{structure.source}</span>
        </Equations>
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Atoms in this model</p>
          <p className="mt-1.5 font-mono text-xs">
            {structure.formula} · {structure.atoms.length} atoms · {structure.bonds.length} bonds
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            A shape is a picture, not proof: it cannot tell you whether a reaction occurs, how fast it
            goes, or what it produces. Those questions need experiments and energetics.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Minimal structural type for the 3dmol viewer (avoids depending on their generics). */
interface MolViewer {
  addModel(data: string, format: string): unknown;
  removeAllModels(): unknown;
  setStyle(sel: unknown, style: unknown): unknown;
  zoomTo(): unknown;
  render(): unknown;
  resize(): unknown;
  spin(axis: string | false, speed?: number): unknown;
}
