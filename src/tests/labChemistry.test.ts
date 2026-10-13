/**
 * Tests for the Phase 4 chemistry engine.
 *
 * Run with:  bun src/tests/labChemistry.test.ts
 * Exit code 0 = all assertions passed.
 *
 * These exercise the SAME pure functions the chemistry tools and the Ashy
 * chat action use in production (src/lib/lab/formula.ts, equation.ts,
 * structure.ts, equilibrium.ts). Molar masses come only from the bundled
 * CIAAW abridged weights — anything the lab cannot verify is refused, and
 * these tests pin down that refusal behaviour too. No DOM, no network.
 */

import {
  AVOGADRO,
  concentration,
  massFromMoles,
  molarMass,
  molesFromMass,
  parseFormula,
  parseSpecies,
  particlesFromMoles,
  percentComposition,
  solveDilution,
} from "../lib/lab/formula";
import {
  balanceEquation,
  checkEquation,
  formatEquation,
  parseEquation,
} from "../lib/lab/equation";
import {
  atomInfo,
  electronConfiguration,
  solveLewis,
} from "../lib/lab/structure";
import {
  EQUILIBRIUM_ASSUMPTIONS,
  solveEquilibrium,
} from "../lib/lab/equilibrium";

let checks = 0;
let failures = 0;

