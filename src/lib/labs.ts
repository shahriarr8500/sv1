/**
 * Lab flags — how to show an experiment *inside* a real screen without
 * committing to it.
 *
 * Everything under `src/labs/` is reachable only by typing the URL, so that
 * covers "does this look good?". This file covers the next step: you like the
 * experiment and want it to appear on the dashboard before you're sure it's
 * permanent.
 *
 * To promote one:
 *   1. set the flag below to `true`
 *   2. render it behind `{LABS.streakHeatmap && <StreakHeatmap />}`
 *   3. set it back to `false` to take it out again — no debris either way
 */
export const LABS = {
  /** GitHub-style study streak grid, promoted onto the dashboard. */
  streakHeatmap: false,
} as const;

export type LabFlag = keyof typeof LABS;
