/**
 * Physics engine for the Phase 4 interactive lab.
 *
 * Every function here is a pure, deterministic calculation over SI units —
 * the simulation components draw ONLY from these values, so the visuals and
 * the readouts can never disagree. Nothing in this file performs I/O,
 * randomness or time-dependent state: given the same inputs you always get
 * the same numbers (tests rely on this).
 *
 * Model honesty: each function documents the simplifying assumptions it
 * makes and what it deliberately does NOT model (air drag, deformation,
 * lens aberration…). Those notes are surfaced verbatim in the UI so an
 * educational approximation is never mistaken for a real-world prediction.
 */

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

export const DEG = Math.PI / 180;

/** Earth surface gravity used by the lab (m/s²). Simulations may override. */
export const G_EARTH = 9.81;

export function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** Round to `digits` decimals for stable display/test comparisons. */
export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Sample count used by every plotted curve (fixed → deterministic). */
export const PLOT_SAMPLES = 120;

/* -------------------------------------------------------------------------- */
/* 1. Motion — position-time and velocity-time graphs                        */
/* -------------------------------------------------------------------------- */

export interface MotionInput {
  /** Initial position x0 (m). */
  x0: number;
  /** Initial velocity u (m/s). */
  u: number;
  /** Constant acceleration a (m/s²). */
  a: number;
  /** Elapsed time t (s). */
  t: number;
}

export interface MotionState {
  x: number; // position (m)
  v: number; // velocity (m/s)
  a: number; // acceleration (m/s²)
  /** True when v changed sign somewhere in [0, t] (turning point exists). */
  turned: boolean;
  /** Time of the turning point (s), or null when v never changes sign. */
  turnTime: number | null;
}

/**
 * Constant-acceleration kinematics:
 *   x(t) = x0 + u·t + ½·a·t²
 *   v(t) = u + a·t
 * Valid only for a constant acceleration over the whole interval — this is
 * the standard introductory model, not a claim about real motion with
 * changing forces (see MOTION_ASSUMPTIONS).
 */
export function motionAt(input: MotionInput): MotionState {
  const { x0, u, a, t } = input;
  const x = x0 + u * t + 0.5 * a * t * t;
  const v = u + a * t;
  // Turning point: v = 0 at t* = -u/a when a ≠ 0 and t* lies in [0, t].
  let turnTime: number | null = null;
  if (a !== 0) {
    const tStar = -u / a;
    if (tStar > 0 && tStar <= t) turnTime = tStar;
  }
  return { x, v, a, turned: turnTime !== null, turnTime };
}

export interface SeriesPoint {
  t: number;
  y: number;
}

/** Sample s(t) and v(t) over [0, tEnd] for the position/velocity graphs. */
export function sampleMotion(
  input: MotionInput,
  tEnd: number = input.t,
  samples: number = PLOT_SAMPLES,
): { position: SeriesPoint[]; velocity: SeriesPoint[] } {
  const n = Math.max(2, Math.floor(samples));
  const end = Math.max(0, tEnd);
  const position: SeriesPoint[] = [];
  const velocity: SeriesPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (end * i) / (n - 1);
    position.push({ t, y: motionAt({ ...input, t }).x });
    velocity.push({ t, y: motionAt({ ...input, t }).v });
  }
  return { position, velocity };
}

export const MOTION_ASSUMPTIONS = [
  "Acceleration is constant over the whole interval (no air resistance, no friction that changes with speed).",
  "One-dimensional motion along a straight line; the object is treated as a point mass.",
  "Time runs forward from 0 to t — the tool does not model forces that switch on mid-flight.",
];

/* -------------------------------------------------------------------------- */
/* 2. Projectile motion                                                       */
/* -------------------------------------------------------------------------- */

export interface ProjectileInput {
  /** Launch speed v (m/s), must be > 0. */
  v: number;
  /** Launch angle above the horizontal (degrees, 0–90). */
  angleDeg: number;
  /** Gravitational field strength g (m/s²), must be > 0. */
  g: number;
}

export interface ProjectileResult {
  /** Horizontal range on level ground R = v²·sin(2θ)/g (m). */
  range: number;
  /** Maximum height H = v²·sin²θ/(2g) (m). */
  maxHeight: number;
  /** Total time of flight T = 2·v·sinθ/g (s). */
  timeOfFlight: number;
  /** Time to the apex (s). */
  timeToApex: number;
  /** Horizontal position at the apex (m). */
  apexX: number;
  /** Initial velocity components (m/s). */
  vx: number;
  vy: number;
  /** 45° gives the maximum range for a given speed (level ground). */
  optimalAngle: 45;
  isOptimal: boolean;
}

