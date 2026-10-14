/**
 * Tests for Ashy's lab-tool intent routing (Issue 2).
 *
 * Run with:  bun src/tests/ashyLabRouting.test.ts
 * Exit code 0 = all assertions passed.
 *
 * These cover every DETERMINISTIC piece of the "which tool opens?" decision:
 * the `[[lab: …]]` marker parser, the intent router that backstops a model
 * reply which forgot its marker (or wrongly picked a graph for a simulation
 * request), the reply policy in resolveReplyVisuals, the routing instruction
 * the model is actually sent, and the client-side re-validation that gates
 * rendering. Pure application code only — no DOM, no network, no model in
 * the loop: every routing decision asserted here is deterministic, which is
 * exactly why a "simulation" request can no longer degrade into a graph.
 *
 * The tool ids asserted here match the lab-tools host scheme
 * (`physics-<kind>` / `chem-<kind>` / `molecules-3d`), the same registries
 * (PHYSICS_SIMS / CHEM_TOOLS / MoleculeViewer) that render at
 * `/labs/lab-tools` and inside the chat's LabPanel.
 */

import {
  LAB_TOOL_INSTRUCTION,
  extractLabMarker,
  resolveReplyVisuals,
  routeLabIntent,
} from "../convex/ashyShared";
import { labToolId, validateLabSpec } from "../lib/ashy-lab";
import type { AshyLab } from "../lib/ashy";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. The six required chat requests route to the right tool (deterministic)  */
/* -------------------------------------------------------------------------- */

const motion = routeLabIntent(
  "Show me an interactive motion simulation where I can change initial velocity, acceleration, and time.",
);
assert(
  motion?.type === "sim" && motion.kind === "motion",
  "interactive motion simulation → motion simulator",
);

const projectile = routeLabIntent(
  "Show me an interactive projectile-motion simulation with launch speed, angle, trajectory, maximum height, and range.",
);
assert(
  projectile?.type === "sim" && projectile.kind === "projectile",
  "interactive projectile-motion simulation → projectile simulator",
);

const balance = routeLabIntent(
  "Balance Fe + O2 → Fe2O3 and show the atom counts.",
);
assert(
  balance?.type === "balance" && balance.equation === "Fe + O2 → Fe2O3",
  "balance request → the equation itself reaches the balancer intact",
);

const moles = routeLabIntent("Calculate the molar mass of H2O.");
assert(
  moles?.type === "moles" && moles.formula === "H2O",
  "molar-mass request → quantities calculator prefilled with the formula",
);

const molecule = routeLabIntent("Show me the structure of a water molecule.");
assert(
  molecule?.type === "molecule" && molecule.target === "water",
  "molecule-structure request → molecular viewer prefilled with the molecule",
);

const graph = routeLabIntent("Graph y = x^2.");
assert(graph === null, "a graph request never opens a lab tool");

/* -------------------------------------------------------------------------- */
/* 2. Conceptual questions stay normal explanations (never forced into a lab) */
/* -------------------------------------------------------------------------- */

const conceptual = [
  "Explain why acceleration is constant during free fall.",
  "Describe what happens to pressure when the volume decreases.",
  "Explain how projectile motion works.",
  "Why does Newton's second law hold?",
  "What is the difference between mass and weight?",
];
for (const question of conceptual) {
  assert(
    routeLabIntent(question) === null,
    `conceptual question stays a normal explanation: "${question}"`,
  );
}

// A physics question that wants graphs, not a simulation, stays a graph.
const wantsGraph = routeLabIntent(
  "Plot the velocity-time graph for constant acceleration.",
);
assert(wantsGraph === null, "a plotting request does not open a simulator");

/* -------------------------------------------------------------------------- */
/* 3. The [[lab: …]] marker parser (the model's own path)                     */
/* -------------------------------------------------------------------------- */

const parsedBalance = extractLabMarker("Done. [[lab: balance Fe + O2 -> Fe2O3]]");
assert(
  parsedBalance.lab?.type === "balance" &&
    parsedBalance.lab.equation === "Fe + O2 -> Fe2O3",
  "balance marker parses with the equation",
);
assert(
  !parsedBalance.clean.includes("[[lab"),
  "the marker is stripped from the visible text",
);

