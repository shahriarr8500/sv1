/**
 * Phase 4 physics simulations (application-owned components).
 *
 * Each simulation pairs the pure engines in `src/lib/lab/physics.ts` with
 * controls, readouts (SI units), animated visuals, the equations being used
 * and the model's stated limits. Every number and every drawn pixel is a
 * function of the control values + the deterministic simulation clock —
 * there is no other source of state, and no AI-generated code involved.
 */

import { useId, useState, type ComponentType } from "react";
import {
  CIRCUIT_ASSUMPTIONS,
  FORCES_ASSUMPTIONS,
  G_EARTH,
  MOTION_ASSUMPTIONS,
  OPTICS_ASSUMPTIONS,
  PROJECTILE_ASSUMPTIONS,
  WAVE_ASSUMPTIONS,
  circuitResult,
  forcesResult,
  lensResult,
  motionAt,
  oscillationAt,
  oscillationResult,
  projectileResult,
  projectileTrajectory,
  sampleMotion,
  sampleWave,
  snellResult,
  waveResult,
  DEG,
  type CircuitMode,
} from "@/lib/lab/physics";
import {
  Equations,
  LinePlot,
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

export type PhysicsSimKind =
  | "motion"
  | "projectile"
  | "forces"
  | "waves"
  | "circuits"
  | "optics";

/* -------------------------------------------------------------------------- */
/* 1. Motion — x–t and v–t graphs                                             */
/* -------------------------------------------------------------------------- */

export function MotionSim() {
  const [x0, setX0] = useState(0);
  const [u, setU] = useState(4);
  const [a, setA] = useState(-1);
  const [tEnd, setTEnd] = useState(8);

  const clock = useSimClock(tEnd);
  const input = { x0, u, a, t: tEnd };
  const state = motionAt({ ...input, t: clock.t });
  const { position, velocity } = sampleMotion(input, tEnd, 80);

  const xValues = position.map((p) => p.y);
  const pad = Math.max(1, (Math.max(...xValues.map(Math.abs)) || 1) * 0.15);

  return (
    <div className="space-y-4">
      <SimTitle
        title="Motion — position–time & velocity–time graphs"
        subtitle="Constant acceleration along a straight line. Drag the playhead with Play to watch both graphs fill in."
      />
      <SimLayout
        controls={
          <>
            <SimSlider label="Starting position x₀" unit="m" value={x0} min={-10} max={10} step={0.5} digits={1} onChange={setX0} />
            <SimSlider label="Initial velocity u" unit="m/s" value={u} min={-10} max={10} step={0.5} digits={1} onChange={setU} />
            <SimSlider label="Acceleration a" unit="m/s²" value={a} min={-6} max={6} step={0.25} digits={2} onChange={setA} />
            <SimSlider label="Run for t" unit="s" value={tEnd} min={1} max={15} step={0.5} digits={1} onChange={setTEnd} />
            <SimTransport
              playing={clock.playing}
              onToggle={clock.toggle}
              onReset={clock.reset}
              hint={`t = ${fmt(clock.t, 2)} s`}
            />
          </>
        }
      >
        <LinePlot
          title="Position–time (x vs t)"
          series={[{ points: position.map((p) => ({ x: p.t, y: p.y })), stroke: "stroke-primary", label: "x(t)" }]}
          xLabel="t (s)"
          yLabel="x (m)"
          markerX={clock.t}
          yDomain={[-Math.max(...xValues.map(Math.abs), 1) - pad, Math.max(...xValues.map(Math.abs), 1) + pad]}
        />
        <LinePlot
          title="Velocity–time (v vs t)"
          series={[{ points: velocity.map((p) => ({ x: p.t, y: p.y })), stroke: "stroke-emerald-500", label: "v(t)" }]}
          xLabel="t (s)"
          yLabel="v (m/s)"
          markerX={clock.t}
        />
        <ReadoutGrid>
          <Readout label="Time" value={fmt(clock.t, 2)} unit="s" />
          <Readout label="Position x" value={fmt(state.x, 2)} unit="m" />
          <Readout label="Velocity v" value={fmt(state.v, 2)} unit="m/s" />
          <Readout label="Acceleration a" value={fmt(a, 2)} unit="m/s²" />
          <Readout
            label="Turning point"
            value={state.turned ? `t = ${fmt(state.turnTime ?? 0, 2)} s` : "none in range"}
            tone={state.turned ? "good" : "default"}
          />
          <Readout label="Motion" value={state.v > 1e-9 ? "moving +x" : state.v < -1e-9 ? "moving −x" : "instantaneously at rest"} />
        </ReadoutGrid>
        <Equations>
          <span>x(t) = x₀ + u·t + ½·a·t²</span>
          <span>v(t) = u + a·t</span>
          <span>turning point: t* = −u/a (when 0 &lt; t* ≤ t)</span>
        </Equations>
        <ModelLimits assumptions={MOTION_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Projectile motion                                                       */
/* -------------------------------------------------------------------------- */

const G_PRESETS = [
  { value: "earth", label: "Earth 9.81", g: 9.81 },
  { value: "moon", label: "Moon 1.62", g: 1.62 },
  { value: "mars", label: "Mars 3.72", g: 3.72 },
  { value: "jupiter", label: "Jupiter 24.79", g: 24.79 },
] as const;

export function ProjectileSim() {
  const [v, setV] = useState(25);
  const [angleDeg, setAngle] = useState(45);
  const [gPreset, setGPreset] = useState<(typeof G_PRESETS)[number]["value"]>("earth");
  const g = G_PRESETS.find((preset) => preset.value === gPreset)?.g ?? G_EARTH;

  const input = { v, angleDeg, g };
  const result = projectileResult(input);
  const trajectory = projectileTrajectory(input, 120);
  const clock = useSimClock(Math.max(0.1, result.timeOfFlight));
  const flight = { x: result.vx * clock.t, y: result.vy * clock.t - 0.5 * g * clock.t * clock.t };

  return (
    <div className="space-y-4">
      <SimTitle
        title="Projectile motion"
        subtitle="Launch angle and speed control the parabola; the marker flies the exact same trajectory the graph plots."
      />
      <SimLayout
        controls={
          <>
            <SimSlider label="Launch speed v" unit="m/s" value={v} min={5} max={80} step={1} digits={0} onChange={setV} />
            <SimSlider label="Launch angle θ" unit="°" value={angleDeg} min={0} max={90} step={1} digits={0} onChange={setAngle} />
            <SimSegmented
              label="Gravity g (m/s²)"
              value={gPreset}
              options={G_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))}
              onChange={setGPreset}
            />
            <SimTransport playing={clock.playing} onToggle={clock.toggle} onReset={clock.reset} hint={`t = ${fmt(clock.t, 2)} s`} />
            <button
              type="button"
              onClick={() => {
                setAngle(45);
                setGPreset("earth");
              }}
              className="w-full cursor-pointer rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Reset to the 45° optimum
            </button>
          </>
        }
      >
        <LinePlot
          title="Trajectory (y vs x)"
          series={[
            { points: trajectory, stroke: "stroke-primary", label: "path" },
            {
              points: [
                { x: flight.x, y: Math.max(0, flight.y) },
                { x: flight.x, y: 0 },
              ],
              stroke: "stroke-primary/50",
              dashed: true,
            },
          ]}
          xLabel="x (m)"
          yLabel="y (m)"
          markerX={flight.x}
          yDomain={[0, Math.max(result.maxHeight * 1.15, 0.5)]}
        />
        <ReadoutGrid>
          <Readout label="vx" value={fmt(result.vx, 2)} unit="m/s" />
          <Readout label="vy" value={fmt(result.vy, 2)} unit="m/s" />
          <Readout label="Range R" value={fmt(result.range, 2)} unit="m" />
          <Readout label="Max height H" value={fmt(result.maxHeight, 2)} unit="m" />
          <Readout label="Flight time T" value={fmt(result.timeOfFlight, 2)} unit="s" />
          <Readout label="Apex at" value={`x = ${fmt(result.apexX, 2)} m, t = ${fmt(result.timeToApex, 2)} s`} />
        </ReadoutGrid>
        {result.isOptimal ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            45° gives the maximum range for this speed on level ground.
          </p>
        ) : null}
        <Equations>
          <span>R = v²·sin(2θ)/g</span>
          <span>H = v²·sin²θ / (2g)</span>
          <span>T = 2·v·sinθ / g</span>
        </Equations>
        <ModelLimits assumptions={PROJECTILE_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Newton's laws — forces on a block                                       */
/* -------------------------------------------------------------------------- */

function Arrow({
  x1,
  y1,
  x2,
  y2,
  label,
  markerId,
  className,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  markerId: string;
  className: string;
}) {
  const shorten = 9;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = (dx / len) * shorten;
  const uy = (dy / len) * shorten;
  return (
    <g>
      <line
        x1={x1 + ux}
        y1={y1 + uy}
        x2={x2 - ux}
        y2={y2 - uy}
        className={className}
        strokeWidth={2.5}
        markerEnd={`url(#${markerId})`}
      />
      {label ? (
        <text x={x2 + Math.sign(dx || 1) * 4} y={y2 - 6} fontSize={11} className="fill-foreground">
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function ForcesSim() {
  const marker = useId();
  const arrowHead = `${marker}-head`;
  const [m, setM] = useState(2);
  const [F, setF] = useState(20);
  const [thetaDeg, setTheta] = useState(0);
  const [mu, setMu] = useState(0.3);

  const result = forcesResult({ m, F, thetaDeg, mu });
  const clock = useSimClock(6);
  const travelled = motionAt({ x0: 0, u: 0, a: result.acceleration, t: clock.t }).x;

  const scale = 90 / Math.max(F, result.weight, 1); // px per newton
  const cx = 240;
  const cy = 120;
  const fxEnd = { x: cx + result.fx * scale, y: cy };
  const fyEnd = { x: cx, y: cy - result.fy * scale };

  return (
    <div className="space-y-4">
      <SimTitle
        title="Newton's laws — a block on a rough surface"
        subtitle="Push at an angle and watch static vs kinetic friction take over — or the block lift off entirely."
      />
      <SimLayout
        controls={
          <>
            <SimSlider label="Mass m" unit="kg" value={m} min={0.5} max={10} step={0.5} digits={1} onChange={setM} />
            <SimSlider label="Push F" unit="N" value={F} min={0} max={120} step={1} digits={0} onChange={setF} />
            <SimSlider label="Push angle θ" unit="°" value={thetaDeg} min={-89} max={89} step={1} digits={0} onChange={setTheta} />
            <SimSlider label="Friction μ" value={mu} min={0} max={1} step={0.05} digits={2} onChange={setMu} />
            <SimTransport playing={clock.playing} onToggle={clock.toggle} onReset={clock.reset} hint="6 s of motion" />
          </>
        }
      >
        <svg viewBox="0 0 520 240" className="h-auto w-full rounded-lg border bg-card" role="img" aria-label="Free-body diagram of the block">
          <defs>
            <marker id={arrowHead} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-foreground" />
            </marker>
          </defs>
          {/* ground */}
          <line x1={20} y1={cy + 40} x2={500} y2={cy + 40} className="stroke-border" strokeWidth={2} />
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} x1={24 + i * 20} y1={cy + 40} x2={16 + i * 20} y2={cy + 48} className="stroke-border" strokeWidth={1} />
          ))}
          {/* block (drifts with the computed motion, resets at the edge) */}
          {(() => {
            const span = 170;
            const blockX = 80 + (((travelled % span) + span) % span);
            const fyPx = result.fy * scale;
            return (
              <g>
                <rect x={blockX} y={cy - 24 - Math.min(28, Math.max(0, fyPx * 0.3))} width={64} height={48} rx={6} className="fill-primary/15 stroke-primary" strokeWidth={1.5} />
                <text x={blockX + 32} y={cy + 4} textAnchor="middle" fontSize={12} className="fill-foreground">{fmt(m, 1)} kg</text>
              </g>
            );
          })()}
          {/* force arrows from the block centre */}
          <Arrow x1={cx} y1={cy} x2={fxEnd.x} y2={fxEnd.y} label={`Fx = ${fmt(result.fx, 1)} N`} markerId={arrowHead} className="stroke-sky-500" />
          <Arrow x1={cx} y1={cy} x2={fyEnd.x} y2={fyEnd.y} label={`Fy = ${fmt(result.fy, 1)} N`} markerId={arrowHead} className="stroke-sky-500" />
          <Arrow x1={cx} y1={cy} x2={cx} y2={cy + result.weight * scale * 0.45} label={`W = ${fmt(result.weight, 1)} N`} markerId={arrowHead} className="stroke-rose-500" />
          <Arrow x1={cx} y1={cy - 30} x2={cx} y2={cy - 30 - result.normal * scale * 0.45} label={`N = ${fmt(result.normal, 1)} N`} markerId={arrowHead} className="stroke-emerald-600" />
          <Arrow x1={cx} y1={cy - 30} x2={cx - result.friction * scale} y2={cy - 30} label={`f = ${fmt(-result.friction, 1)} N`} markerId={arrowHead} className="stroke-amber-500" />
        </svg>
        <ReadoutGrid>
          <Readout label="Weight W = mg" value={fmt(result.weight, 2)} unit="N" />
          <Readout label="Normal N" value={fmt(result.normal, 2)} unit="N" tone={result.lifted ? "warn" : "default"} />
          <Readout label="Friction" value={`${fmt(-result.friction, 2)} N (${result.frictionKind})`} />
          <Readout label="Net force" value={fmt(result.net, 2)} unit="N" />
          <Readout label="Acceleration" value={fmt(result.acceleration, 2)} unit="m/s²" />
          <Readout
            label="Status"
            value={result.lifted ? "Lift-off!" : result.frictionKind === "static" ? "At rest (static)" : "Sliding (kinetic)"}
            tone={result.lifted ? "warn" : result.frictionKind === "kinetic" ? "good" : "default"}
          />
        </ReadoutGrid>
        {result.lifted ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            The upward push now equals the weight — the block lifts off, and this surface model no longer applies.
          </p>
        ) : null}
        <Equations>
          <span>Fx = F·cosθ, Fy = F·sinθ, W = m·g</span>
          <span>static when |Fx| ≤ μ·N (a = 0); kinetic: f = μ·N, a = (Fx ∓ f)/m</span>
        </Equations>
        <ModelLimits assumptions={FORCES_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Waves and oscillations                                                  */
/* -------------------------------------------------------------------------- */

export function WavesSim() {
  const [f, setF] = useState(1.5);
  const [amplitude, setAmplitude] = useState(0.5);
  const [lambda, setLambda] = useState(2);
  const [k, setK] = useState(60);
  const [mass, setMass] = useState(1);
  const [c, setC] = useState(4);

  const wave = { f, A: amplitude, lambda };
  const waveInfo = waveResult(wave);
  const spring = { A: Math.max(0.05, amplitude), k, m: mass, c };
  const springInfo = oscillationResult(spring);
  const clock = useSimClock(Math.max(2, waveInfo.period * 4));

  const xMax = lambda * 4;
  const curve = sampleWave(wave, clock.t, xMax, 120).map((point) => ({ x: point.t, y: point.y }));
  const displacement = oscillationAt(spring, clock.t);

  return (
    <div className="space-y-4">
      <SimTitle
        title="Waves & oscillations"
        subtitle="Left: a travelling wave snapshot that marches right at v = f·λ. Right: a damped mass–spring release."
      />
      <SimLayout
        controls={
          <>
            <SimSlider label="Frequency f" unit="Hz" value={f} min={0.25} max={4} step={0.25} digits={2} onChange={setF} />
            <SimSlider label="Amplitude A" unit="m" value={amplitude} min={0} max={1} step={0.05} digits={2} onChange={setAmplitude} />
            <SimSlider label="Wavelength λ" unit="m" value={lambda} min={0.5} max={4} step={0.25} digits={2} onChange={setLambda} />
            <SimSlider label="Spring constant k" unit="N/m" value={k} min={5} max={200} step={5} digits={0} onChange={setK} />
            <SimSlider label="Mass m" unit="kg" value={mass} min={0.2} max={4} step={0.1} digits={1} onChange={setMass} />
            <SimSlider label="Damping c" unit="N·s/m" value={c} min={0} max={40} step={0.5} digits={1} onChange={setC} />
            <SimTransport playing={clock.playing} onToggle={clock.toggle} onReset={clock.reset} hint={`t = ${fmt(clock.t, 2)} s`} />
          </>
        }
      >
        <LinePlot
          title="Travelling wave y(x, t) at the current instant"
          series={[{ points: curve, stroke: "stroke-primary", label: "y(x, t)" }]}
          xLabel="x (m)"
          yLabel="y (m)"
          yDomain={[-Math.max(amplitude, 0.1) * 1.3, Math.max(amplitude, 0.1) * 1.3]}
        />
        <svg viewBox="0 0 520 130" className="h-auto w-full rounded-lg border bg-card" role="img" aria-label="Mass–spring oscillator">
          <line x1={20} y1={22} x2={500} y2={22} className="stroke-border" strokeWidth={2} />
          {(() => {
            const anchorX = 60;
            const restX = 330;
            const blockX = restX + displacement * 160;
            // Zig-zag spring between the wall and the block.
            const coils = 9;
            const springLen = blockX - anchorX;
            const points: string[] = [];
            for (let i = 0; i <= coils * 2; i += 1) {
              const px = anchorX + (springLen * i) / (coils * 2);
              const py = i === 0 || i === coils * 2 ? 60 : 60 + (i % 2 === 0 ? 12 : -12);
              points.push(`${px.toFixed(1)},${py}`);
            }
            return (
              <g>
                <polyline points={points.join(" ")} fill="none" className="stroke-foreground" strokeWidth={1.5} />
                <rect x={blockX} y={38} width={44} height={44} rx={6} className="fill-primary/15 stroke-primary" strokeWidth={1.5} />
                <text x={blockX + 22} y={65} textAnchor="middle" fontSize={12} className="fill-foreground">{fmt(mass, 1)} kg</text>
                <line x1={restX} y1={92} x2={restX} y2={112} className="stroke-border" strokeDasharray="3 3" />
                <text x={restX} y={126} textAnchor="middle" fontSize={10} className="fill-muted-foreground">equilibrium</text>
              </g>
            );
          })()}
        </svg>
        <ReadoutGrid>
          <Readout label="Wave period T" value={fmt(waveInfo.period, 3)} unit="s" />
          <Readout label="Wave speed v = fλ" value={fmt(waveInfo.speed, 2)} unit="m/s" />
          <Readout label="Angular freq ω = 2πf" value={fmt(waveInfo.angularFrequency, 2)} unit="rad/s" />
          <Readout label="Wave number k = 2π/λ" value={fmt(waveInfo.waveNumber, 2)} unit="rad/m" />
          <Readout label="Spring ω₀ = √(k/m)" value={fmt(springInfo.omega0, 2)} unit="rad/s" />
          <Readout
            label="Damping"
            value={springInfo.mode}
            tone={springInfo.mode === "undamped" ? "default" : "good"}
          />
          <Readout label="Natural period" value={fmt(springInfo.naturalPeriod, 3)} unit="s" />
          <Readout label="Damped period" value={springInfo.dampedPeriod === null ? "—" : fmt(springInfo.dampedPeriod, 3)} unit="s" />
          <Readout label="Displacement x" value={fmt(displacement, 3)} unit="m" />
        </ReadoutGrid>
        <Equations>
          <span>y(x, t) = A·sin(k·x − ω·t), v = f·λ, T = 1/f</span>
          <span>spring: m·x″ + c·x′ + k·x = 0, ω₀ = √(k/m), γ = c/(2m)</span>
        </Equations>
        <ModelLimits assumptions={WAVE_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Electricity — DC circuits                                               */
/* -------------------------------------------------------------------------- */

export function CircuitsSim() {
  const marker = useId();
  const dashId = `${marker}-flow`;
  const [v, setV] = useState(12);
  const [r1, setR1] = useState(4);
  const [r2, setR2] = useState(8);
  const [mode, setMode] = useState<CircuitMode>("series");

  const result = circuitResult({ V: v, R1: r1, R2: r2, mode });
  const clock = useSimClock(4);
  // Dash offset advances with the simulated current — deterministic in t.
  const flowOffset = -(clock.t * (8 + result.iTotal * 6));

  return (
    <div className="space-y-4">
      <SimTitle
        title="DC circuits — series vs parallel"
        subtitle="The dashes drift faster for larger currents. Same battery, two resistors, two very different stories."
      />
      <SimLayout
        controls={
          <>
            <SimSlider label="Battery EMF V" unit="V" value={v} min={1} max={24} step={0.5} digits={1} onChange={setV} />
            <SimSlider label="Resistor R₁" unit="Ω" value={r1} min={1} max={50} step={0.5} digits={1} onChange={setR1} />
            <SimSlider label="Resistor R₂" unit="Ω" value={r2} min={1} max={50} step={0.5} digits={1} onChange={setR2} />
            <SimSegmented
              label="Connection"
              value={mode}
              options={[
                { value: "series", label: "Series" },
                { value: "parallel", label: "Parallel" },
              ]}
              onChange={setMode}
            />
            <SimTransport playing={clock.playing} onToggle={clock.toggle} onReset={clock.reset} hint="current-flow animation" />
          </>
        }
      >
        <svg viewBox="0 0 520 260" className="h-auto w-full rounded-lg border bg-card" role="img" aria-label={`${mode} circuit diagram`}>
          <defs>
            <marker id={dashId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
            </marker>
          </defs>
          {mode === "series" ? (
            <g>
              {/* wire loop */}
              <path d="M90 60 H430 V200 H90 Z" fill="none" className="stroke-border" strokeWidth={2} />
              {/* battery */}
              <line x1={90} y1={112} x2={90} y2={148} className="stroke-foreground" strokeWidth={3} />
              <line x1={78} y1={124} x2={78} y2={136} className="stroke-foreground" strokeWidth={3} />
              <text x={58} y={132} fontSize={12} className="fill-foreground">{fmt(v, 1)} V</text>
              {/* resistors on the top wire */}
              <rect x={170} y={44} width={70} height={32} rx={4} className="fill-card stroke-foreground" strokeWidth={1.5} />
              <text x={205} y={64} textAnchor="middle" fontSize={12} className="fill-foreground">R₁ {fmt(r1, 1)} Ω</text>
              <rect x={300} y={44} width={70} height={32} rx={4} className="fill-card stroke-foreground" strokeWidth={1.5} />
              <text x={335} y={64} textAnchor="middle" fontSize={12} className="fill-foreground">R₂ {fmt(r2, 1)} Ω</text>
              {/* animated current */}
              <path
                d="M90 60 H430 V200 H90 Z"
                fill="none"
                className="stroke-primary"
                strokeWidth={2.5}
                strokeDasharray="4 12"
                strokeDashoffset={flowOffset}
                markerEnd={`url(#${dashId})`}
              />
              <text x={260} y={232} textAnchor="middle" fontSize={12} className="fill-muted-foreground">
                I = {fmt(result.iTotal, 3)} A through both resistors
              </text>
            </g>
          ) : (
            <g>
              <path d="M90 50 H440 M90 210 H440 M90 50 V210 M440 50 V130 M440 170 V210" fill="none" className="stroke-border" strokeWidth={2} />
              {/* battery */}
              <line x1={90} y1={112} x2={90} y2={148} className="stroke-foreground" strokeWidth={3} />
              <line x1={78} y1={124} x2={78} y2={136} className="stroke-foreground" strokeWidth={3} />
              <text x={58} y={132} fontSize={12} className="fill-foreground">{fmt(v, 1)} V</text>
              {/* two parallel branches */}
              <rect x={200} y={104} width={70} height={26} rx={4} className="fill-card stroke-foreground" strokeWidth={1.5} />
              <text x={235} y={122} textAnchor="middle" fontSize={12} className="fill-foreground">R₁ {fmt(r1, 1)} Ω</text>
              <rect x={200} y={180} width={70} height={26} rx={4} className="fill-card stroke-foreground" strokeWidth={1.5} />
              <text x={235} y={198} textAnchor="middle" fontSize={12} className="fill-foreground">R₂ {fmt(r2, 1)} Ω</text>
              {/* animated current on both branches */}
              <path d="M90 50 H440 V130 H270 M90 210 H440 V180 H270 M90 50 V210" fill="none" className="stroke-primary" strokeWidth={2.5} strokeDasharray="4 12" strokeDashoffset={flowOffset} />
              <text x={260} y={246} textAnchor="middle" fontSize={12} className="fill-muted-foreground">
                I₁ = {fmt(result.i1, 3)} A · I₂ = {fmt(result.i2, 3)} A · I(total) = {fmt(result.iTotal, 3)} A
              </text>
            </g>
          )}
        </svg>
        <ReadoutGrid>
          <Readout label="Equivalent R" value={fmt(result.rTotal, 2)} unit="Ω" />
          <Readout label="Total current" value={fmt(result.iTotal, 3)} unit="A" />
          <Readout label="Current I₁" value={fmt(result.i1, 3)} unit="A" />
          <Readout label="Current I₂" value={fmt(result.i2, 3)} unit="A" />
          <Readout label="PD across R₁" value={fmt(result.v1, 2)} unit="V" />
          <Readout label="PD across R₂" value={fmt(result.v2, 2)} unit="V" />
          <Readout label="Power in R₁" value={fmt(result.p1, 2)} unit="W" />
          <Readout label="Power in R₂" value={fmt(result.p2, 2)} unit="W" />
          <Readout label="Total power" value={fmt(result.pTotal, 2)} unit="W" />
        </ReadoutGrid>
        <Equations>
          <span>Ohm's law: V = I·R</span>
          <span>series: R = R₁ + R₂ (same I, voltages add)</span>
          <span>parallel: 1/R = 1/R₁ + 1/R₂ (same V, currents add)</span>
          <span>P = V·I = I²·R = V²/R</span>
        </Equations>
        <ModelLimits assumptions={CIRCUIT_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Geometric optics                                                        */
/* -------------------------------------------------------------------------- */

export function OpticsSim() {
  const [f, setF] = useState(10);
  const [u, setU] = useState(-25);
  const [n1, setN1] = useState(1.5);
  const [n2, setN2] = useState(1);
  const [iDeg, setIDeg] = useState(40);

  const lens = lensResult({ f, u: u <= 0 ? u : -1 });
  const snell = snellResult({ n1, n2, iDeg });

  // --- lens diagram geometry (all lengths in cm → px) ---
  const extent = Math.max(Math.abs(u), Number.isFinite(lens.v) ? Math.abs(lens.v) : 80, Math.abs(2 * f), 24);
  const cxPx = 280;
  const scale = 230 / extent;
  const axisY = 150;
  const objectH = 34;
  const lensX = (cm: number): number => cxPx + cm * scale;

  interface Ray {
    points: { x: number; y: number }[];
    dashed?: boolean;
  }
  const rays: Ray[] = [];
  if (Math.abs(u + f) > 0.01) {
    // Ray through the far focal point → leaves parallel to the axis.
    const yAtLens = objectH;
    const slope = -objectH / f; // from (0, h) toward (f, 0)
    rays.push({ points: [{ x: lensX(u), y: axisY - objectH }, { x: lensX(0), y: axisY - yAtLens }, { x: lensX(extent), y: axisY - (yAtLens + slope * extent) }] });
    // Ray through the lens centre → straight on.
    const throughCenterSlope = objectH / u;
    rays.push({ points: [{ x: lensX(u), y: axisY - objectH }, { x: lensX(extent), y: axisY - throughCenterSlope * extent }] });
    // Ray through the near focal point → leaves parallel.
    const yNear = (objectH * f) / (u + f);
    rays.push({ points: [{ x: lensX(u), y: axisY - objectH }, { x: lensX(0), y: axisY - yNear }, { x: lensX(extent), y: axisY - yNear }] });
  } else {
    // Object exactly at F: every emerging ray is parallel to the axis.
    rays.push({ points: [{ x: lensX(u), y: axisY - objectH }, { x: lensX(0), y: axisY - objectH }, { x: lensX(extent), y: axisY - objectH }] });
    rays.push({ points: [{ x: lensX(u), y: axisY - objectH }, { x: lensX(extent), y: axisY - (objectH / u) * extent }] });
  }

  const imagePx = Number.isFinite(lens.v)
    ? {
        x: lensX(lens.v),
        y: axisY - lens.imageHeight * objectH,
        virtual: !lens.real,
      }
    : null;

  // --- refraction panel geometry ---
  const refWidth = 520;
  const refHeight = 240;
  const ix = refWidth / 2;
  const iy = 120;
  const rayLen = 92;
  const incident = { x: ix - rayLen * Math.sin(iDeg * DEG), y: iy - rayLen * Math.cos(iDeg * DEG) };

  return (
    <div className="space-y-4">
      <SimTitle
        title="Geometric optics — thin lens & refraction"
        subtitle="Top: principal-ray construction for a thin lens. Bottom: Snell's law at a flat interface, total internal reflection included."
      />
      <SimLayout
        controls={
          <>
            <SimSlider label="Focal length f" unit="cm" value={f} min={-20} max={20} step={0.5} digits={1} onChange={setF} />
            <SimSlider label="Object position u" unit="cm" value={u} min={-40} max={-1} step={0.5} digits={1} onChange={setU} />
            <SimSlider label="Index n₁" value={n1} min={1} max={2.5} step={0.01} digits={2} onChange={setN1} />
            <SimSlider label="Index n₂" value={n2} min={1} max={2.5} step={0.01} digits={2} onChange={setN2} />
            <SimSlider label="Angle of incidence" unit="°" value={iDeg} min={0} max={89} step={1} digits={0} onChange={setIDeg} />
          </>
        }
      >
        <svg viewBox="0 0 560 300" className="h-auto w-full rounded-lg border bg-card" role="img" aria-label="Thin lens ray diagram">
          {/* axis + lens */}
          <line x1={12} y1={axisY} x2={548} y2={axisY} className="stroke-border" strokeWidth={1.5} />
          <ellipse cx={cxPx} cy={axisY} rx={11} ry={64} className="fill-primary/10 stroke-primary" strokeWidth={1.5} />
          <text x={cxPx} y={axisY + 84} textAnchor="middle" fontSize={10} className="fill-muted-foreground">lens</text>
          {/* focal markers */}
          {[f, -f].map((focus) =>
            Math.abs(focus) <= extent ? (
              <g key={focus}>
                <line x1={lensX(focus)} y1={axisY - 5} x2={lensX(focus)} y2={axisY + 5} className="stroke-foreground" strokeWidth={1.5} />
                <text x={lensX(focus)} y={axisY + 18} textAnchor="middle" fontSize={10} className="fill-muted-foreground">F</text>
              </g>
            ) : null,
          )}
          {/* object */}
          <line x1={lensX(u)} y1={axisY} x2={lensX(u)} y2={axisY - objectH} className="stroke-foreground" strokeWidth={2} markerEnd="url(#none)" />
          <path d={`M${lensX(u) - 4},${axisY - objectH + 7} L${lensX(u)},${axisY - objectH} L${lensX(u) + 4},${axisY - objectH + 7}`} fill="none" className="stroke-foreground" strokeWidth={2} />
          <text x={lensX(u)} y={axisY + 18} textAnchor="middle" fontSize={10} className="fill-foreground">object</text>
          {/* rays */}
          {rays.map((ray, index) => (
            <polyline
              key={index}
              points={ray.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")}
              fill="none"
              strokeWidth={1.5}
              className={index === 1 ? "stroke-sky-500" : index === 0 ? "stroke-emerald-500" : "stroke-amber-500"}
            />
          ))}
          {/* image */}
          {imagePx ? (
            <g opacity={imagePx.virtual ? 0.75 : 1}>
              <line
                x1={imagePx.x}
                y1={axisY}
                x2={imagePx.x}
                y2={imagePx.y}
                className="stroke-rose-500"
                strokeWidth={2}
                strokeDasharray={imagePx.virtual ? "4 3" : undefined}
              />
              <path
                d={`M${imagePx.x - 4},${imagePx.y + Math.sign(imagePx.y - axisY) * -7 + (imagePx.y > axisY ? 0 : 0)} L${imagePx.x},${imagePx.y} L${imagePx.x + 4},${imagePx.y + (imagePx.y <= axisY ? 7 : -7)}`}
                fill="none"
                className="stroke-rose-500"
                strokeWidth={2}
              />
              <text x={imagePx.x} y={axisY + 32} textAnchor="middle" fontSize={10} className="fill-rose-500">
                {imagePx.virtual ? "virtual image" : "real image"}
              </text>
            </g>
          ) : (
            <text x={cxPx + 30} y={axisY - 90} fontSize={11} className="fill-amber-500">
              object at F — image at infinity
            </text>
          )}
        </svg>

        <svg viewBox={`0 0 ${refWidth} ${refHeight}`} className="h-auto w-full rounded-lg border bg-card" role="img" aria-label="Refraction at a flat interface">
          <rect x={0} y={iy} width={refWidth} height={refHeight - iy} className="fill-sky-500/5" />
          <line x1={0} y1={iy} x2={refWidth} y2={iy} className="stroke-border" strokeWidth={2} />
          <line x1={ix} y1={12} x2={ix} y2={refHeight - 12} className="stroke-border" strokeDasharray="4 4" />
          <text x={14} y={iy - 10} fontSize={11} className="fill-muted-foreground">n₁ = {fmt(n1, 2)}</text>
          <text x={14} y={iy + 20} fontSize={11} className="fill-muted-foreground">n₂ = {fmt(n2, 2)}</text>
          {/* incident + reflected */}
          <line x1={incident.x} y1={incident.y} x2={ix} y2={iy} className="stroke-foreground" strokeWidth={2} />
          <line x1={ix} y1={iy} x2={2 * ix - incident.x} y2={incident.y} className="stroke-foreground" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={2 * ix - incident.x - 4} y={incident.y - 6} fontSize={10} className="fill-muted-foreground">reflected</text>
          {/* refracted or TIR */}
          {snell.refractDeg === null ? (
            <text x={ix + 14} y={iy + 44} fontSize={12} className="fill-amber-500">
              total internal reflection — no refracted ray
            </text>
          ) : (
            (() => {
              const rDeg = snell.refractDeg;
              const refracted = { x: ix + rayLen * Math.sin(rDeg * DEG), y: iy + rayLen * Math.cos(rDeg * DEG) };
              return (
                <g>
                  <line x1={ix} y1={iy} x2={refracted.x} y2={refracted.y} className="stroke-emerald-600" strokeWidth={2} />
                  <text x={refracted.x + 4} y={refracted.y} fontSize={10} className="fill-emerald-600">r = {fmt(rDeg, 1)}°</text>
                </g>
              );
            })()
          )}
          <text x={incident.x - 6} y={incident.y - 8} fontSize={10} className="fill-muted-foreground">i = {fmt(iDeg, 0)}°</text>
        </svg>

        <ReadoutGrid>
          <Readout label="Image position v" value={lens.atFocus ? "∞" : fmt(lens.v, 2)} unit="cm" />
          <Readout label="Magnification m = v/u" value={lens.atFocus ? "∞" : fmt(lens.magnification, 2)} />
          <Readout label="Image" value={lens.atFocus ? "at infinity" : lens.real ? "real" : "virtual"} tone={lens.real ? "good" : "default"} />
          <Readout label="Orientation" value={lens.atFocus ? "—" : lens.upright ? "upright" : "inverted"} />
          <Readout label="Refraction r" value={snell.refractDeg === null ? "none (TIR)" : `${fmt(snell.refractDeg, 2)}°`} tone={snell.tir ? "warn" : "default"} />
          <Readout label="Critical angle" value={snell.criticalDeg === null ? "none (n₁ ≤ n₂)" : `${fmt(snell.criticalDeg, 2)}°`} />
        </ReadoutGrid>
        <Equations>
          <span>thin lens: 1/v − 1/u = 1/f, magnification m = v/u (sign = orientation)</span>
          <span>refraction: n₁·sin i = n₂·sin r; TIR when n₁ &gt; n₂ and i &gt; critical angle</span>
        </Equations>
        <ModelLimits assumptions={OPTICS_ASSUMPTIONS} />
      </SimLayout>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export interface LabSimEntry {
  kind: PhysicsSimKind;
  title: string;
  subtitle: string;
  Component: ComponentType;
}

export const PHYSICS_SIMS: readonly LabSimEntry[] = [
  { kind: "motion", title: "Motion & graphs", subtitle: "x–t and v–t graphs for constant acceleration", Component: MotionSim },
  { kind: "projectile", title: "Projectile motion", subtitle: "Range, height and flight time of a launch", Component: ProjectileSim },
  { kind: "forces", title: "Newton's laws & forces", subtitle: "Push, friction, normal reaction — free-body diagram", Component: ForcesSim },
  { kind: "waves", title: "Waves & oscillations", subtitle: "Travelling wave plus a damped mass–spring", Component: WavesSim },
  { kind: "circuits", title: "Electric circuits", subtitle: "Ohm's law in series and parallel", Component: CircuitsSim },
  { kind: "optics", title: "Geometric optics", subtitle: "Thin-lens rays and Snell's law with TIR", Component: OpticsSim },
];