/**
 * Ideal projectile motion on level ground:
 *   x = v·cosθ·t,  y = v·sinθ·t − ½g·t²
 *   R = v²·sin(2θ)/g,  H = v²·sin²θ/(2g),  T = 2·v·sinθ/g
 * ASSUMPTIONS: no air resistance, flat ground at y = 0, g constant,
 * the object is a point mass, launch = landing height. Real trajectories
 * with drag or rotating balls (Magnus effect) are NOT modelled.
 */
export function projectileResult(input: ProjectileInput): ProjectileResult {
  const { v, angleDeg, g } = input;
  const theta = angleDeg * DEG;
  const vx = v * Math.cos(theta);
  const vy = v * Math.sin(theta);
  const timeOfFlight = (2 * vy) / g;
  const timeToApex = vy / g;
  return {
    range: (v * v * Math.sin(2 * theta)) / g,
    maxHeight: (vy * vy) / (2 * g),
    timeOfFlight,
    timeToApex,
    apexX: vx * timeToApex,
    vx,
    vy,
    optimalAngle: 45,
    isOptimal: Math.abs(angleDeg - 45) < 1e-9,
  };
}

export interface Point2 {
  x: number;
  y: number;
}

/** Trajectory samples (x, y) from launch until landing on level ground. */
export function projectileTrajectory(
  input: ProjectileInput,
  samples: number = PLOT_SAMPLES,
): Point2[] {
  const { v, angleDeg, g } = input;
  const theta = angleDeg * DEG;
  const vx = v * Math.cos(theta);
  const vy = v * Math.sin(theta);
  const T = (2 * vy) / g;
  const n = Math.max(2, Math.floor(samples));
  const points: Point2[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (T * i) / (n - 1);
    points.push({ x: vx * t, y: vy * t - 0.5 * g * t * t });
  }
  return points;
}

export const PROJECTILE_ASSUMPTIONS = [
  "No air resistance — only gravity acts, so the parabola is the exact model here.",
  "Level ground: launch and landing heights are the same (y = 0).",
  "g is constant and the object is a point mass; spin, wind and lift are ignored.",
  "A ball or rocket in real air travels measurably less far than this ideal range.",
];

/* -------------------------------------------------------------------------- */
/* 3. Newton's laws — forces on a block                                      */
/* -------------------------------------------------------------------------- */

export interface ForcesInput {
  /** Mass of the block (kg), must be > 0. */
  m: number;
  /** Applied force magnitude F (N), ≥ 0. */
  F: number;
  /** Angle of the applied force above the horizontal (degrees, −89…89). */
  thetaDeg: number;
  /** Coefficient of friction μ (used for both the static threshold and
   *  kinetic sliding), 0…2. */
  mu: number;
}

export interface ForcesResult {
  /** Weight W = m·g (N, downward). */
  weight: number;
  /** Normal reaction N (N, upward). */
  normal: number;
  /** Horizontal and vertical components of the applied force (N). */
  fx: number;
  fy: number;
  /** Friction force (N) — static (equal to the push) or kinetic μ·N. */
  friction: number;
  frictionKind: "static" | "kinetic";
  /** Net horizontal force (N) and the resulting acceleration a = F/m. */
  net: number;
  acceleration: number;
  /** True when F·sinθ ≥ m·g — the block lifts off the surface, so the
   *  ground-contact model no longer applies (the UI says so). */
  lifted: boolean;
  /** True when μ = 0. */
  frictionless: boolean;
}

/**
 * A block resting on a rough horizontal surface, pushed by a force F at
 * angle θ above the horizontal. Newton's second law on each axis:
 *   Fx = F·cosθ,  Fy = F·sinθ,  W = m·g
 *   N = m·g − F·sinθ (clamped at 0 when the block would lift)
 *   static if |Fx| ≤ μ·N (friction exactly balances the push, a = 0)
 *   else kinetic: f = μ·N opposing motion, a = (Fx ∓ f)/m
 * ASSUMPTIONS: a single μ is used as both the static threshold and the
 * kinetic friction (real materials differ); the surface is flat, the push
 * angle is constant, no rolling/tipping, no air drag.
 */
