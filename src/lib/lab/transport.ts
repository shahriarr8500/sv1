/**
 * Cell-membrane transport engine for the Biology lab (application-owned).
 *
 * A deliberately SIMPLIFIED model: solute particles perform a seeded random
 * walk inside two chambers separated by a membrane. Each time a particle
 * touches the membrane it crosses with a fixed probability that rises when
 * channel proteins are present — because particles on the concentrated side
 * touch the membrane more often, net flow down the gradient emerges from the
 * rules alone, without any "smart" particle behaviour.
 *
 * Deterministic: a state plus the same seed and the same sequence of time
 * steps always produces the same positions, so the animation, the counts and
 * the readouts can never disagree, and tests can pin the behaviour exactly.
 *
 * Pure and DOM-free so `bun src/tests/labBiology.test.ts` can drive it.
 */

/** Geometry of the two-chamber world (drawn 1:1 by the lab component). */
export const WORLD = {
  width: 100,
  height: 100,
  /** Centre-line of the membrane. */
  membraneX: 50,
  /** Half-thickness of the membrane band a particle may sit inside. */
  band: 1.2,
  /** Distance from the walls where particles are kept (radius margin). */
  wall: 2,
} as const;

/** Fixed integration step — one random-walk tick. */
export const STEP_S = 0.02;

/** The student's controls (all validated/clamped before use). */
export interface TransportParams {
  /** Solute particles seeded on the left chamber. */
  left: number;
  /** Solute particles seeded on the right chamber. */
  right: number;
  /** Probability of crossing per membrane contact, 0…1. */
  permeability: number;
  /** Temperature proxy: multiplies particle speed, 0.4…2. */
  temperature: number;
  /** Channel proteins present (raise per-contact crossing chance). */
  channels: boolean;
  /** PRNG seed — same seed + same steps = same run. */
  seed: number;
}

export interface Particle {
  x: number;
  y: number;
  /** Heading in radians. */
  heading: number;
  /**
   * Crossing grant for the current membrane pass: 0 = none (reflect),
   * 1 = granted from the left, −1 = granted from the right. Cleared when
   * the particle leaves the membrane band.
   */
  grant: number;
}

export interface TransportState {
  particles: Particle[];
}

