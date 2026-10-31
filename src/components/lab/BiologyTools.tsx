/**
 * Biology lab tools (application-owned components).
 *
 * The cell-transport lab animates the pure random walk in
 * `src/lib/lab/transport.ts`: every particle on screen is advanced by that
 * code (fixed 0.02 s ticks, seeded PRNG), so the movement, the chamber counts
 * and the readouts always agree, and a sealed membrane really holds its
 * gradient because the rules — not a scripted animation — decide each pass.
 *
 * No AI-generated code ever reaches these components.
 */

import { useEffect, useState, type ComponentType } from "react";
import {
  TRANSPORT_ASSUMPTIONS,
  WORLD,
  advanceTransport,
  contactProbability,
  initTransport,
  netDirection,
  sideCounts,
  transportRng,
  type TransportParams,
  type TransportState,
} from "@/lib/lab/transport";
import {
  Equations,
  ModelLimits,
  Readout,
  ReadoutGrid,
  SimLayout,
  SimSegmented,
  SimSlider,
  SimTitle,
  SimTransport,
  fmt,
  useSimClock,
} from "./framework";

/** Fixed seed: the same experiment always traces the same walk. */
const SEED = 42;
/** Simulated seconds before the run loops back to the start. */
const T_END = 90;

interface Run {
  state: TransportState;
  rand: () => number;
  lastT: number;
  /** Recomputed whenever the seeded counts change (fresh layout). */
  countsKey: string;
}

function makeRun(left: number, right: number): Run {
  const params: TransportParams = { left, right, permeability: 0, temperature: 1, channels: false, seed: SEED };
  return {
    state: initTransport(params),
    rand: transportRng(SEED),
    lastT: 0,
    countsKey: `${left}x${right}`,
  };
}

/* -------------------------------------------------------------------------- */
/* 1. Cell-membrane transport                                                 */
/* -------------------------------------------------------------------------- */