export function forcesResult(input: ForcesInput): ForcesResult {
  const { m, F, thetaDeg, mu } = input;
  const theta = thetaDeg * DEG;
  const weight = m * G_EARTH;
  const fy = F * Math.sin(theta);
  const fx = F * Math.cos(theta);
  const lifted = fy >= weight;
  const normal = Math.max(0, weight - fy);
  const frictionless = mu === 0;

  let friction: number;
  let frictionKind: "static" | "kinetic";
  let net: number;
  if (Math.abs(fx) <= mu * normal + 1e-12) {
    frictionKind = "static";
    friction = -fx; // exactly balances → block stays put
    net = 0;
  } else {
    frictionKind = "kinetic";
    friction = -Math.sign(fx) * mu * normal;
    net = fx + friction;
  }
  return {
    weight,
    normal,
    fx,
    fy,
    friction,
    frictionKind,
    net,
    acceleration: net / m,
    lifted,
    frictionless,
  };
}

export const FORCES_ASSUMPTIONS = [
  "One coefficient μ is used for both the static threshold and kinetic sliding; real materials have μₛ > μₖ.",
  "The surface is flat and rigid; the block does not tip, roll or deform.",
  "If the upward push reaches the weight, the tool flags that the block lifts off — beyond that the surface model breaks down.",
  "No air resistance.",
];

/* -------------------------------------------------------------------------- */
/* 4. Waves and oscillations                                                  */
/* -------------------------------------------------------------------------- */

export interface WaveInput {
  /** Frequency f (Hz), > 0. */
  f: number;
  /** Amplitude A (m), ≥ 0. */
  A: number;
  /** Wavelength λ (m), > 0. */
  lambda: number;
}

export interface WaveResult {
  period: number; // T = 1/f (s)
  speed: number; // v = f·λ (m/s)
  angularFrequency: number; // ω = 2πf (rad/s)
  waveNumber: number; // k = 2π/λ (rad/m)
}

/** Travelling wave: y(x, t) = A·sin(k·x − ω·t), v = f·λ, T = 1/f.
 *  ASSUMERSIONS: a non-dispersive, non-damped, infinitely long transverse
 *  wave in a uniform medium (amplitude never decays). */
export function waveResult(input: WaveInput): WaveResult {
  const { f, A, lambda } = input;
  void A;
  return {
    period: 1 / f,
    speed: f * lambda,
    angularFrequency: 2 * Math.PI * f,
    waveNumber: (2 * Math.PI) / lambda,
  };
}

/** Snapshot of the wave at time t over [0, xMax]. */
export function sampleWave(
  input: WaveInput,
  t: number,
  xMax: number,
  samples: number = PLOT_SAMPLES,
): SeriesPoint[] {
  const r = waveResult(input);
  const n = Math.max(2, Math.floor(samples));
  const points: SeriesPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = (xMax * i) / (n - 1);
    points.push({
      t: x,
      y: input.A * Math.sin(r.waveNumber * x - r.angularFrequency * t),
    });
  }
  return points;
}

export type OscillationMode = "undamped" | "underdamped" | "critical" | "overdamped";

export interface OscillationInput {
  /** Amplitude A (m), > 0 — released from x = A with zero velocity. */
  A: number;
  /** Spring constant k (N/m), > 0. */
  k: number;
  /** Mass m (kg), > 0. */
  m: number;
  /** Damping coefficient c (N·s/m), ≥ 0. 0 = SHM. */
  c: number;
}

export interface OscillationResult {
  omega0: number; // √(k/m)
  naturalPeriod: number; // 2π/ω0
  naturalFrequency: number; // 1/T0
  gamma: number; // c/(2m)
  mode: OscillationMode;
  /** Damped angular frequency (underdamped) or null. */
  omegaD: number | null;
  /** Period of the damped motion (underdamped) or null. */
  dampedPeriod: number | null;
}

/**
 * Damped mass–spring motion m·x″ + c·x′ + k·x = 0, released from x = A,
 * v = 0:
 *   undamped (c = 0):      x = A·cos(ω₀t)
 *   underdamped (γ < ω₀):  x = A·e^(−γt)(cos ω_d t + (γ/ω_d)·sin ω_d t)
 *   critical (γ = ω₀):     x = A·(1 + γt)·e^(−γt)
 *   overdamped (γ > ω₀):   x = A·e^(−γt)(cosh βt + (γ/β)·sinh βt), β = √(γ²−ω₀²)
 * ASSUMPTIONS: ideal spring (force exactly −k·x), viscous damping
 * proportional to velocity, no friction other than c, one dimension.
 */