const parsedSim = extractLabMarker("[[lab: sim projectile]]\nHere's the tool.");
assert(
  parsedSim.lab?.type === "sim" && parsedSim.lab.kind === "projectile",
  "sim marker parses its whitelisted kind",
);
assert(
  extractLabMarker("[[lab: sim chess]]").lab === null,
  "an unknown simulation kind is dropped (never rendered)",
);
assert(
  extractLabMarker("[[lab: teleport Fe]]").lab === null,
  "an unknown tool is dropped",
);
assert(
  extractLabMarker("[[lab: balance H2O]]").lab === null,
  "an equation without an arrow is dropped",
);
assert(
  extractLabMarker('[[lab: molecule <img src=x onerror=alert(1)>]]').lab === null,
  "markup in a payload is rejected by the charset — never a path to code",
);
assert(
  extractLabMarker("[[lab: moles H2O]]").lab?.type === "moles",
  "moles marker parses",
);
assert(
  extractLabMarker("[[lab: lewis CO3^2-]]").lab?.type === "lewis",
  "lewis marker parses (charges through ^ notation)",
);
assert(
  extractLabMarker("[[lab: equilibrium]]").lab?.type === "equilibrium",
  "equilibrium marker parses with no parameters",
);
assert(
  extractLabMarker("[[lab: molecule water]]").lab?.type === "molecule",
  "molecule marker parses",
);

/* -------------------------------------------------------------------------- */
/* 4. Reply policy — the actual bug fix                                       */
/* -------------------------------------------------------------------------- */

// A model that answers a SIMULATION request with a GRAPH marker: the
// deterministic router supplies the right tool from the student's question,
// the lab wins, and exactly one visual attaches.
const wrongVisual = resolveReplyVisuals({
  text: "Here's the plot. [[explore: graph y=x^2]]",
  allow: true,
  userText:
    "Show me an interactive motion simulation where I can change initial velocity, acceleration, and time.",
});
assert(
  wrongVisual.lab?.type === "sim" && wrongVisual.lab.kind === "motion",
  "a graph-marked reply to a simulation request still opens the motion simulator",
);
assert(
  wrongVisual.explore === null,
  "only one visual attaches — the lab wins over the graph",
);
assert(
  !wrongVisual.clean.includes("[["),
  "markers never reach the student",
);

// A plain graph request keeps its graph tool.
const graphReply = resolveReplyVisuals({
  text: "Plot: [[explore: graph y=x^2]]",
  allow: true,
  userText: "Graph y = x^2.",
});
assert(graphReply.lab === null, "a graph request opens no lab tool");
assert(
  graphReply.explore?.type === "graph" && graphReply.explore.expression === "x^2",
  "the graph tool receives the validated expression",
);

// If the model emits BOTH markers anyway, the lab tool takes priority.
const both = resolveReplyVisuals({
  text: "[[lab: sim projectile]] [[explore: graph y=x^2]]",
  allow: true,
  userText: "anything",
});
assert(
  both.lab?.type === "sim" && both.lab.kind === "projectile" && both.explore === null,
  "lab marker beats explore when the model disobeys the one-marker rule",
);

// The model's own (validated) marker always beats the fallback router.
const modelMarker = resolveReplyVisuals({
  text: "[[lab: balance 2H2 + O2 -> 2H2O]]",
  allow: true,
  userText: "Calculate the molar mass of H2O.",
});
assert(
  modelMarker.lab?.type === "balance",
  "the model's explicit marker wins over the deterministic fallback",
);

// Plan/transcription replies attach nothing (but are still stripped).
const disallowed = resolveReplyVisuals({
  text: "[[lab: sim motion]] plain text",
  allow: false,
  userText: "Show me an interactive motion simulation",
});
assert(
  disallowed.lab === null &&
    disallowed.explore === null &&
    !disallowed.clean.includes("[["),
  "when markers are disallowed the reply is stripped and plain",
);

// A conceptual answer with no markers opens nothing.
const plain = resolveReplyVisuals({
  text: "Acceleration stays constant because the only force is gravity.",
  allow: true,
  userText: "Explain why acceleration is constant during free fall.",
});
assert(
  plain.lab === null && plain.explore === null,
  "a conceptual answer opens no tool at all",
);

/* -------------------------------------------------------------------------- */
/* 5. The instruction the model receives pins the routing                     */
/* -------------------------------------------------------------------------- */

