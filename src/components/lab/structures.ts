/**
 * Bundled molecular structures for the Phase 4 3D viewer.
 *
 * HONESTY RULES FOR THIS FILE:
 * - Coordinates are built IN CODE from published gas-phase structural
 *   parameters (bond lengths to ±0.01 Å, angles to ±1° — the values printed
 *   in every A-level/IB chemistry data booklet). Nothing here is guessed by
 *   a model or fetched at runtime; the parameters used are printed next to
 *   every molecule so the student can check them.
 * - A geometry shows molecular SHAPE and bond order only. It is a picture,
 *   never evidence that a reaction happens, how fast it is, or what it
 *   produces — the viewer UI repeats that warning.
 *
 * No network, no invented crystal structures: only small molecules whose
 * textbook geometry is unambiguous.
 */

export interface MoleculeAtom {
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface MoleculeBond {
  from: number;
  to: number;
  order: number;
}

export interface MoleculeStructure {
  id: string;
  name: string;
  formula: string;
  atoms: MoleculeAtom[];
  bonds: MoleculeBond[];
  /** The structural parameters the coordinates are built from (Å / degrees). */
  geometry: string;
  /** Source note shown next to the model. */
  source: string;
}

const SOURCE_FOOTER =
  "Coordinates are generated in code from these published parameters (typical accuracy ±0.01 Å / ±1°).";

const R2D = 180 / Math.PI;

function diatomic(
  id: string,
  name: string,
  a: string,
  b: string,
  r: number,
  order: number,
  geometry: string,
): MoleculeStructure {
  return {
    id,
    name,
    formula: `${a}${b}`,
    atoms: [
      { element: a, x: -r / 2, y: 0, z: 0 },
      { element: b, x: r / 2, y: 0, z: 0 },
    ],
    bonds: [{ from: 0, to: 1, order }],
    geometry,
    source: SOURCE_FOOTER,
  };
}

/** Water: r(O–H) = 0.9584 Å, ∠HOH = 104.45° (gas-phase equilibrium). */
function water(): MoleculeStructure {
  const r = 0.9584;
  const angle = (104.45 / 2) * (Math.PI / 180);
  const hx = r * Math.sin(angle);
  const hy = r * Math.cos(angle);
  return {
    id: "water",
    name: "Water",
    formula: "H2O",
    atoms: [
      { element: "O", x: 0, y: 0, z: 0 },
      { element: "H", x: hx, y: hy, z: 0 },
      { element: "H", x: -hx, y: hy, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 1 },
      { from: 0, to: 2, order: 1 },
    ],
    geometry: "r(O–H) = 0.9584 Å, ∠H–O–H = 104.45°",
    source: SOURCE_FOOTER,
  };
}

/** Methane: tetrahedral, r(C–H) = 1.087 Å. */
function methane(): MoleculeStructure {
  const r = 1.087;
  const s = r / Math.sqrt(3);
  const dirs: [number, number, number][] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  return {
    id: "methane",
    name: "Methane",
    formula: "CH4",
    atoms: [
      { element: "C", x: 0, y: 0, z: 0 },
      ...dirs.map(([dx, dy, dz]) => ({ element: "H", x: dx * s, y: dy * s, z: dz * s })),
    ],
    bonds: [0, 1, 2, 3].map((index) => ({ from: 0, to: index + 1, order: 1 })),
    geometry: "tetrahedral, r(C–H) = 1.087 Å, ∠H–C–H = 109.5°",
    source: SOURCE_FOOTER,
  };
}

/** Ammonia: trigonal pyramidal, r(N–H) = 1.012 Å, ∠HNH = 106.7°. */
function ammonia(): MoleculeStructure {
  const r = 1.012;
  const hnh = (106.7 * Math.PI) / 180;
  // Angle β between each N–H bond and the C₃ axis: cos²β = (cosθ + ½)/1.5.
  const cosBeta = Math.sqrt((Math.cos(hnh) + 0.5) / 1.5);
  const sinBeta = Math.sqrt(1 - cosBeta * cosBeta);
  const atoms: MoleculeAtom[] = [{ element: "N", x: 0, y: 0, z: 0 }];
  for (let i = 0; i < 3; i += 1) {
    const phi = ((120 * i) * Math.PI) / 180;
    atoms.push({
      element: "H",
      x: r * sinBeta * Math.cos(phi),
      y: -r * cosBeta,
      z: r * sinBeta * Math.sin(phi),
    });
  }
  return {
    id: "ammonia",
    name: "Ammonia",
    formula: "NH3",
    atoms,
    bonds: [1, 2, 3].map((index) => ({ from: 0, to: index, order: 1 })),
    geometry: "trigonal pyramidal, r(N–H) = 1.012 Å, ∠H–N–H = 106.7°",
    source: SOURCE_FOOTER,
  };
}

/** Carbon dioxide: linear, r(C=O) = 1.16 Å. */
function carbonDioxide(): MoleculeStructure {
  return {
    id: "carbon-dioxide",
    name: "Carbon dioxide",
    formula: "CO2",
    atoms: [
      { element: "O", x: -1.16, y: 0, z: 0 },
      { element: "C", x: 0, y: 0, z: 0 },
      { element: "O", x: 1.16, y: 0, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 2 },
    ],
    geometry: "linear, r(C=O) = 1.160 Å, ∠O–C–O = 180°",
    source: SOURCE_FOOTER,
  };
}

/** Ethene: planar, r(C=C) = 1.339 Å, r(C–H) = 1.086 Å, ∠HCH ≈ 117.8°. */
function ethene(): MoleculeStructure {
  const halfCC = 1.339 / 2;
  const ch = 1.086;
  const halfHCH = (117.8 / 2) * (Math.PI / 180);
  const dirX = -Math.cos(halfHCH);
  const dirY = Math.sin(halfHCH);
  return {
    id: "ethene",
    name: "Ethene",
    formula: "C2H4",
    atoms: [
      { element: "C", x: -halfCC, y: 0, z: 0 },
      { element: "C", x: halfCC, y: 0, z: 0 },
      { element: "H", x: -halfCC + ch * dirX, y: ch * dirY, z: 0 },
      { element: "H", x: -halfCC + ch * dirX, y: -ch * dirY, z: 0 },
      { element: "H", x: halfCC - ch * dirX, y: ch * dirY, z: 0 },
      { element: "H", x: halfCC - ch * dirX, y: -ch * dirY, z: 0 },
    ],
    bonds: [
      { from: 0, to: 1, order: 2 },
      { from: 0, to: 2, order: 1 },
      { from: 0, to: 3, order: 1 },
      { from: 1, to: 4, order: 1 },
      { from: 1, to: 5, order: 1 },
    ],
    geometry: "planar, r(C=C) = 1.339 Å, r(C–H) = 1.086 Å, ∠H–C–H = 117.8°",
    source: SOURCE_FOOTER,
  };
}

/** Benzene: planar hexagon, r(C–C) = 1.397 Å, r(C–H) = 1.084 Å (Kekulé form drawn). */
function benzene(): MoleculeStructure {
  const ring = 1.397;
  const outer = ring + 1.084;
  const atoms: MoleculeAtom[] = [];
  for (let i = 0; i < 6; i += 1) {
    const phi = ((60 * i) * Math.PI) / 180;
    atoms.push({ element: "C", x: ring * Math.cos(phi), y: ring * Math.sin(phi), z: 0 });
  }
  for (let i = 0; i < 6; i += 1) {
    const phi = ((60 * i) * Math.PI) / 180;
    atoms.push({ element: "H", x: outer * Math.cos(phi), y: outer * Math.sin(phi), z: 0 });
  }
  const bonds: MoleculeBond[] = [];
  for (let i = 0; i < 6; i += 1) {
    bonds.push({ from: i, to: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1 });
    bonds.push({ from: i, to: i + 6, order: 1 });
  }
  return {
    id: "benzene",
    name: "Benzene",
    formula: "C6H6",
    atoms,
    bonds,
    geometry: "planar hexagon, r(C–C) = 1.397 Å (equal all round), r(C–H) = 1.084 Å",
    source: `${SOURCE_FOOTER} The drawing shows one Kekulé structure; the real ring has delocalised electrons (resonance).`,
  };
}

/** Sulfur hexafluoride: octahedral, r(S–F) = 1.564 Å. */
function sulfurHexafluoride(): MoleculeStructure {
  const r = 1.564;
  return {
    id: "sulfur-hexafluoride",
    name: "Sulfur hexafluoride",
    formula: "SF6",
    atoms: [
      { element: "S", x: 0, y: 0, z: 0 },
      { element: "F", x: r, y: 0, z: 0 },
      { element: "F", x: -r, y: 0, z: 0 },
      { element: "F", x: 0, y: r, z: 0 },
      { element: "F", x: 0, y: -r, z: 0 },
      { element: "F", x: 0, y: 0, z: r },
      { element: "F", x: 0, y: 0, z: -r },
    ],
    bonds: [1, 2, 3, 4, 5, 6].map((index) => ({ from: 0, to: index, order: 1 })),
    geometry: "octahedral, r(S–F) = 1.564 Å, ∠F–S–F = 90° and 180°",
    source: `${SOURCE_FOOTER} The expanded octet on sulfur is shown as ordinary single bonds (a common simplified depiction).`,
  };
}

/** Hydrogen chloride: r(H–Cl) = 1.2745 Å. */
function hydrogenChloride(): MoleculeStructure {
  const structure = diatomic(
    "hydrogen-chloride",
    "Hydrogen chloride",
    "H",
    "Cl",
    1.2745,
    1,
    "diatomic, r(H–Cl) = 1.2745 Å",
  );
  return structure;
}

export const MOLECULES: readonly MoleculeStructure[] = [
  water(),
  methane(),
  ammonia(),
  carbonDioxide(),
  diatomic("nitrogen", "Nitrogen gas", "N", "N", 1.0976, 3, "diatomic, r(N≡N) = 1.0976 Å, triple bond"),
  diatomic("oxygen", "Oxygen gas", "O", "O", 1.208, 2, "diatomic, r(O=O) = 1.208 Å, double bond"),
  diatomic("hydrogen", "Hydrogen gas", "H", "H", 0.7414, 1, "diatomic, r(H–H) = 0.7414 Å"),
  hydrogenChloride(),
  ethene(),
  benzene(),
  sulfurHexafluoride(),
];

/**
 * Render a structure as a V2000 molfile (the format 3Dmol.js reads).
 * Built here — from the vetted coordinates above — so nothing parsed at
 * runtime can carry surprises.
 */
export function toMolfile(structure: MoleculeStructure): string {
  const lines: string[] = [
    structure.name,
    "  Phase4Lab",
    "",
    `${String(structure.atoms.length).padStart(3)}${String(structure.bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
  ];
  for (const atom of structure.atoms) {
    lines.push(
      `${atom.x.toFixed(4).padStart(10)}${atom.y.toFixed(4).padStart(10)}${atom.z.toFixed(4).padStart(10)} ${atom.element.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`,
    );
  }
  for (const bond of structure.bonds) {
    lines.push(`${String(bond.from + 1).padStart(3)}${String(bond.to + 1).padStart(3)}${String(bond.order).padStart(3)}  0`);
  }
  lines.push("M  END");
  return lines.join("\n");
}

/** Find a bundled molecule by id (used by Ashy's pre-filled lab tool). */
export function findMolecule(query: string): MoleculeStructure | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return null;
  return (
    MOLECULES.find(
      (molecule) =>
        molecule.id === needle ||
        molecule.formula.toLowerCase() === needle ||
        molecule.name.toLowerCase() === needle,
    ) ?? null
  );
}