export function oscillationResult(input: OscillationInput): OscillationResult {
  const { k, m, c } = input;
  const omega0 = Math.sqrt(k / m);
  const gamma = c / (2 * m);
  const mode: OscillationMode =
    gamma === 0
      ? "undamped"
      : gamma < omega0
        ? "underdamped"
        : gamma === omega0
          ? "critical"
          : "overdamped";
  const omegaD =
    mode === "underdamped" ? Math.sqrt(omega0 * omega0 - gamma * gamma) : null;
  return {
    omega0,
    naturalPeriod: (2 * Math.PI) / omega0,
    naturalFrequency: omega0 / (2 * Math.PI),
    gamma,
    mode,
    omegaD,
    dampedPeriod: omegaD ? (2 * Math.PI) / omegaD : null,
  };
}

/** Displacement x(t) of the damped oscillator (m), per the formulas above. */
export function oscillationAt(input: OscillationInput, t: number): number {
  const { A } = input;
  const r = oscillationResult(input);
  const { omega0, gamma, mode, omegaD } = r;
  if (mode === "undamped") return A * Math.cos(omega0 * t);
  if (mode === "underdamped" && omegaD) {
    return (
      A *
      Math.exp(-gamma * t) *
      (Math.cos(omegaD * t) + (gamma / omegaD) * Math.sin(omegaD * t))
    );
  }
  if (mode === "critical") return A * (1 + gamma * t) * Math.exp(-gamma * t);
  const beta = Math.sqrt(Math.max(0, gamma * gamma - omega0 * omega0));
  return (
    A *
    Math.exp(-gamma * t) *
    (Math.cosh(beta * t) + (gamma / beta) * Math.sinh(beta * t))
  );
}

/** Sample x(t) for the displacement graph. */
export function sampleOscillation(
  input: OscillationInput,
  tEnd: number,
  samples: number = PLOT_SAMPLES,
): SeriesPoint[] {
  const n = Math.max(2, Math.floor(samples));
  const end = Math.max(0, tEnd);
  const points: SeriesPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (end * i) / (n - 1);
    points.push({ t, y: oscillationAt(input, t) });
  }
  return points;
}

export const WAVE_ASSUMPTIONS = [
  "Ideal travelling wave in a uniform, non-dispersive medium — amplitude never decays with distance.",
  "The mass–spring model is linear (Hooke's law) with viscous damping proportional to velocity.",
  "Real strings, air columns and springs lose energy to heat and have amplitude-dependent behaviour not modelled here.",
];

/* -------------------------------------------------------------------------- */
/* 5. Electricity — DC circuits                                               */
/* -------------------------------------------------------------------------- */

export type CircuitMode = "series" | "parallel";

export interface CircuitInput {
  /** Battery EMF V (V), > 0. */
  V: number;
  /** Resistor R1 (Ω), > 0. */
  R1: number;
  /** Resistor R2 (Ω), > 0. */
  R2: number;
  mode: CircuitMode;
}

export interface CircuitResult {
  mode: CircuitMode;
  /** Equivalent resistance (Ω). */
  rTotal: number;
  /** Total current drawn from the battery (A). */
  iTotal: number;
  /** Current through each resistor (A) — equal in series. */
  i1: number;
  i2: number;
  /** Potential difference across each resistor (V). */
  v1: number;
  v2: number;
  /** Power dissipated by each resistor and in total (W). */
  p1: number;
  p2: number;
  pTotal: number;
}

/**
 * Ohm's law V = I·R and the series/parallel laws:
 *   series:    R = R1 + R2,  same I through both, V splits
 *   parallel:  1/R = 1/R1 + 1/R2,  same V across both, I splits
 * Power P = V·I = I²·R = V²/R.
 * ASSUMPTIONS: ideal battery (no internal resistance), ideal wires and
 * resistors (resistance constant with temperature), steady DC. Real
 * batteries sag under load and resistors heat up — neither is modelled.
 */
export function circuitResult(input: CircuitInput): CircuitResult {
  const { V, R1, R2, mode } = input;
  if (mode === "series") {
    const rTotal = R1 + R2;
    const iTotal = V / rTotal;
    const i1 = iTotal;
    const i2 = iTotal;
    const v1 = i1 * R1;
    const v2 = i2 * R2;
    return {
      mode,
      rTotal,
      iTotal,
      i1,
      i2,
      v1,
      v2,
      p1: v1 * i1,
      p2: v2 * i2,
      pTotal: V * iTotal,
    };
  }
  const rTotal = 1 / (1 / R1 + 1 / R2);
  const i1 = V / R1;
  const i2 = V / R2;
  const iTotal = i1 + i2;
  return {
    mode,
    rTotal,
    iTotal,
    i1,
    i2,
    v1: V,
    v2: V,
    p1: V * i1,
    p2: V * i2,
    pTotal: V * iTotal,
  };
}