assert(
  /interactive motion simulation/.test(LAB_TOOL_INSTRUCTION) &&
    /\[\[lab: sim motion\]\]/.test(LAB_TOOL_INSTRUCTION),
  "the instruction maps motion-simulation requests to [[lab: sim motion]]",
);
assert(
  /\[\[lab: sim projectile\]\]/.test(LAB_TOOL_INSTRUCTION) &&
    /maximum height or range/.test(LAB_TOOL_INSTRUCTION),
  "the instruction maps projectile requests (height, range, trajectory) to the projectile sim",
);
assert(
  /\[\[lab: balance <equation>\]\]/.test(LAB_TOOL_INSTRUCTION),
  "the instruction maps equation balancing to the balancer",
);
assert(
  /molar mass, moles, concentration or dilution/.test(LAB_TOOL_INSTRUCTION),
  "the instruction maps molar mass / moles / concentration / dilution to the calculator",
);
assert(
  /\[\[lab: molecule <name or formula>\]\]/.test(LAB_TOOL_INSTRUCTION),
  "the instruction maps molecule-shape requests to the viewer",
);
assert(
  /graph a mathematical function/.test(LAB_TOOL_INSTRUCTION) &&
    /\[\[explore: graph/.test(LAB_TOOL_INSTRUCTION),
  "the instruction keeps plain function graphs on the graph tool, never a lab",
);
assert(
  /NO marker at all/.test(LAB_TOOL_INSTRUCTION),
  "the instruction sends conceptual questions to a normal answer",
);
assert(
  /never both/.test(LAB_TOOL_INSTRUCTION),
  "the one-marker-of-any-kind rule is stated",
);

/* -------------------------------------------------------------------------- */
/* 6. Client re-validation — the render gate                                  */
/* -------------------------------------------------------------------------- */

const validSpecs: AshyLab[] = [
  { type: "sim", kind: "motion" },
  { type: "sim", kind: "projectile" },
  { type: "balance", equation: "Fe + O2 -> Fe2O3" },
  { type: "moles", formula: "H2O" },
  { type: "lewis", formula: "CO3^2-" },
  { type: "molecule", target: "water" },
  { type: "equilibrium" },
];
for (const spec of validSpecs) {
  assert(
    validateLabSpec(spec) !== null,
    `validated spec is allowed to render: ${JSON.stringify(spec)}`,
  );
}

assert(
  labToolId(validateLabSpec(motion)!) === "physics-motion",
  "motion routes to the physics motion tool",
);
assert(
  labToolId(validateLabSpec(projectile)!) === "physics-projectile",
  "projectile routes to the physics projectile tool",
);
assert(
  labToolId({ type: "balance", equation: "Fe + O2 -> Fe2O3" }) === "chem-balance",
  "balance routes to the equation balancer",
);
assert(
  labToolId({ type: "moles", formula: "H2O" }) === "chem-quantities",
  "moles routes to the quantities calculator",
);
assert(
  labToolId({ type: "lewis", formula: "CO3^2-" }) === "chem-structure",
  "lewis routes to the structure tool",
);
assert(
  labToolId({ type: "molecule", target: "water" }) === "molecules-3d",
  "molecule routes to the 3D viewer",
);
assert(
  labToolId({ type: "equilibrium" }) === "chem-equilibrium",
  "equilibrium routes to the ICE-table tool",
);

// Rejections — everything malformed renders NOTHING (normal text answer).
assert(
  validateLabSpec({ type: "sim", kind: "chess" } as unknown as AshyLab) === null,
  "an unknown simulation kind renders nothing",
);
assert(
  validateLabSpec({ type: "balance", equation: "rm -rf /" } as unknown as AshyLab) ===
    null,
  "an equation without an arrow renders nothing",
);
assert(
  validateLabSpec({
    type: "balance",
    equation: "<script>alert(1)</script>",
  } as unknown as AshyLab) === null,
  "markup without an equation arrow is rejected before any tool opens",
);
assert(
  validateLabSpec({
    type: "balance",
    equation: `${"A".repeat(300)} -> B`,
  } as unknown as AshyLab) === null,
  "an over-long equation payload is rejected (bounded text, never executed)",
);
assert(
  validateLabSpec({ type: "molecule", target: "unobtanium" }) === null,
  "an unsupported molecule renders no tool (never a silent substitute)",
);
assert(
  validateLabSpec({ type: "molecule", target: "water" }) !== null,
  "a bundled molecule renders",
);
assert(
  validateLabSpec({ type: "moles", formula: "x".repeat(200) }) === null,
  "an over-long formula renders nothing",
);
assert(validateLabSpec(undefined) === null, "an absent spec renders nothing");

// End-to-end: every required request → parsed spec → passes the render gate.
for (const spec of [motion, projectile, balance, moles, molecule]) {
  assert(
    spec !== null && validateLabSpec(spec) !== null,
    `required request survives parse → validation → render: ${JSON.stringify(spec)}`,
  );
}

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("Lab routing tests FAILED");
  process.exit(1);
}
console.log("Lab routing tests passed");