function assert(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

function close(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** Parse a formula, asserting success, and return the species. */
function mustParse(formula: string): { atoms: Record<string, number>; charge: number } {
  const r = parseFormula(formula);
  if (!r.ok) {
    failures += 1;
    console.error(`FAIL  expected "${formula}" to parse, got: ${r.error}`);
    throw new Error(r.error);
  }
  return r.value;
}

function atomCount(formula: string, symbol: string): number {
  return mustParse(formula).atoms[symbol] ?? 0;
}

function formulaError(formula: string): string {
  const r = parseFormula(formula);
  return r.ok ? "" : r.error;
}

function massOf(formula: string): { ok: true; value: number } | { ok: false; error: string } {
  const r = parseFormula(formula);
  if (!r.ok) return { ok: false, error: r.error };
  return molarMass(r.value);
}

/* -------------------------------------------------------------------------- */
/* 1. Formula parsing                                                         */
/* -------------------------------------------------------------------------- */

const water = mustParse("H2O");
assert(water.atoms.H === 2 && water.atoms.O === 1, "formula: H2O has 2 H and 1 O");
assert(Object.keys(water.atoms).length === 2 && water.charge === 0, "formula: water is neutral");

assert(atomCount("CO3^2-", "C") === 1 && atomCount("CO3^2-", "O") === 3, "formula: CO3 counts");
assert(mustParse("CO3^2-").charge === -2, "formula: ^2- becomes charge −2");
assert(mustParse("Cu2+").charge === 2, "formula: Cu2+ becomes charge +2");
assert(mustParse("Al^3+").charge === 3, "formula: Al^3+ becomes charge +3");
assert(mustParse("SO4^2-").charge === -2, "formula: SO4^2- becomes charge −2");

const hexaammine = mustParse("[Co(NH3)6]3+");
assert(
  hexaammine.atoms.Co === 1 && hexaammine.atoms.N === 6 && hexaammine.atoms.H === 18,
  "formula: square brackets nest ([Co(NH3)6]3+)",
);
assert(hexaammine.charge === 3, "formula: a trailing 3+ applies to the whole complex");

assert(atomCount("Ca(NO3)2", "Ca") === 1, "formula: Ca from Ca(NO3)2");
assert(atomCount("Ca(NO3)2", "N") === 2 && atomCount("Ca(NO3)2", "O") === 6,
  "formula: parentheses multiply (NO3)2");
assert(atomCount("Fe2(SO4)3", "Fe") === 2, "formula: leading counts work inside formulas");
assert(atomCount("Fe2(SO4)3", "S") === 3 && atomCount("Fe2(SO4)3", "O") === 12,
  "formula: nested group maths Fe2(SO4)3");

const hydrate = mustParse("CuSO4.5H2O");
assert(
  hydrate.atoms.Cu === 1 && hydrate.atoms.S === 1 && hydrate.atoms.O === 9 && hydrate.atoms.H === 10,
  "formula: hydrate CuSO4·5H2O multiplies the water",
);
const hydrateDot = mustParse("CuSO4·5H2O");
assert(
  JSON.stringify(hydrateDot.atoms) === JSON.stringify(hydrate.atoms),
  "formula: the middle-dot hydrate form is equivalent",
);

assert(formulaError("") === "The formula is empty.", "formula: empty input is refused");
assert(formulaError("   ") === "The formula is empty.", "formula: blank input is refused");
assert(/Unknown element "Xx"/.test(formulaError("Xx2")), "formula: unknown elements are named");
assert(/whole number between 1 and 999/.test(formulaError("H0")), "formula: a zero atom count is refused");
assert(/whole number between 1 and 999/.test(formulaError("H1000")), "formula: counts above 999 are refused");
assert(/Unmatched closing bracket/.test(formulaError("H2O)")), "formula: stray ')' is refused");
assert(/Unclosed bracket/.test(formulaError("Ca(PO4")), "formula: unclosed '(' is refused");
assert(/Unexpected character "2"/.test(formulaError("2H2O")),
  "formula: a leading coefficient is refused (coefficients live on species, not formulas)");
assert(/too long/.test(formulaError("H".repeat(121))), "formula: over-long input is refused");
assert(/invalid/.test(formulaError("Fe99+")), "formula: absurd charges are refused");

/* -------------------------------------------------------------------------- */
/* 2. Species tokens — coefficient + formula + state                          */
/* -------------------------------------------------------------------------- */

const ca = parseSpecies("2CaCO3(s)");
assert(ca.ok && ca.coefficient === 2, "species: 2CaCO3(s) has coefficient 2");
if (ca.ok) {
  assert(ca.species.atoms.Ca === 1 && ca.species.atoms.C === 1 && ca.species.atoms.O === 3,
    "species: the (s) state suffix is stripped before parsing");
  assert(ca.species.charge === 0, "species: calcium carbonate is neutral");
}
const waterToken = parseSpecies("3H2O(l)");
assert(waterToken.ok && waterToken.coefficient === 3 && waterToken.species.atoms.O === 1,
  "species: 3H2O(l) keeps its coefficient and drops (l)");
const electron = parseSpecies("e-");
assert(electron.ok && electron.species.charge === -1 && Object.keys(electron.species.atoms).length === 0,
  "species: a bare electron is charge with no atoms (half-equations)");
assert(!parseSpecies("").ok, "species: empty tokens are refused");
const zeroCoeff = parseSpecies("0H2O");
assert(!zeroCoeff.ok && /1–999/.test(zeroCoeff.error), "species: coefficient 0 is refused");
const bigCoeff = parseSpecies("1000H2O");
assert(!bigCoeff.ok, "species: coefficients above 999 are refused");

/* -------------------------------------------------------------------------- */
/* 3. Molar mass and percent composition (bundled CIAAW weights only)         */
/* -------------------------------------------------------------------------- */

const massWater = massOf("H2O");
assert(massWater.ok && close(massWater.value, 18.015), "molar mass: H2O = 2·1.008 + 15.999 = 18.015 g/mol");
const massCO2 = massOf("CO2");
assert(massCO2.ok && close(massCO2.value, 44.009), "molar mass: CO2 = 44.009 g/mol");
const massNaCl = massOf("NaCl");
assert(massNaCl.ok && close(massNaCl.value, 58.44), "molar mass: NaCl = 58.44 g/mol");
const massGlucose = massOf("C6H12O6");
assert(massGlucose.ok && close(massGlucose.value, 180.156), "molar mass: glucose = 180.156 g/mol");
const massHydrate = massOf("CuSO4.5H2O");
assert(massHydrate.ok && close(massHydrate.value, 249.677),
  "molar mass: blue vitriol hydrate = 249.677 g/mol");

const massGold = massOf("Au");
assert(!massGold.ok && /No bundled atomic weight for: Au/.test(massGold.error),
  "molar mass: an element without a verified weight is REFUSED, not guessed");
const massUranium = massOf("UO2");
assert(!massUranium.ok && /No bundled atomic weight for: U/.test(massUranium.error),
  "molar mass: compounds with unverified elements are refused too");

const comp = percentComposition(water);
assert(comp.ok, "composition: water's composition is computable");
if (comp.ok) {
  assert(close(comp.total, 18.015), "composition: the total is the molar mass");
  assert(comp.rows.length === 2 && comp.rows[0].symbol === "H" && comp.rows[1].symbol === "O",
    "composition: one row per element, sorted");
  assert(close(comp.rows[0].percent, (1.008 * 2) / 18.015 * 100, 1e-9),
    "composition: hydrogen is ≈11.19 % of water by mass");
  assert(close(comp.rows[0].percent + comp.rows[1].percent, 100, 1e-9),
    "composition: the mass fractions sum to 100 %");
}
assert(!percentComposition(mustParse("Au")).ok, "composition: unverified weights refuse the whole table");

/* -------------------------------------------------------------------------- */
/* 4. Moles, particles, concentration                                          */
/* -------------------------------------------------------------------------- */

assert(close(molesFromMass(18.015, 18.015) ?? -1, 1), "moles: n = m/M = 1 mol");
assert(molesFromMass(0, 5) === 0, "moles: zero mass is zero moles");
assert(molesFromMass(5, 0) === null, "moles: a zero molar mass is refused");
assert(molesFromMass(5, -1) === null, "moles: a negative molar mass is refused");
assert(molesFromMass(Number.NaN, 5) === null, "moles: NaN never converts");
assert(close(massFromMoles(2, 18.015) ?? -1, 36.03), "moles: m = n·M = 36.03 g");
assert(massFromMoles(1, -5) === null, "moles: negative molar mass is refused");
assert(massFromMoles(Number.POSITIVE_INFINITY, 5) === null, "moles: infinite moles are refused");
assert(particlesFromMoles(1) === AVOGADRO, "particles: 1 mol = N_A particles (exact SI value)");
assert(AVOGADRO === 6.02214076e23, "particles: Avogadro's constant is the exact defined value");
assert(particlesFromMoles(0) === 0, "particles: zero moles is zero particles");
assert(particlesFromMoles(Number.NaN) === null, "particles: NaN never converts");

assert(close(concentration(2, 0.5) ?? -1, 4), "concentration: c = n/V = 4 mol/L");
assert(concentration(1, 0) === null, "concentration: zero volume is refused");
assert(concentration(1, -2) === null, "concentration: negative volume is refused");
assert(concentration(Number.NaN, 1) === null, "concentration: NaN never converts");

/* -------------------------------------------------------------------------- */
/* 5. Dilution — C1·V1 = C2·V2 (exactly three knowns)                         */
/* -------------------------------------------------------------------------- */

const d1 = solveDilution({ c1: 2, v1: 100, v2: 400 });
assert(d1.ok && d1.solved === "c2" && close(d1.c2, 0.5), "dilution: solve C2 = C1V1/V2 = 0.5");
const d2 = solveDilution({ c2: 0.5, v1: 100, v2: 400 });
assert(d2.ok && d2.solved === "c1" && close(d2.c1, 2), "dilution: solve C1 = C2V2/V1");
const d3 = solveDilution({ c1: 2, v1: 100, c2: 0.5 });
assert(d3.ok && d3.solved === "v2" && close(d3.v2, 400), "dilution: solve V2 = C1V1/C2");
const d4 = solveDilution({ c1: 2, c2: 0.5, v2: 400 });
assert(d4.ok && d4.solved === "v1" && close(d4.v1, 100), "dilution: solve V1 = C2V2/C1");

const dTooFew = solveDilution({ c1: 2, v1: 100 });
assert(!dTooFew.ok && /exactly three/.test(dTooFew.error), "dilution: two knowns are refused");
const dTooMany = solveDilution({ c1: 2, v1: 100, c2: 0.5, v2: 400 });
assert(!dTooMany.ok && /exactly three/.test(dTooMany.error), "dilution: four knowns are refused");
const dZero = solveDilution({ c1: 0, v1: 100, v2: 400 });
assert(!dZero.ok && /positive/.test(dZero.error), "dilution: zeros are refused");
const dNegative = solveDilution({ c1: 2, v1: -50, v2: 400 });
assert(!dNegative.ok && /positive/.test(dNegative.error), "dilution: negative volumes are refused");

/* -------------------------------------------------------------------------- */
/* 6. Equation parsing                                                        */
/* -------------------------------------------------------------------------- */

const eqWater = parseEquation("H2 + O2 -> H2O");
assert(eqWater.ok, "equation: H2 + O2 -> H2O parses");
if (eqWater.ok) {
  assert(eqWater.value.reactants.length === 2 && eqWater.value.products.length === 1,
    "equation: species land on the correct side");
  assert(eqWater.value.reactants[0].raw === "H2" && eqWater.value.products[0].raw === "H2O",
    "equation: raw species text is preserved");
  assert(eqWater.value.elements.join(",") === "H,O", "equation: elements are collected and sorted");
}
assert(parseEquation("2H2 + O2 → 2H2O").ok, "equation: the unicode → arrow is accepted");
assert(parseEquation("H2 + O2 ⇌ H2O").ok, "equation: the equilibrium arrow ⇌ is accepted");
assert(parseEquation("H2 + O2 = H2O").ok, "equation: a plain '=' is accepted as an arrow");
assert(parseEquation("C + O2 -> CO2").ok, "equation: single-species sides parse");

const eqEmpty = parseEquation("");
assert(!eqEmpty.ok && /empty/.test(eqEmpty.error), "equation: empty input is refused");
const eqType = parseEquation(42 as unknown as string);
assert(!eqType.ok && /must be text/.test(eqType.error), "equation: non-text input is refused");
const eqNoArrow = parseEquation("H2 + O2");
assert(!eqNoArrow.ok && /No reaction arrow/.test(eqNoArrow.error), "equation: a missing arrow is named");
const eqTwoArrows = parseEquation("H2 -> O2 -> H2O");
assert(!eqTwoArrows.ok && /more than one/.test(eqTwoArrows.error), "equation: two arrows are refused");
const eqOneSided = parseEquation("-> H2O");
assert(!eqOneSided.ok && /Both sides/.test(eqOneSided.error), "equation: an empty side is refused");
const eqBadSpecies = parseEquation("H2 + Qq2 -> H2O");
assert(!eqBadSpecies.ok && /Unknown element/.test(eqBadSpecies.error), "equation: bad species are named");
const eqTooLong = parseEquation("H2 + O2 -> H2O ".repeat(25));
assert(!eqTooLong.ok && /too long/.test(eqTooLong.error), "equation: over-long input is refused");
const eqTooMany = parseEquation(`${Array(25).fill("H2").join(" + ")} -> H2`);
assert(!eqTooMany.ok && /Too many species/.test(eqTooMany.error), "equation: 25+ species are refused");
const eqStray = parseEquation("H2 + -> H2O");
assert(!eqStray.ok, "equation: a trailing '+' is refused rather than guessed");

/* -------------------------------------------------------------------------- */
/* 7. Charge-aware '+' splitting (charged species keep their charge)          */
/* -------------------------------------------------------------------------- */

const eqAcid = parseEquation("H+ + OH- -> H2O");
assert(eqAcid.ok, "equation: H+ + OH- -> H2O parses");
if (eqAcid.ok) {
  assert(eqAcid.value.reactants.length === 2, "equation: two reactants, not one mangled token");
  assert(eqAcid.value.reactants[0].species.charge === 1, "equation: H+ keeps its +1 charge");
  assert(eqAcid.value.reactants[1].species.charge === -1, "equation: OH- keeps its −1 charge");
}
const eqRedox = parseEquation("MnO4^- + Cl^- + H+ -> Mn2+ + Cl2 + H2O");
assert(eqRedox.ok, "equation: a full redox line with charged species parses");
if (eqRedox.ok) {
  const charges = eqRedox.value.reactants.map((s) => s.species.charge);
  assert(charges.join(",") === "-1,-1,1", "equation: reactant charges survive splitting");
  assert(eqRedox.value.reactants[0].species.atoms.Mn === 1 && eqRedox.value.reactants[0].species.atoms.O === 4,
    "equation: MnO4^- keeps its atoms");
  assert(eqRedox.value.products.map((s) => s.species.charge).join(",") === "2,0,0",
    "equation: product charges survive splitting");
}
assert(parseEquation("Na+ + H+ + Cl- -> NaCl + H2").ok, "equation: three charged reactants in a row parse");
const eqPlusStress = parseEquation("++++ -> H2O");
assert(!eqPlusStress.ok, "equation: pathological '++++' fails gracefully instead of hanging");

/* -------------------------------------------------------------------------- */
/* 8. Balancing (exact, charge included)                                      */
/* -------------------------------------------------------------------------- */

const bWater = balanceEquation("H2 + O2 -> H2O");
assert(bWater.ok && bWater.balanced, "balance: water balances");
if (bWater.ok) {
  assert(bWater.coefficients.join(",") === "2,1,2", "balance: 2H2 + O2 -> 2H2O");
  assert(bWater.text === "2H2 + O2 -> 2H2O", "balance: the rendered equation matches");
  assert(bWater.rows.every((r) => r.ok), "balance: every verification row (incl. charge) passes");
  assert(bWater.rows.some((r) => r.key === "charge"), "balance: charge is verified by code, not assumed");
}
const bIron = balanceEquation("Fe + O2 -> Fe2O3");
assert(bIron.ok && bIron.coefficients.join(",") === "4,3,2", "balance: 4Fe + 3O2 -> 2Fe2O3");
const bAlumina = balanceEquation("Al + O2 -> Al2O3");
assert(bAlumina.ok && bAlumina.coefficients.join(",") === "4,3,2", "balance: 4Al + 3O2 -> 2Al2O3");
const bPropane = balanceEquation("C3H8 + O2 -> CO2 + H2O");
assert(bPropane.ok && bPropane.coefficients.join(",") === "1,5,3,4",
  "balance: C3H8 + 5O2 -> 3CO2 + 4H2O");
const bChlorate = balanceEquation("KClO3 -> KCl + O2");
assert(bChlorate.ok && bChlorate.coefficients.join(",") === "2,2,3", "balance: 2KClO3 -> 2KCl + 3O2");
const bCombust = balanceEquation("CH4 + O2 -> CO2 + H2O");
assert(bCombust.ok && bCombust.coefficients.join(",") === "1,2,1,2", "balance: methane combustion");
const bPerm = balanceEquation("KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O");
assert(bPerm.ok && bPerm.coefficients.join(",") === "2,16,2,2,5,8",
  "balance: the classic six-species permanganate titration");

const bRedox = balanceEquation("MnO4^- + Cl^- + H+ -> Mn2+ + Cl2 + H2O");
assert(bRedox.ok && bRedox.balanced, "balance: redox with charges balances");
if (bRedox.ok) {
  assert(bRedox.coefficients.join(",") === "2,10,16,2,5,8",
    "balance: 2MnO4^- + 10Cl^- + 16H+ -> 2Mn2+ + 5Cl2 + 8H2O");
  assert(
    bRedox.text === "2MnO4^- + 10Cl^- + 16H+ -> 2Mn2+ + 5Cl2 + 8H2O",
    "balance: the rendered redox equation matches",
  );
  const chargeRow = bRedox.rows.find((r) => r.key === "charge");
  assert(chargeRow !== undefined && chargeRow.ok && chargeRow.left === 4 && chargeRow.right === 4,
    "balance: total charge +4 on both sides, checked by code");
}
const bAcid = balanceEquation("H+ + OH- -> H2O");
assert(bAcid.ok && bAcid.coefficients.join(",") === "1,1,1", "balance: neutralisation balances");

const bImpossible = balanceEquation("Fe -> Fe2O3");
assert(!bImpossible.ok && /cannot be balanced/.test(bImpossible.error),
  "balance: an element on one side only is refused, not fudged");
const bNoOxygen = balanceEquation("H2 -> H2O");
assert(!bNoOxygen.ok && /cannot be balanced/.test(bNoOxygen.error),
  "balance: a missing element makes balancing impossible");
const bEmpty = balanceEquation("");
assert(!bEmpty.ok && /empty/.test(bEmpty.error), "balance: empty input is refused");
const bNoArrow = balanceEquation("H2 + O2");
assert(!bNoArrow.ok, "balance: no arrow, no balancing");
const bEmptySide = balanceEquation("H2 + O2 ->");
assert(!bEmptySide.ok && /Both sides/.test(bEmptySide.error), "balance: an empty product side is refused");
const bIdempotent = balanceEquation("2H2 + O2 -> 2H2O");
assert(bIdempotent.ok && bIdempotent.coefficients.join(",") === "2,1,2",
  "balance: coefficients already in the text are normalised, not doubled");

/* -------------------------------------------------------------------------- */
/* 9. Verifying student-entered coefficients (never trusted)                  */
/* -------------------------------------------------------------------------- */

const okCheck = checkEquation("H2 + O2 -> H2O", [2, 1, 2]);
assert(okCheck.ok && okCheck.balanced && okCheck.problems.length === 0,
  "check: 2H2 + O2 -> 2H2O is verified as balanced");
const badCheck = checkEquation("H2 + O2 -> H2O", [2, 2, 2]);
assert(badCheck.ok && !badCheck.balanced, "check: wrong coefficients are caught");
if (badCheck.ok) {
  assert(badCheck.problems.some((p) => /^O:/.test(p)),
    "check: the offending element is named with both counts");
}
const badCharge = checkEquation("MnO4^- + Cl^- + H+ -> Mn2+ + Cl2 + H2O", [1, 1, 1, 1, 1, 1]);
assert(badCharge.ok && !badCharge.balanced, "check: charge imbalance is caught");
if (badCharge.ok) {
  assert(badCharge.problems.some((p) => /Charge/.test(p)),
    "check: the charge row reports both totals");
}
const goodRedox = checkEquation("MnO4^- + Cl^- + H+ -> Mn2+ + Cl2 + H2O", [2, 10, 16, 2, 5, 8]);
assert(goodRedox.ok && goodRedox.balanced && goodRedox.problems.length === 0,
  "check: the correct redox coefficients verify");
const wrongCount = checkEquation("H2 + O2 -> H2O", [1, 1]);
assert(!wrongCount.ok && /Expected 3 coefficients/.test(wrongCount.error),
  "check: the wrong number of coefficients is refused");
const fractional = checkEquation("H2 + O2 -> H2O", [1.5, 1, 1]);
assert(!fractional.ok && /whole numbers/.test(fractional.error), "check: fractional coefficients are refused");
const negative = checkEquation("H2 + O2 -> H2O", [-1, 1, 1]);
assert(!negative.ok, "check: negative coefficients are refused");
const huge = checkEquation("H2 + O2 -> H2O", [1000, 1, 1]);
assert(!huge.ok, "check: coefficients above 999 are refused");
const allZero = checkEquation("H2 -> H2", [0, 0]);
assert(allZero.ok && allZero.problems.some((p) => /zero/.test(p)),
  "check: an all-zero answer is flagged as meaningless");
const garbage = checkEquation("not an equation", [1]);
assert(!garbage.ok && /arrow/.test(garbage.error), "check: unparsable text is refused");

// formatEquation is what the UI renders: 1s are silent, raw text is reused.
const fEq = parseEquation("K + Br2 -> KBr");
assert(fEq.ok, "equation: K + Br2 -> KBr parses for the formatting check");
if (fEq.ok) {
  assert(formatEquation(fEq.value, [2, 1, 2]) === "2K + Br2 -> 2KBr",
    "format: coefficients are prefixed only when > 1");
}

/* -------------------------------------------------------------------------- */
/* 10. Atomic structure — Aufbau filling with documented exceptions           */
/* -------------------------------------------------------------------------- */

const oxygen = atomInfo("O");
assert(oxygen.ok, "atom: oxygen resolves");
if (oxygen.ok) {
  assert(oxygen.value.z === 8 && oxygen.value.name === "oxygen", "atom: Z and name are correct");
  assert(oxygen.value.config === "1s2 2s2 2p4", "atom: oxygen's configuration string");
  assert(oxygen.value.shells.join(",") === "2,6", "atom: shells are 2, 6");
  assert(oxygen.value.period === 2 && oxygen.value.group === 16, "atom: period 2, group 16");
  assert(oxygen.value.weight !== null && close(oxygen.value.weight, 15.999), "atom: bundled CIAAW weight");
  assert(!oxygen.value.exceptionApplied, "atom: oxygen follows plain Aufbau order");
}
const sodium = atomInfo("Na");
assert(sodium.ok && sodium.value.group === 1 && sodium.value.period === 3 && close(sodium.value.weight ?? 0, 22.99),
  "atom: sodium is period 3, group 1, 22.99 g/mol");
const iron = atomInfo("Fe");
assert(iron.ok, "atom: iron resolves");
if (iron.ok) {
  assert(iron.value.group === null, "atom: transition metals have no single main group");
  assert(iron.value.shells.join(",") === "2,8,14,2" && iron.value.shells.reduce((s, n) => s + n, 0) === 26,
    "atom: iron's shells sum to Z = 26");
  assert(close(iron.value.weight ?? 0, 55.845), "atom: iron's bundled weight");
}
const chromium = atomInfo("Cr");
assert(chromium.ok, "atom: chromium resolves");
if (chromium.ok) {
  assert(chromium.value.exceptionApplied, "atom: chromium flags its Aufbau exception");
  assert(/4s1/.test(chromium.value.config) && /3d5/.test(chromium.value.config),
    "atom: chromium is 3d5 4s1, not 3d4 4s2");
  assert(chromium.value.shells.reduce((s, n) => s + n, 0) === 24, "atom: still 24 electrons");
}
const copper = atomInfo("Cu");
assert(copper.ok && copper.value.exceptionApplied && /3d10/.test(copper.value.config) && /4s1/.test(copper.value.config),
  "atom: copper's 3d10 4s1 exception is applied");
const uranium = atomInfo("U");
assert(uranium.ok && uranium.value.exceptionApplied &&
  uranium.value.shells.reduce((s, n) => s + n, 0) === 92,
  "atom: uranium's documented exception keeps 92 electrons");

assert(electronConfiguration(1)?.config === "1s1", "atom: hydrogen is 1s1");
assert(electronConfiguration(118)?.config.endsWith("7p6") === true, "atom: oganesson ends at 7p6");
assert(
  (electronConfiguration(118)?.shells ?? []).reduce((s, n) => s + n, 0) === 118,
  "atom: shell counts always sum to Z",
);
assert(electronConfiguration(0) === null, "atom: Z = 0 is refused");
assert(electronConfiguration(119) === null, "atom: Z beyond 118 is refused");
assert(electronConfiguration(1.5) === null, "atom: fractional Z is refused");
assert(!atomInfo("Xx").ok, "atom: fake symbols are refused");
assert(!atomInfo("").ok, "atom: empty input is refused");
const atomCase = atomInfo("cl");
assert(atomCase.ok && atomCase.value.symbol === "Cl" && atomCase.value.group === 17,
  "atom: lookup is case-insensitive (cl → chlorine, group 17)");

/* -------------------------------------------------------------------------- */
/* 11. Lewis structures — deduced where possible, refused where not           */
/* -------------------------------------------------------------------------- */

const lewisWater = solveLewis("H2O");
assert(lewisWater.ok, "lewis: water resolves");
if (lewisWater.ok) {
  assert(lewisWater.atoms.length === 3 && lewisWater.bonds.length === 2, "lewis: water has 3 atoms, 2 bonds");
  assert(lewisWater.atoms[lewisWater.central].symbol === "O", "lewis: oxygen is the central atom");
  assert(lewisWater.atoms.every((a) => a.formalCharge === 0), "lewis: every atom has formal charge 0");
  assert(lewisWater.atoms.every((a) => !a.incomplete), "lewis: no incomplete octets in water");
  assert(lewisWater.totalValence === 8, "lewis: water has 8 valence electrons (2 bonds + 2 lone pairs)");
}
const lewisMethane = solveLewis("CH4");
assert(lewisMethane.ok && lewisMethane.bonds.length === 4, "lewis: methane has four C–H bonds");
if (lewisMethane.ok) {
  assert(lewisMethane.atoms.every((a) => !a.incomplete) && lewisMethane.atoms.every((a) => a.formalCharge === 0),
    "lewis: methane is octet-satisfied with zero formal charges");
}
const lewisCO2 = solveLewis("CO2");
assert(lewisCO2.ok && lewisCO2.bonds.length === 2, "lewis: CO2 has two C–O bonds");
if (lewisCO2.ok) {
  assert(lewisCO2.bonds.every((b) => b.order === 2), "lewis: both C=O bonds come out double");
  assert(lewisCO2.atoms.every((a) => a.formalCharge === 0), "lewis: CO2 has zero formal charges");
}
const lewisN2 = solveLewis("N2");
assert(lewisN2.ok && lewisN2.bonds[0].order === 3, "lewis: nitrogen gas is a triple bond");
const lewisO2 = solveLewis("O2");
assert(lewisO2.ok && lewisO2.bonds[0].order === 2, "lewis: oxygen gas is a double bond");
const lewisCarbonate = solveLewis("CO3^2-");
assert(lewisCarbonate.ok, "lewis: carbonate resolves");
if (lewisCarbonate.ok) {
  assert(lewisCarbonate.atoms.length === 4 && lewisCarbonate.bonds.length === 3, "lewis: carbonate is C with 3 O");
  assert(lewisCarbonate.speciesCharge === -2, "lewis: the species charge is carried through");
  assert(lewisCarbonate.atoms.reduce((s, a) => s + a.formalCharge, 0) === -2,
    "lewis: formal charges always sum to the species charge");
  assert(lewisCarbonate.notes.some((n) => /Resonance/.test(n)),
    "lewis: resonance is flagged — the real ion is a blend of the drawings");
  assert(lewisCarbonate.notes.some((n) => /Formal charges/.test(n)),
    "lewis: non-zero formal charges are reported, not hidden");
}
const lewisPeroxide = solveLewis("H2O2");
assert(lewisPeroxide.ok && lewisPeroxide.bonds.length === 3, "lewis: peroxide is H–O–O–H");
if (lewisPeroxide.ok) {
  assert(lewisPeroxide.notes.some((n) => /Peroxy/.test(n)), "lewis: the O–O chain is called out");
}

const lewisOrganic = solveLewis("C2H6O");
assert(!lewisOrganic.ok && /ethanol/.test(lewisOrganic.error),
  "lewis: two carbons are REFUSED — C2H6O is ethanol or dimethyl ether, the formula cannot say");
const lewisRadical = solveLewis("NO");
assert(!lewisRadical.ok && /radical/.test(lewisRadical.error),
  "lewis: odd-electron species are refused rather than drawn wrong");
const lewisMetal = solveLewis("FeCl3");
assert(!lewisMetal.ok && /main-group/.test(lewisMetal.error),
  "lewis: transition metals are outside the model's scope");
const lewisHydrate = solveLewis("H2SO4.H2O");
assert(!lewisHydrate.ok && /lattice water/.test(lewisHydrate.error),
  "lewis: hydrates are lattice structures, refused honestly");
assert(!solveLewis("Na2CO3.10H2O").ok, "lewis: hydrated salts are refused outright, never guessed");
assert(!solveLewis("CuSO4.5H2O").ok, "lewis: CuSO4·5H2O is refused outright, never guessed");
const lewisBig = solveLewis("C10H8");
assert(!lewisBig.ok && /too large/.test(lewisBig.error), "lewis: large formulas are refused");
const lewisEmpty = solveLewis("");
assert(!lewisEmpty.ok && /empty/.test(lewisEmpty.error), "lewis: empty input is refused");

/* -------------------------------------------------------------------------- */
/* 12. Equilibrium — ICE solver for aA ⇌ bB                                   */
/* -------------------------------------------------------------------------- */

const eq1 = solveEquilibrium({ k: 4, a: 1, b: 1, a0: 1, b0: 0, volume: 1 });
assert(eq1.ok, "equilibrium: a simple A ⇌ B case solves");
if (eq1.ok) {
  assert(close(eq1.eqA, 0.2, 1e-6), "equilibrium: [A] = 0.2 mol/L at K = 4");
  assert(close(eq1.eqB, 0.8, 1e-6), "equilibrium: [B] = 0.8 mol/L at K = 4");
  assert(close(eq1.percentAConverted, 80, 1e-6), "equilibrium: 80 % of A converts");
  assert(close(eq1.q ?? -1, 0), "equilibrium: Q starts at 0");
  assert(eq1.direction === "forward", "equilibrium: Q < K → the reaction runs forward");
  assert(close(eq1.changeA, -0.8, 1e-6) && close(eq1.changeB, 0.8, 1e-6),
    "equilibrium: the change row matches the stoichiometry");
  assert(close(eq1.eqB / eq1.eqA, 4, 1e-6), "equilibrium: recomputing Q from the answers gives K");
}

const eqAt = solveEquilibrium({ k: 4, a: 1, b: 1, a0: 0.2, b0: 0.8, volume: 1 });
assert(eqAt.ok && eqAt.direction === "at-equilibrium", "equilibrium: Q = K is detected");
if (eqAt.ok) assert(close(eqAt.extent, 0, 1e-6), "equilibrium: nothing shifts when already at equilibrium");

const eqBack = solveEquilibrium({ k: 4, a: 1, b: 1, a0: 0, b0: 1, volume: 1 });
assert(eqBack.ok && eqBack.direction === "reverse", "equilibrium: Q > K → the reaction runs in reverse");
if (eqBack.ok) {
  assert(close(eqBack.eqA, 0.2, 1e-6) && close(eqBack.eqB, 0.8, 1e-6),
    "equilibrium: the final state is the same whether you start from A or from B");
  assert(close(eqBack.extent, -0.2, 1e-6), "equilibrium: the extent is negative when the reaction runs backwards");
  assert(close(eqBack.percentAConverted, 0), "equilibrium: nothing to convert without any A");
}

const eqSquared = solveEquilibrium({ k: 1, a: 1, b: 2, a0: 1, b0: 0, volume: 1 });
assert(eqSquared.ok, "equilibrium: a 1:2 stoichiometry solves");
if (eqSquared.ok) {
  assert(close(eqSquared.eqA, 0.60961, 1e-4) && close(eqSquared.eqB, 0.78078, 1e-4),
    "equilibrium: A ⇌ 2B gives [A] ≈ 0.6096, [B] ≈ 0.7808 mol/L");
  assert(close((eqSquared.eqB ** 2) / eqSquared.eqA, 1, 1e-5), "equilibrium: Q([answers]) = K for squared terms");
}

const eqDimer = solveEquilibrium({ k: 1, a: 2, b: 1, a0: 1, b0: 0, volume: 1 });
assert(eqDimer.ok, "equilibrium: a 2:1 stoichiometry solves");
if (eqDimer.ok) {
  assert(close(eqDimer.eqA, 0.5, 1e-6) && close(eqDimer.eqB, 0.25, 1e-6),
    "equilibrium: 2A ⇌ B gives [A] = 0.5, [B] = 0.25 mol/L");
}

assert(
  JSON.stringify(solveEquilibrium({ k: 4, a: 1, b: 1, a0: 1, b0: 0, volume: 1 })) ===
    JSON.stringify(solveEquilibrium({ k: 4, a: 1, b: 1, a0: 1, b0: 0, volume: 1 })),
  "equilibrium: the solver is deterministic (bisection, no rounding drift)",
);

const eqBadK = solveEquilibrium({ k: 0, a: 1, b: 1, a0: 1, b0: 0, volume: 1 });
assert(!eqBadK.ok && /Kc must be greater than 0/.test(eqBadK.error), "equilibrium: K = 0 is refused");
const eqNegK = solveEquilibrium({ k: -2, a: 1, b: 1, a0: 1, b0: 0, volume: 1 });
assert(!eqNegK.ok, "equilibrium: negative K is refused");
const eqNan = solveEquilibrium({ k: Number.NaN, a: 1, b: 1, a0: 1, b0: 0, volume: 1 });
assert(!eqNan.ok && /finite/.test(eqNan.error), "equilibrium: NaN is refused");
const eqCoeff = solveEquilibrium({ k: 4, a: 0, b: 1, a0: 1, b0: 0, volume: 1 });
assert(!eqCoeff.ok && /1–4/.test(eqCoeff.error), "equilibrium: coefficient 0 is refused");
const eqBigCoeff = solveEquilibrium({ k: 4, a: 5, b: 1, a0: 1, b0: 0, volume: 1 });
assert(!eqBigCoeff.ok && /1–4/.test(eqBigCoeff.error), "equilibrium: coefficients above 4 are refused");
const eqNegative = solveEquilibrium({ k: 4, a: 1, b: 1, a0: -1, b0: 0, volume: 1 });
assert(!eqNegative.ok && /cannot be negative/.test(eqNegative.error), "equilibrium: negative amounts are refused");
const eqEmptyVessel = solveEquilibrium({ k: 4, a: 1, b: 1, a0: 0, b0: 0, volume: 1 });
assert(!eqEmptyVessel.ok && /empty vessel/.test(eqEmptyVessel.error), "equilibrium: an empty vessel is refused");
const eqNoVolume = solveEquilibrium({ k: 4, a: 1, b: 1, a0: 1, b0: 0, volume: 0 });
assert(!eqNoVolume.ok && /Volume must be greater/.test(eqNoVolume.error), "equilibrium: zero volume is refused");
const eqNegVolume = solveEquilibrium({ k: 4, a: 1, b: 1, a0: 1, b0: 0, volume: -1 });
assert(!eqNegVolume.ok, "equilibrium: negative volume is refused");

assert(EQUILIBRIUM_ASSUMPTIONS.length >= 5, "equilibrium: the model's limits are stated");
assert(
  EQUILIBRIUM_ASSUMPTIONS.some((a) => /feasible/.test(a)),
  "equilibrium: a balanced equation or a Kc never implies feasibility — stated out loud",
);

/* -------------------------------------------------------------------------- */

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
  console.error("Chemistry/Phase-4 tests FAILED");
  process.exit(1);
}
console.log("Chemistry/Phase-4 tests passed");