export const CIRCUIT_ASSUMPTIONS = [
  "Ideal battery: zero internal resistance, so the terminal voltage stays exactly V.",
  "Ideal wires and resistors whose resistance does not change with temperature.",
  "Steady DC only — no capacitors, inductors, switches or changing currents.",
  "Real batteries lose voltage under load and real resistors heat up; neither is modelled.",
];

/* -------------------------------------------------------------------------- */
/* 6. Geometric optics                                                        */
/* -------------------------------------------------------------------------- */

export interface LensInput {
  /** Focal length f (cm): positive = converging, negative = diverging. */
  f: number;
  /** Object position u (cm): negative = in front of the lens (real object). */
  u: number;
}

export interface LensResult {
  /** Image position v (cm): positive = real image on the far side. */
  v: number;
  /** Linear magnification m = v/u (negative ⇒ inverted). */
  magnification: number;
  imageHeight: number; // relative to object height 1
  real: boolean;
  upright: boolean;
  /** Object sits at the focal point — image forms at infinity. */
  atFocus: boolean;
  /** Object inside the focal length of a converging lens (virtual image). */
  magnifier: boolean;
}

/**
 * Thin lens (and concave/concave mirror) equation in Cartesian sign
 * convention: 1/v − 1/u = 1/f, magnification m = v/u.
 * Object height is taken as 1 (magnification is relative).
 * ASSUMPTIONS: thin lens, paraxial rays, single refracting surface pair,
 * monochromatic light, no aberration. The mirror case uses the identical
 * equation with the mirror's own f — the drawing is labelled accordingly.
 */
export function lensResult(input: LensInput): LensResult {
  const { f, u } = input;
  const denom = 1 / f + 1 / u; // = 1/v
  const atFocus = Math.abs(denom) < 1e-12;
  const v = atFocus ? Number.POSITIVE_INFINITY : 1 / denom;
  const magnification = atFocus ? Number.POSITIVE_INFINITY : v / u;
  return {
    v,
    magnification,
    imageHeight: magnification,
    real: !atFocus && v > 0,
    upright: !atFocus && magnification > 0,
    atFocus,
    magnifier: !atFocus && f > 0 && u < 0 && Math.abs(u) < f,
  };
}

export interface SnellInput {
  /** Refractive index of the first medium n1 (> 0). */
  n1: number;
  /** Refractive index of the second medium n2 (> 0). */
  n2: number;
  /** Angle of incidence i (degrees, 0–89) measured from the normal. */
  iDeg: number;
}

export interface SnellResult {
  /** Angle of reflection (°) — always equals i. */
  reflectDeg: number;
  /** Angle of refraction (°), or null on total internal reflection. */
  refractDeg: number | null;
  /** True when n1 > n2 and i exceeds the critical angle. */
  tir: boolean;
  /** Critical angle (°) when n1 > n2, else null. */
  criticalDeg: number | null;
  /** Snell's law value n1·sin i (used to show the equality). */
  leftSide: number;
}

/**
 * Refraction at a flat interface: n1·sin i = n2·sin r, with the reflected
 * ray at r_refl = i. When n1 > n2 and sin r > 1, total internal reflection
 * occurs and no refracted ray exists.
 * ASSUMPTIONS: flat interface, single wavelength (one n per medium),
 * absorption ignored, light treated geometrically (no wave optics:
 * no interference, diffraction or polarization).
 */
export function snellResult(input: SnellInput): SnellResult {
  const { n1, n2, iDeg } = input;
  const sinI = Math.sin(iDeg * DEG);
  const sinR = (n1 * sinI) / n2;
  const criticalDeg =
    n1 > n2 ? (Math.asin(Math.min(1, n2 / n1)) / Math.PI) * 180 : null;
  const tir = sinR > 1;
  return {
    reflectDeg: iDeg,
    refractDeg: tir ? null : (Math.asin(sinR) / Math.PI) * 180,
    tir,
    criticalDeg,
    leftSide: n1 * sinI,
  };
}

export const OPTICS_ASSUMPTIONS = [
  "Thin-lens/mirror equation with paraxial (near-axis) rays — real lenses have spherical aberration this ignores.",
  "Monochromatic light with a single refractive index; dispersion (colour spreading) is not modelled.",
  "Snell's law assumes a perfectly flat interface between two uniform media.",
  "Geometric optics only: interference, diffraction and polarization are wave effects and are out of scope here.",
];