/** Clamp controls to the ranges the UI exposes (never trust raw input). */
export function clampParams(params: TransportParams): TransportParams {
  const count = (value: number): number =>
    Math.min(60, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  return {
    left: count(params.left),
    right: count(params.right),
    permeability: Math.min(1, Math.max(0, Number.isFinite(params.permeability) ? params.permeability : 0)),
    temperature: Math.min(2, Math.max(0.4, Number.isFinite(params.temperature) ? params.temperature : 1)),
    channels: Boolean(params.channels),
    seed: Number.isFinite(params.seed) ? Math.abs(Math.floor(params.seed)) : 1,
  };
}

/** Small deterministic PRNG (mulberry32) — private per state evolution. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-contact crossing probability, including the channel-protein boost. */
export function contactProbability(params: TransportParams): number {
  const p = clampParams(params);
  return p.permeability * (p.channels ? 0.8 : 0.3);
}

/**
 * Fresh run: `left` particles in the left chamber, `right` in the right,
 * headings drawn from the seeded PRNG so two runs with the same seed look
 * identical.
 */
export function initTransport(params: TransportParams): TransportState {
  const p = clampParams(params);
  const rand = mulberry32(p.seed * 7919 + 17);
  const particles: Particle[] = [];
  const place = (side: "left" | "right", index: number, total: number): void => {
    const margin = WORLD.wall + 3;
    const xMin = side === "left" ? margin : WORLD.membraneX + WORLD.band + 3;
    const xMax = side === "left" ? WORLD.membraneX - WORLD.band - 3 : WORLD.width - margin;
    const spanX = Math.max(0.5, xMax - xMin);
    const spanY = WORLD.height - 2 * margin;
    // Spread the seed positions on a jittered grid — readable at t = 0.
    const columns = Math.max(1, Math.ceil(Math.sqrt((spanX / spanY) * Math.max(1, total))));
    const rows = Math.max(1, Math.ceil(total / columns));
    const col = index % columns;
    const row = Math.floor(index / columns) % rows;
    particles.push({
      x: xMin + ((col + 0.5) / columns) * spanX + (rand() - 0.5) * 1.5,
      y: margin + ((row + 0.5) / rows) * spanY + (rand() - 0.5) * 1.5,
      heading: rand() * Math.PI * 2,
      grant: 0,
    });
  };
  for (let i = 0; i < p.left; i += 1) place("left", i, p.left);
  for (let i = 0; i < p.right; i += 1) place("right", i, p.right);
  return { particles };
}

/** How many particles are currently in each chamber (by position). */
export function sideCounts(state: TransportState): { left: number; right: number } {
  let left = 0;
  for (const particle of state.particles) {
    if (particle.x < WORLD.membraneX) left += 1;
  }
  return { left, right: state.particles.length - left };
}

/**
 * Advance one fixed tick. Returns a NEW state (the caller keeps history if it
 * wants it); the membrane rule is applied here so permeability and the
 * channel toggle take effect on the very next contact.
 */
export function stepTransport(
  state: TransportState,
  params: TransportParams,
  rand: () => number,
): TransportState {
  const p = clampParams(params);
  const pContact = contactProbability(p);
  // Base speed scales with temperature; units are "world units per second".
  const speed = 16 * p.temperature;
  const dt = STEP_S;

  const particles: Particle[] = state.particles.map((particle) => {
    // Gently diffuse the heading each tick — a classic random walk.
    let heading = particle.heading + (rand() - 0.5) * 1.3;
    let x = particle.x + Math.cos(heading) * speed * dt;
    let y = particle.y + Math.sin(heading) * speed * dt;
    let grant = particle.grant;

    // Chamber walls: reflect.
    if (y < WORLD.wall) {
      y = WORLD.wall;
      heading = -heading;
    } else if (y > WORLD.height - WORLD.wall) {
      y = WORLD.height - WORLD.wall;
      heading = -heading;
    }
    if (x < WORLD.wall) {
      x = WORLD.wall;
      heading = Math.PI - heading;
    } else if (x > WORLD.width - WORLD.wall) {
      x = WORLD.width - WORLD.wall;
      heading = Math.PI - heading;
    }

    // Membrane band: crossing needs a granted pass, decided once per contact.
    const low = WORLD.membraneX - WORLD.band;
    const high = WORLD.membraneX + WORLD.band;
    const wasInside = particle.x > low && particle.x < high;
    if (grant !== 0) {
      // Walking through with permission — the pass ends at either edge
      // (crossed, or backed out and must ask again at the next contact).
      if (x <= low || x >= high) grant = 0;
    } else if (wasInside) {
      // Safety net: inside the band with no live pass (only possible if the
      // geometry changed) — send it back to the side it came from.
      const cameFromLeft = particle.x <= WORLD.membraneX;
      x = cameFromLeft ? low - 0.01 : high + 0.01;
      heading = Math.PI - heading;
    } else if (
      (particle.x < WORLD.membraneX && x > low) ||
      (particle.x >= WORLD.membraneX && x < high)
    ) {
      // Stepped up to the membrane from its own side: roll once for this
      // contact. More particles touch from the crowded side, so granted
      // passes produce net flow down the gradient — with no bias coded in.
      if (rand() < pContact) {
        grant = particle.x < WORLD.membraneX ? 1 : -1;
      } else {
        // Reflected: reverse the horizontal component and step back out.
        heading = Math.PI - heading;
        x = particle.x + Math.cos(heading) * speed * dt;
        y = particle.y + Math.sin(heading) * speed * dt;
        // Re-apply the wall clamp after the reflected step.
        if (y < WORLD.wall) y = WORLD.wall;
        else if (y > WORLD.height - WORLD.wall) y = WORLD.height - WORLD.wall;
        if (x < WORLD.wall) x = WORLD.wall;
        else if (x > WORLD.width - WORLD.wall) x = WORLD.width - WORLD.wall;
      }
    }

    return { x, y, heading, grant };
  });

  return { particles };
}

/**
 * Advance `elapsed` seconds from `state` in fixed ticks — the animation loop
 * and the tests both go through here, so they integrate identically.
 */
export function advanceTransport(
  state: TransportState,
  params: TransportParams,
  elapsed: number,
  rand: () => number,
): TransportState {
  // Generous cap: the UI advances ≤ 0.05 s per frame, while tests may ask
  // for a whole minute at once — never silently truncate a legitimate run.
  const ticks = Math.min(10000, Math.max(0, Math.round(elapsed / STEP_S)));
  let current = state;
  for (let i = 0; i < ticks; i += 1) {
    current = stepTransport(current, params, rand);
  }
  return current;
}

/** Fresh PRNG stream for one run — same seed → same walk. */
export function transportRng(seed: number): () => number {
  return mulberry32((seed >>> 0) * 2654435761 + 1013904223);
}

/** Balance readout: which way is the net transport pointing right now? */
export function netDirection(counts: { left: number; right: number }): string {
  const difference = counts.left - counts.right;
  if (difference > 0) return "net left → right";
  if (difference < 0) return "net right → left";
  return "balanced (dynamic equilibrium)";
}

/** The honesty box content for the transport lab. */
export const TRANSPORT_ASSUMPTIONS: readonly string[] = [
  "Solute particles move by random motion only — no active transport, no pumps and no energy use are modelled.",
  "The membrane is a simple barrier with an optional channel boost; real membranes are selective by size, charge and transport proteins.",
  "Counts are the number of modelled particles, not moles or molarity, and water (osmosis) is not simulated.",
  "Reaching similar counts on both sides approximates dynamic equilibrium: particles keep crossing, but in equal numbers on average.",
];
