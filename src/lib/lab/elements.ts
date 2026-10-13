/**
 * Element data for the Phase 4 chemistry lab (application-owned, bundled —
 * no network calls, no invented numbers).
 *
 * Sources:
 * - Symbols, names, atomic numbers: IUPAC element names/symbols (standard
 *   reference data).
 * - Standard atomic weights: CIAAW "Abridged Standard Atomic Weights 2024"
 *   (based on the Atomic Weights 2021 report),
 *   https://www.ciaaw.org/abridged-atomic-weights.htm — embedded only for
 *   elements whose abridged value was verified for this project. Elements
 *   without a weight entry are deliberately REFUSED by the molar-mass tools
 *   rather than guessed.
 * - Electronegativity (Pauling scale): standard published values, used only
 *   to choose the central atom of a Lewis structure.
 */

export interface ElementInfo {
  symbol: string;
  /** Atomic number Z. */
  z: number;
  name: string;
  /** Abridged standard atomic weight (g/mol), when bundled. */
  weight?: number;
  /** Pauling electronegativity, when bundled. */
  en?: number;
}

/** Full symbol table (Z = 1…118). */
const SYMBOLS: readonly string[] = [
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
  "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
  "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
  "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
  "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
  "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
  "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
  "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
];

const NAMES: readonly string[] = [
  "hydrogen", "helium", "lithium", "beryllium", "boron", "carbon",
  "nitrogen", "oxygen", "fluorine", "neon", "sodium", "magnesium",
  "aluminium", "silicon", "phosphorus", "sulfur", "chlorine", "argon",
  "potassium", "calcium", "scandium", "titanium", "vanadium", "chromium",
  "manganese", "iron", "cobalt", "nickel", "copper", "zinc", "gallium",
  "germanium", "arsenic", "selenium", "bromine", "krypton", "rubidium",
  "strontium", "yttrium", "zirconium", "niobium", "molybdenum",
  "technetium", "ruthenium", "rhodium", "palladium", "silver", "cadmium",
  "indium", "tin", "antimony", "tellurium", "iodine", "xenon", "caesium",
  "barium", "lanthanum", "cerium", "praseodymium", "neodymium",
  "promethium", "samarium", "europium", "gadolinium", "terbium",
  "dysprosium", "holmium", "erbium", "thulium", "ytterbium", "lutetium",
  "hafnium", "tantalum", "tungsten", "rhenium", "osmium", "iridium",
  "platinum", "gold", "mercury", "thallium", "lead", "bismuth",
  "polonium", "astatine", "radon", "francium", "radium", "actinium",
  "thorium", "protactinium", "uranium", "neptunium", "plutonium",
  "americium", "curium", "berkelium", "californium", "einsteinium",
  "fermium", "mendelevium", "nobelium", "lawrencium", "rutherfordium",
  "dubnium", "seaborgium", "bohrium", "hassium", "meitnerium",
  "darmstadtium", "roentgenium", "copernicium", "nihonium", "flerovium",
  "moscovium", "livermorium", "tennessine", "oganesson",
];

/**
 * Abridged standard atomic weights (g/mol) — CIAAW 2024 abridged table,
 * values verified against https://www.ciaaw.org/abridged-atomic-weights.htm.
 * Only these elements get molar-mass maths; others are refused honestly.
 */
const WEIGHTS: Readonly<Record<string, number>> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011,
  N: 14.007, O: 15.999, F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.95,
  K: 39.098, Ca: 40.078, Cr: 51.996, Mn: 54.938, Fe: 55.845, Cu: 63.546,
  Zn: 65.38, Br: 79.904, Ag: 107.87, Sn: 118.71, I: 126.9, Ba: 137.33,
  Pb: 207.2,
};

/** Pauling electronegativity — standard published values (main-group set). */
const ELECTRONEGATIVITY: Readonly<Record<string, number>> = {
  H: 2.2, Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44,
  F: 3.98, Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.9, P: 2.19, S: 2.58,
  Cl: 3.16, K: 0.82, Ca: 1.0, As: 2.18, Se: 2.55, Br: 2.96, I: 2.66,
};

function buildTable(): Record<string, ElementInfo> {
  const table: Record<string, ElementInfo> = {};
  for (let i = 0; i < SYMBOLS.length; i += 1) {
    const symbol = SYMBOLS[i];
    const info: ElementInfo = { symbol, z: i + 1, name: NAMES[i] };
    const weight = WEIGHTS[symbol];
    if (weight !== undefined) info.weight = weight;
    const en = ELECTRONEGATIVITY[symbol];
    if (en !== undefined) info.en = en;
    table[symbol] = info;
  }
  return table;
}

export const ELEMENTS: Readonly<Record<string, ElementInfo>> = buildTable();

/** All element symbols, in atomic-number order. */
export const ELEMENT_SYMBOLS: readonly string[] = SYMBOLS;

/** Case-insensitive lookup: "cl" → chlorine's entry. */
export function findElement(symbol: string): ElementInfo | null {
  if (typeof symbol !== "string" || symbol.length === 0) return null;
  const canonical =
    symbol.charAt(0).toUpperCase() + symbol.slice(1).toLowerCase();
  return ELEMENTS[canonical] ?? null;
}

/** Standard atomic weight (g/mol) or null when not bundled. */
export function atomicWeight(symbol: string): number | null {
  return findElement(symbol)?.weight ?? null;
}

/** Chemical group (1, 2, 13–18) for main-group s/p elements, else null. */
export function mainGroup(symbol: string): number | null {
  const info = findElement(symbol);
  if (!info) return null;
  const z = info.z;
  if (z === 1) return 1; // H
  if (z === 2) return 18; // He
  // Periods 2–3 (Li…Ar): two octets — 1, 2, then 13…18.
  if (z >= 3 && z <= 18) {
    const inOctet = (z - 3) % 8; // 0…7 within each octet
    return inOctet < 2 ? inOctet + 1 : inOctet - 2 + 13;
  }
  // Period 4: K, Ca are groups 1, 2; Ga…Kr are 13…18; Sc…Zn are
  // transition metals with no single main group.
  if (z >= 19 && z <= 36) {
    if (z <= 20) return z - 18; // K=1, Ca=2
    if (z >= 31) return z - 31 + 13; // Ga=13 … Kr=18
    return null; // Sc…Zn
  }
  // Noble gases of the later periods (Kr=36 already covered above).
  if (z === 54 || z === 86 || z === 118) return 18;
  return null; // transition metals / f-block — not a single main group
}

/**
 * Lewis-capable elements: main-group atoms whose octet/duet behaviour is
 * well defined at this level. Transition metals are refused by the Lewis
 * solver with an honest message rather than given a made-up structure.
 */
export const LEWIS_ALLOWED: ReadonlySet<string> = new Set([
  "H", "Be", "B", "C", "N", "O", "F", "Al", "Si", "P", "S", "Cl", "Br", "I",
]);