export function CellTransportLab() {
  const [left, setLeft] = useState(40);
  const [right, setRight] = useState(10);
  const [permeability, setPermeability] = useState(0.6);
  const [temperature, setTemperature] = useState(1);
  const [channels, setChannels] = useState(false);
  const clock = useSimClock(T_END);

  const [run, setRun] = useState<Run>(() => makeRun(40, 10));

  // Advance the walk to the current simulation time. The updater is
  // idempotent per time value (dt = 0 returns the previous run), so React's
  // StrictMode double-invocation can never double-step the particles.
  useEffect(() => {
    setRun((previous) => {
      const key = `${left}x${right}`;
      const params: TransportParams = { left, right, permeability, temperature, channels, seed: SEED };
      if (key !== previous.countsKey) {
        // New setup (different seeded counts) — start the layout fresh.
        return {
          state: initTransport(params),
          rand: transportRng(SEED),
          lastT: clock.t,
          countsKey: key,
        };
      }
      const dt = clock.t - previous.lastT;
      if (dt < 0) {
        // The clock looped back to zero — restart the run.
        return {
          state: initTransport(params),
          rand: transportRng(SEED),
          lastT: clock.t,
          countsKey: key,
        };
      }
      if (dt === 0) return previous;
      return {
        state: advanceTransport(previous.state, params, dt, previous.rand),
        rand: previous.rand,
        lastT: clock.t,
        countsKey: key,
      };
    });
  }, [clock.t, left, right, permeability, temperature, channels]);

  const counts = sideCounts(run.state);
  const difference = counts.left - counts.right;
  const nearEquilibrium = Math.abs(difference) <= 2;
  const pContact = contactProbability({ left, right, permeability, temperature, channels, seed: SEED });

  return (
    <div className="space-y-4">
      <SimTitle
        title="Cell transport — diffusion across a membrane"
        subtitle="Solute particles random-walk between two compartments. Change the concentrations, seal or open the membrane, then press Play and watch which way the traffic flows."
      />
      <SimLayout
        controls={
          <>
            <SimSlider
              label="Compartment A particles"
              value={left}
              min={0}
              max={60}
              step={1}
              digits={0}
              onChange={setLeft}
            />
            <SimSlider
              label="Compartment B particles"
              value={right}
              min={0}
              max={60}
              step={1}
              digits={0}
              onChange={setRight}
            />
            <SimSlider
              label="Membrane permeability"
              value={Math.round(permeability * 100)}
              min={0}
              max={100}
              step={5}
              unit="%"
              digits={0}
              onChange={(value) => setPermeability(value / 100)}
            />
            <SimSlider
              label="Temperature (particle speed)"
              value={temperature}
              min={0.4}
              max={2}
              step={0.1}
              unit="×"
              digits={1}
              onChange={setTemperature}
            />
            <SimSegmented
              label="Channel proteins"
              value={channels ? "on" : "off"}
              options={[
                { value: "on", label: "Present" },
                { value: "off", label: "Absent" },
              ]}
              onChange={(value) => setChannels(value === "on")}
            />
            <SimTransport
              playing={clock.playing}
              onToggle={clock.toggle}
              onReset={clock.reset}
              onStep={() => clock.step(0.5)}
              hint={`t = ${fmt(clock.t, 1)} s`}
            />
            <button
              type="button"
              onClick={() => {
                clock.reset();
                setRun(makeRun(left, right));
              }}
              className="w-full cursor-pointer rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Re-seed the chambers (fresh layout)
            </button>
            <p className="rounded-lg border border-dashed px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Challenge:</span> set A to 40 and B to 10,
              seal the membrane (0 %) and press Play — nothing crosses. Open it to 60 % and predict
              roughly how long until both sides sit near 25. Then add channels and compare.
            </p>
          </>
        }
      >
        <figure className="min-w-0">
          <svg
            viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
            className="h-auto w-full rounded-lg border bg-card"
            role="img"
            aria-label={`Two compartments separated by a membrane: ${counts.left} particles on the left, ${counts.right} on the right, ${permeability === 0 ? "membrane sealed" : `permeability ${Math.round(permeability * 100)} percent`}`}
          >
            {/* chambers */}
            <rect x={0} y={0} width={WORLD.membraneX} height={WORLD.height} className="fill-muted/40" />
            <rect x={WORLD.membraneX} y={0} width={WORLD.membraneX} height={WORLD.height} className="fill-muted/20" />
            {/* membrane band */}
            <rect
              x={WORLD.membraneX - WORLD.band}
              y={0}
              width={WORLD.band * 2}
              height={WORLD.height}
              className="fill-border/50"
            />
            {/* phospholipid heads: two columns of dots along the band */}
            {Array.from({ length: 25 }, (_, i) => 2 + i * 4).map((y) => (
              <g key={`head-${y}`}>
                <circle cx={WORLD.membraneX - WORLD.band + 0.7} cy={y} r={0.9} className="fill-foreground/70" />
                <circle cx={WORLD.membraneX + WORLD.band - 0.7} cy={y} r={0.9} className="fill-foreground/70" />
                <line
                  x1={WORLD.membraneX - WORLD.band + 1.6}
                  y1={y}
                  x2={WORLD.membraneX + WORLD.band - 1.6}
                  y2={y}
                  className="stroke-foreground/40"
                  strokeWidth={0.5}
                />
              </g>
            ))}
            {/* channel proteins (three gated pores through the bilayer) */}
            {channels
              ? [22, 50, 78].map((cy) => (
                  <g key={`channel-${cy}`}>
                    <rect
                      x={WORLD.membraneX - WORLD.band - 0.6}
                      y={cy - 3}
                      width={WORLD.band * 2 + 1.2}
                      height={6}
                      rx={2}
                      className="fill-amber-500/80"
                    />
                    <rect
                      x={WORLD.membraneX - 1.1}
                      y={cy - 1.6}
                      width={2.2}
                      height={3.2}
                      rx={1}
                      className="fill-card"
                    />
                  </g>
                ))
              : null}
            {/* net-flow arrow while a gradient exists */}
            {difference !== 0 ? (
              <g className={difference > 0 ? "stroke-emerald-500" : "stroke-emerald-500"}>
                <line
                  x1={difference > 0 ? 34 : 66}
                  y1={7}
                  x2={difference > 0 ? 66 : 34}
                  y2={7}
                  strokeWidth={1.6}
                  markerEnd="url(#net-arrow)"
                />
                <defs>
                  <marker id="net-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" className="fill-emerald-500" />
                  </marker>
                </defs>
                <text x={50} y={4} textAnchor="middle" fontSize={3} className="fill-emerald-600 dark:fill-emerald-400">
                  net flow
                </text>
              </g>
            ) : null}
            {/* particles */}
            {run.state.particles.map((particle, index) => (
              <circle
                key={index}
                cx={particle.x}
                cy={particle.y}
                r={1.6}
                className="fill-sky-500 stroke-sky-700/40"
                strokeWidth={0.3}
              />
            ))}
            {/* labels */}
            <text x={3} y={5.5} fontSize={3.6} className="fill-foreground font-semibold">
              A — {counts.left}
            </text>
            <text x={WORLD.width - 3} y={5.5} textAnchor="end" fontSize={3.6} className="fill-foreground font-semibold">
              B — {counts.right}
            </text>
            <text x={WORLD.membraneX} y={WORLD.height - 1.5} textAnchor="middle" fontSize={3} className="fill-muted-foreground">
              phospholipid bilayer{channels ? " with channels" : ""}
            </text>
          </svg>
          <figcaption className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-sky-500" /> solute particle
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-foreground/70" /> membrane
            </span>
            {channels ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-sm bg-amber-500" /> channel protein
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-emerald-500" /> net flow
            </span>
          </figcaption>
        </figure>

        <ReadoutGrid>
          <Readout label="Compartment A" value={String(counts.left)} unit="particles" />
          <Readout label="Compartment B" value={String(counts.right)} unit="particles" />
          <Readout
            label="Balance"
            value={nearEquilibrium ? "≈ equal (dynamic equilibrium)" : `${Math.abs(difference)} apart`}
            tone={nearEquilibrium ? "good" : "default"}
          />
          <Readout label="Net transport" value={netDirection(counts)} />
          <Readout label="Cross chance per contact" value={fmt(pContact * 100, 0)} unit="%" />
          <Readout label="Elapsed" value={fmt(clock.t, 1)} unit="s" />
        </ReadoutGrid>

        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Why it happens:</span>{" "}
          {permeability === 0
            ? "the membrane is sealed — particles reach it and bounce back, so the counts never change no matter how long you wait."
            : nearEquilibrium
              ? "both sides now hit the membrane equally often, so particles cross in both directions at about the same rate — this is dynamic equilibrium (they never stop moving)."
              : "particles on the crowded side touch the membrane more often, so more of them get through per second — net flow runs from the crowded side toward the empty one."}
        </p>

        <Equations>
          <span>net flow ∝ permeability × (contacts from A − contacts from B)</span>
          <span>no energy input — transport stops only when both directions balance</span>
        </Equations>
        <ModelLimits assumptions={TRANSPORT_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export type BioToolKind = "transport";

export interface BioToolEntry {
  kind: BioToolKind;
  title: string;
  subtitle: string;
  Component: ComponentType;
}

export const BIO_TOOLS: readonly BioToolEntry[] = [
  {
    kind: "transport",
    title: "Cell transport",
    subtitle: "Diffusion across a membrane — concentrations, permeability and channel proteins",
    Component: CellTransportLab,
  },
];
